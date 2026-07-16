import crypto from 'crypto';

export const DASHBOARD_COOKIE = 'wag_dashboard_session';

function authSecret() {
  return process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || '';
}

function sign(payload: string) {
  return crypto.createHmac('sha256', authSecret()).update(payload).digest('base64url');
}

export function dashboardAuthConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD && authSecret().length >= 32);
}

export function shouldUseSecureDashboardCookie({
  forwardedProtocol,
  requestProtocol,
}: {
  forwardedProtocol?: string | null;
  requestProtocol?: string | null;
}) {
  const protocol = forwardedProtocol?.split(',')[0]?.trim() || requestProtocol || '';
  return protocol.replace(/:$/, '').toLowerCase() === 'https';
}

export function createDashboardSession() {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1_000,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyDashboardSession(token?: string | null) {
  if (!token || !dashboardAuthConfigured()) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      expiresAt?: number;
    };
    return typeof decoded.expiresAt === 'number' && decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}

export function verifyDashboardPassword(password: string) {
  const expected = process.env.DASHBOARD_PASSWORD || '';
  const left = Buffer.from(crypto.createHash('sha256').update(password).digest('hex'));
  const right = Buffer.from(crypto.createHash('sha256').update(expected).digest('hex'));
  return expected.length > 0 && crypto.timingSafeEqual(left, right);
}
