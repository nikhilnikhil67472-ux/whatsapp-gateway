import crypto from 'crypto';

export const DASHBOARD_COOKIE = 'wag_dashboard_session';
export type DashboardRole = 'admin' | 'developer' | 'viewer';
export type DashboardSession = {
  expiresAt: number;
  userId: string;
  organizationId: string;
  role: DashboardRole;
  email?: string | null;
};

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

export function createDashboardSession(
  claims: Omit<DashboardSession, 'expiresAt'> = {
    userId: 'user_admin',
    organizationId: 'org_default',
    role: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@localhost',
  },
) {
  const payload = Buffer.from(JSON.stringify({
    expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1_000,
    ...claims,
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readDashboardSession(token?: string | null): DashboardSession | null {
  if (!token || !dashboardAuthConfigured()) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<DashboardSession>;
    if (typeof decoded.expiresAt !== 'number' || decoded.expiresAt <= Date.now()) {
      return null;
    }

    // Sessions issued before team accounts existed only contained expiresAt.
    // Preserve them as the original bootstrap administrator until they expire.
    return {
      expiresAt: decoded.expiresAt,
      userId: decoded.userId || 'user_admin',
      organizationId: decoded.organizationId || 'org_default',
      role: ['admin', 'developer', 'viewer'].includes(decoded.role || '')
        ? decoded.role as DashboardRole
        : 'admin',
      email: decoded.email || process.env.ADMIN_EMAIL || 'admin@localhost',
    };
  } catch {
    return null;
  }
}

export function verifyDashboardSession(token?: string | null) {
  return Boolean(readDashboardSession(token));
}

export function verifyDashboardPassword(password: string) {
  const expected = process.env.DASHBOARD_PASSWORD || '';
  const left = Buffer.from(crypto.createHash('sha256').update(password).digest('hex'));
  const right = Buffer.from(crypto.createHash('sha256').update(expected).digest('hex'));
  return expected.length > 0 && crypto.timingSafeEqual(left, right);
}
