import dns from 'dns/promises';
import net from 'net';

function isPrivateIp(address: string) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split('.').map(Number);
    return (
      a === 10
      || a === 127
      || a === 0
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127)
      || a >= 224
    );
  }

  if (net.isIPv6(address)) {
    const normalized = address.toLowerCase();
    return (
      normalized === '::1'
      || normalized === '::'
      || normalized.startsWith('fc')
      || normalized.startsWith('fd')
      || normalized.startsWith('fe8')
      || normalized.startsWith('fe9')
      || normalized.startsWith('fea')
      || normalized.startsWith('feb')
    );
  }

  return true;
}

function allowedHosts() {
  const hosts = new Set(
    (process.env.MEDIA_ALLOWED_HOSTS || '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  );

  if (process.env.APP_BASE_URL) {
    try {
      hosts.add(new URL(process.env.APP_BASE_URL).hostname.toLowerCase());
    } catch {
      // APP_BASE_URL validation is reported by the health endpoint.
    }
  }

  return hosts;
}

async function assertSafeUrl(url: URL) {
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS media URLs are supported');
  }
  if (url.username || url.password) throw new Error('Media URLs cannot contain credentials');

  const hostname = url.hostname.toLowerCase();
  if (allowedHosts().has(hostname)) return;

  const addresses = net.isIP(hostname)
    ? [{ address: hostname }]
    : await dns.lookup(hostname, { all: true, verbatim: true });

  if (!addresses.length || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error('Media URL resolves to a private or unsafe network address');
  }
}

export async function fetchRemoteMedia(input: string) {
  const maxBytes = Number(process.env.MAX_OUTBOUND_MEDIA_BYTES || 25 * 1024 * 1024);
  const timeoutMs = Number(process.env.MEDIA_FETCH_TIMEOUT_MS || 20_000);
  let url = new URL(input);

  for (let redirect = 0; redirect <= 3; redirect += 1) {
    await assertSafeUrl(url);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'whatsapp-gateway/2.0' },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Media URL returned HTTP ${response.status} without a redirect location`);
        url = new URL(location, url);
        continue;
      }

      if (!response.ok) throw new Error(`Media download failed with HTTP ${response.status}`);
      const declaredLength = Number(response.headers.get('content-length') || 0);
      if (declaredLength > maxBytes) throw new Error(`Media exceeds the ${maxBytes} byte limit`);
      if (!response.body) throw new Error('Media response did not include a body');

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new Error(`Media exceeds the ${maxBytes} byte limit`);
        }
        chunks.push(value);
      }

      return {
        buffer: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
        contentType: response.headers.get('content-type'),
        finalUrl: url.toString(),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Media download timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('Media URL exceeded the redirect limit');
}

export function decodeBase64Media(value: string) {
  const raw = (value.includes(',') ? value.slice(value.indexOf(',') + 1) : value).replace(/\s/g, '');
  if (!/^[a-zA-Z0-9+/]*={0,2}$/.test(raw) || raw.length % 4 === 1) {
    throw new Error('Base64 media is invalid');
  }
  const buffer = Buffer.from(raw, 'base64');
  const maxBytes = Number(process.env.MAX_OUTBOUND_MEDIA_BYTES || 25 * 1024 * 1024);
  if (!buffer.length) throw new Error('Base64 media is empty or invalid');
  if (buffer.length > maxBytes) throw new Error(`Media exceeds the ${maxBytes} byte limit`);
  return buffer;
}
