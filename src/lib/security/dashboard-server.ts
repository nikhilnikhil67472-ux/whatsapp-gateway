import { cookies } from 'next/headers';
import {
  DASHBOARD_COOKIE,
  DashboardSession,
  dashboardAuthConfigured,
  readDashboardSession,
} from './dashboard-auth';

export async function getServerDashboardSession(): Promise<DashboardSession> {
  const cookieStore = await cookies();
  const session = readDashboardSession(cookieStore.get(DASHBOARD_COOKIE)?.value);
  if (session) return session;

  if (process.env.NODE_ENV !== 'production' && !dashboardAuthConfigured()) {
    return {
      expiresAt: Date.now() + 60 * 60 * 1_000,
      userId: 'user_admin',
      organizationId: 'org_default',
      role: 'admin',
      email: 'admin@localhost',
    };
  }

  throw new Error('Dashboard session is unavailable');
}
