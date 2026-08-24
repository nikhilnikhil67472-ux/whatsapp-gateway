import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  DASHBOARD_COOKIE,
  createDashboardSession,
  dashboardAuthConfigured,
  shouldUseSecureDashboardCookie,
} from '@/lib/security/dashboard-auth';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/security/password';
import { checkRateLimit } from '@/lib/security/rate-limit';

const DASHBOARD_ROLES = ['admin', 'developer', 'viewer'] as const;

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(256),
});

function defaultSignupRole() {
  const requested = process.env.SIGNUP_DEFAULT_ROLE;
  return (DASHBOARD_ROLES as readonly string[]).includes(requested || '')
    ? requested as (typeof DASHBOARD_ROLES)[number]
    : 'developer';
}

export async function POST(request: NextRequest) {
  if (!dashboardAuthConfigured()) {
    return NextResponse.json(
      { error: 'Set DASHBOARD_PASSWORD and a 32+ character AUTH_SECRET on the server.' },
      { status: 503 },
    );
  }
  if (process.env.SIGNUP_DISABLED === '1') {
    return NextResponse.json({ error: 'Sign up is disabled on this server.' }, { status: 403 });
  }

  const requestIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const rateLimit = await checkRateLimit({
    key: `dashboard-register:${requestIp}`,
    limit: Number(process.env.DASHBOARD_REGISTER_RATE_LIMIT_PER_MINUTE || 5),
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many sign-up attempts. Try again shortly.' },
      {
        status: 429,
        headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Name (2+ characters), valid email, and a 10+ character password are required.' },
      { status: 400 },
    );
  }

  const normalizedEmail = parsed.data.email.toLowerCase();
  if (db.getUserByEmail(normalizedEmail)) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
  }

  const userId = db.createUser({
    organization_id: 'org_default',
    email: normalizedEmail,
    name: parsed.data.name,
    password_hash: hashPassword(parsed.data.password),
    role: defaultSignupRole(),
  });
  const membership = db.getUserMembership(userId);

  db.addAuditLog({
    organization_id: membership?.organization_id || 'org_default',
    user_id: userId,
    action: 'auth.user_registered',
    target_type: 'user',
    target_id: userId,
    ip_address: requestIp,
    user_agent: request.headers.get('user-agent'),
    metadata: { email: normalizedEmail },
  });

  const response = NextResponse.json({ success: true }, { status: 201 });
  response.cookies.set(DASHBOARD_COOKIE, createDashboardSession({
    userId,
    organizationId: membership?.organization_id || 'org_default',
    role: membership?.role || defaultSignupRole(),
    email: normalizedEmail,
  }), {
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
