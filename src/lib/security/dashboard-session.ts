import { NextRequest } from 'next/server';
import {
  DASHBOARD_COOKIE,
  DashboardRole,
  dashboardAuthConfigured,
  readDashboardSession,
} from './dashboard-auth';

const roleRank: Record<DashboardRole, number> = {
  viewer: 1,
  developer: 2,
  admin: 3,
};

export function getDashboardSession(request: NextRequest) {
  return readDashboardSession(request.cookies.get(DASHBOARD_COOKIE)?.value);
}

export function requireDashboardRole(
  request: NextRequest,
  minimumRole: DashboardRole = 'viewer',
) {
  const session = getDashboardSession(request) || (
    process.env.NODE_ENV !== 'production' && !dashboardAuthConfigured()
      ? {
          expiresAt: Date.now() + 60 * 60 * 1_000,
          userId: 'user_admin',
          organizationId: 'org_default',
          role: 'admin' as const,
          email: 'admin@localhost',
        }
      : null
  );
  if (!session) {
    return {
      ok: false as const,
      status: 401,
      error: 'Dashboard login required',
    };
  }
  if (roleRank[session.role] < roleRank[minimumRole]) {
    return {
      ok: false as const,
      status: 403,
      error: `${minimumRole} role required`,
    };
  }
  return { ok: true as const, session };
}
