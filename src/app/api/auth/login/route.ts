import { NextRequest, NextResponse } from 'next/server';
import {
  DASHBOARD_COOKIE,
  createDashboardSession,
  dashboardAuthConfigured,
  shouldUseSecureDashboardCookie,
  verifyDashboardPassword,
} from '@/lib/security/dashboard-auth';

export async function POST(request: NextRequest) {
  if (!dashboardAuthConfigured()) {
    return NextResponse.json(
      { error: 'Set DASHBOARD_PASSWORD and a 32+ character AUTH_SECRET on the server.' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null) as { password?: string } | null;
  if (!body?.password || !verifyDashboardPassword(body.password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set(DASHBOARD_COOKIE, createDashboardSession(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureDashboardCookie({
      forwardedProtocol: request.headers.get('x-forwarded-proto'),
      requestProtocol: request.nextUrl.protocol,
    }),
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
