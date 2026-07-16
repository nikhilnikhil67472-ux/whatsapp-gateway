import { NextRequest, NextResponse } from 'next/server';
import {
  DASHBOARD_COOKIE,
  createDashboardSession,
  dashboardAuthConfigured,
  shouldUseSecureDashboardCookie,
  verifyDashboardPassword,
} from '@/lib/security/dashboard-auth';
import { db } from '@/lib/db/sqlite';
import { verifyPassword } from '@/lib/security/password';
import { checkRateLimit } from '@/lib/security/rate-limit';

export async function POST(request: NextRequest) {
  if (!dashboardAuthConfigured()) {
    return NextResponse.json(
      { error: 'Set DASHBOARD_PASSWORD and a 32+ character AUTH_SECRET on the server.' },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => null) as {
    email?: string;
    password?: string;
  } | null;
  const requestIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rateLimit = await checkRateLimit({
    key: `dashboard-login:${requestIp}`,
    limit: Number(process.env.DASHBOARD_LOGIN_RATE_LIMIT_PER_MINUTE || 10),
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many login attempts. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    );
  }
  if (!body?.password) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  let claims: Parameters<typeof createDashboardSession>[0] | null = null;
  if (body.email?.trim()) {
    const normalizedEmail = body.email.trim().toLowerCase();
    const user = db.getUserByEmail(normalizedEmail);
    const membership = user ? db.getUserMembership(user.id) : null;
    const bootstrapAdminMatch = verifyDashboardPassword(body.password) && (
      user?.id === 'user_admin'
      || normalizedEmail === (process.env.ADMIN_EMAIL || 'admin@localhost').toLowerCase()
    );
    if (user && membership && (
      verifyPassword(body.password, user.password_hash)
      || bootstrapAdminMatch
    )) {
      claims = {
        userId: user.id,
        organizationId: membership.organization_id,
        role: membership.role,
        email: user.email,
      };
    } else if (bootstrapAdminMatch) {
      claims = {
        userId: 'user_admin',
        organizationId: 'org_default',
        role: 'admin',
        email: process.env.ADMIN_EMAIL || normalizedEmail,
      };
    }
  } else if (verifyDashboardPassword(body.password)) {
    claims = {
      userId: 'user_admin',
      organizationId: 'org_default',
      role: 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@localhost',
    };
  }
  if (!claims) {
    db.addAuditLog({
      organization_id: 'org_default',
      action: 'auth.login_failed',
      target_type: 'dashboard',
      ip_address: requestIp,
      user_agent: request.headers.get('user-agent'),
      metadata: { email: body.email?.trim() || null },
    });
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
  }

  db.addAuditLog({
    organization_id: claims.organizationId,
    user_id: claims.userId,
    action: 'auth.login_succeeded',
    target_type: 'dashboard',
    ip_address: requestIp,
    user_agent: request.headers.get('user-agent'),
  });
  const response = NextResponse.json({ success: true });
  response.cookies.set(DASHBOARD_COOKIE, createDashboardSession(claims), {
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
