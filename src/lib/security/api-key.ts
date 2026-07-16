import crypto from 'crypto';
import { db } from '../db/sqlite';

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

function requestIp(request: Request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || null
  );
}

function ipv4ToNumber(value: string) {
  const parts = value.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((result, part) => (result << 8) + part, 0) >>> 0;
}

function ipMatches(ip: string, rule: string) {
  if (ip === rule) return true;
  const [network, prefixText] = rule.split('/');
  if (!prefixText) return false;
  const addressValue = ipv4ToNumber(ip);
  const networkValue = ipv4ToNumber(network);
  const prefix = Number(prefixText);
  if (addressValue === null || networkValue === null || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (addressValue & mask) === (networkValue & mask);
}

function enforceIpAllowlist(request: Request, allowlist: string[]) {
  if (!allowlist.length) return { ok: true as const };
  const ip = requestIp(request);
  if (!ip || !allowlist.some((rule) => ipMatches(ip, rule))) {
    return { ok: false as const, status: 403, error: 'Source IP is not allowed' };
  }
  return { ok: true as const };
}

export function authorizeGatewayRequest(
  request: Request,
  instance?: {
    id?: string;
    organization_id?: string | null;
    api_key_hash?: string | null;
  },
  requiredScope = 'messages:send',
) {
  const supplied = readApiKey(request);
  const globalKey = process.env.GATEWAY_API_KEY;
  const insecureAllowed = process.env.ALLOW_INSECURE_API === 'true' || process.env.NODE_ENV !== 'production';

  if (!supplied && !globalKey && !instance?.api_key_hash) {
    return insecureAllowed
      ? { ok: true as const, role: 'admin', source: 'insecure' as const }
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

  if (globalMatch) {
    const allowlist = (process.env.API_IP_ALLOWLIST || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const ipAllowed = enforceIpAllowlist(request, allowlist);
    return ipAllowed.ok
      ? {
          ok: true as const,
          role: 'admin',
          source: 'global' as const,
          organizationId: instance?.organization_id || 'org_default',
          apiKeyId: null,
          rateLimitKey: `global:${hashApiKey(supplied).slice(0, 16)}`,
        }
      : ipAllowed;
  }

  if (instanceMatch) {
    return {
      ok: true as const,
      role: 'developer',
      source: 'instance' as const,
      organizationId: instance?.organization_id || 'org_default',
      apiKeyId: null,
      rateLimitKey: `instance:${instance?.id || hashApiKey(supplied).slice(0, 16)}`,
    };
  }

  const userKey = db.findUserApiKeyByHash(hashApiKey(supplied));
  if (!userKey) {
    return { ok: false as const, status: 403, error: 'Invalid API key' };
  }
  if (
    instance?.organization_id
    && userKey.organization_id !== instance.organization_id
  ) {
    return { ok: false as const, status: 403, error: 'API key is not allowed for this organization' };
  }
  if (userKey.instance_id && userKey.instance_id !== instance?.id) {
    return { ok: false as const, status: 403, error: 'API key is not allowed for this instance' };
  }
  const scopes = userKey.scopes || [];
  if (userKey.role !== 'admin' && !scopes.includes('*') && !scopes.includes(requiredScope)) {
    return { ok: false as const, status: 403, error: `API key lacks ${requiredScope} scope` };
  }
  const ipAllowed = enforceIpAllowlist(request, userKey.ip_allowlist || []);
  if (!ipAllowed.ok) return ipAllowed;
  db.touchUserApiKey(userKey.id);
  return {
    ok: true as const,
    role: userKey.role,
    source: 'user' as const,
    organizationId: userKey.organization_id,
    userId: userKey.user_id,
    apiKeyId: userKey.id,
    rateLimitKey: `user-key:${userKey.id}`,
  };
}
