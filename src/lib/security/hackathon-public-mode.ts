import type { DashboardSession } from './dashboard-auth';

type HeaderReader = {
  get(name: string): string | null;
};

function normalizeHostname(value?: string | null) {
  const candidate = value?.split(',')[0]?.trim().toLowerCase();
  if (!candidate) return null;

  try {
    const url = new URL(candidate.includes('://') ? candidate : `http://${candidate}`);
    return url.hostname.replace(/\.$/, '');
  } catch {
    return null;
  }
}

function configuredPublicHostname() {
  if (process.env.HACKATHON_PUBLIC_MODE !== 'true') return null;
  return normalizeHostname(process.env.HACKATHON_PUBLIC_HOST);
}

export function isHackathonPublicModeConfigured() {
  return Boolean(configuredPublicHostname());
}

export function isHackathonPublicHeaders(headers: HeaderReader) {
  const configuredHostname = configuredPublicHostname();
  if (!configuredHostname) return false;

  const requestHostname = normalizeHostname(
    headers.get('host') || headers.get('x-forwarded-host'),
  );
  return requestHostname === configuredHostname;
}

export function isHackathonPublicRequest(request: Request) {
  if (isHackathonPublicHeaders(request.headers)) return true;
  if (request.headers.get('host') || request.headers.get('x-forwarded-host')) return false;

  try {
    return normalizeHostname(new URL(request.url).hostname) === configuredPublicHostname();
  } catch {
    return false;
  }
}

export function createHackathonPublicSession(): DashboardSession {
  return {
    expiresAt: Date.now() + 60 * 60 * 1_000,
    userId: 'user_admin',
    organizationId: 'org_default',
    role: 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@localhost',
  };
}
