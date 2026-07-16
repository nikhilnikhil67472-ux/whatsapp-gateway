import crypto from 'crypto';

export function generateApiKey() {
  return `wag_${crypto.randomBytes(24).toString('base64url')}`;
}

export function hashApiKey(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function readApiKey(request: Request) {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }
  return request.headers.get('x-api-key')?.trim() || null;
}

export function authorizeGatewayRequest(request: Request, instance?: { api_key_hash?: string | null }) {
  const supplied = readApiKey(request);
  const globalKey = process.env.GATEWAY_API_KEY;
  const insecureAllowed = process.env.ALLOW_INSECURE_API === 'true' || process.env.NODE_ENV !== 'production';

  if (!globalKey && !instance?.api_key_hash) {
    return insecureAllowed
      ? { ok: true as const }
      : {
          ok: false as const,
          status: 503,
          error: 'API authentication is not configured. Set GATEWAY_API_KEY.',
        };
  }

  if (!supplied) {
    return { ok: false as const, status: 401, error: 'Missing API key' };
  }

  const globalMatch = globalKey ? safeEqual(hashApiKey(supplied), hashApiKey(globalKey)) : false;
  const instanceMatch = instance?.api_key_hash
    ? safeEqual(hashApiKey(supplied), instance.api_key_hash)
    : false;

  return globalMatch || instanceMatch
    ? { ok: true as const }
    : { ok: false as const, status: 403, error: 'Invalid API key' };
}
