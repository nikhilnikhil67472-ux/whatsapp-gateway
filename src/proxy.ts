import { NextRequest, NextResponse } from 'next/server';
import {
  DASHBOARD_COOKIE,
  dashboardAuthConfigured,
  verifyDashboardSession,
} from '@/lib/security/dashboard-auth';
import { isHackathonPublicRequest } from '@/lib/security/hackathon-public-mode';

export function proxy(request: NextRequest) {
  if (isHackathonPublicRequest(request)) {
    return NextResponse.next();
  }

  if (!dashboardAuthConfigured()) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Dashboard authentication is not configured' },
        { status: 503 },
      );
    }
    return NextResponse.redirect(new URL('/login?configuration=missing', request.url));
  }

  if (verifyDashboardSession(request.cookies.get(DASHBOARD_COOKIE)?.value)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Dashboard login required' }, { status: 401 });
  }

  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/instances/:path*', '/api/dashboard/:path*'],
};
