import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/sqlite';
import { hashPassword } from '@/lib/security/password';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const userSchema = z.object({
  email: z.string().trim().email().max(320),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(10).max(256),
  role: z.enum(['admin', 'developer', 'viewer']).default('viewer'),
});

function publicUser(user: any) {
  const safe = { ...user };
  delete safe.password_hash;
  return safe;
}

export async function GET(request: NextRequest) {
  const auth = requireDashboardRole(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({
    success: true,
    data: db.listUsers(auth.session.organizationId).map(publicUser),
  });
}

export async function POST(request: NextRequest) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = userSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid team member', details: parsed.error.issues }, { status: 400 });
  }
  if (db.getUserByEmail(parsed.data.email)) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
  }
  const userId = db.createUser({
    organization_id: auth.session.organizationId,
    email: parsed.data.email,
    name: parsed.data.name,
    password_hash: hashPassword(parsed.data.password),
    role: parsed.data.role,
  });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    action: 'team.user_created',
    target_type: 'user',
    target_id: userId,
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });
  return NextResponse.json({ success: true, id: userId }, { status: 201 });
}
