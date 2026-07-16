import { NextRequest, NextResponse } from 'next/server';
import {
  DASHBOARD_COOKIE,
  shouldUseSecureDashboardCookie,
} from '@/lib/security/dashboard-auth';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  response.cookies.set(DASHBOARD_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: shouldUseSecureDashboardCookie({
      forwardedProtocol: request.headers.get('x-forwarded-proto'),
      requestProtocol: request.nextUrl.protocol,
    }),
    path: '/',
    maxAge: 0,
  });
  return response;
}
