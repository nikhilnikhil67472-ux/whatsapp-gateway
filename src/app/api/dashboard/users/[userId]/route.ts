import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const roleSchema = z.object({
  role: z.enum(['admin', 'developer', 'viewer']),
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = roleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  const { userId } = await params;
  const member = db.listUsers(auth.session.organizationId)
    .find((user: any) => user.id === userId) as any;
  if (!member) return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
  if (userId === auth.session.userId && parsed.data.role !== 'admin') {
    return NextResponse.json({ error: 'You cannot remove your own admin access' }, { status: 400 });
  }
  if (
    member.role === 'admin'
    && parsed.data.role !== 'admin'
    && db.listUsers(auth.session.organizationId).filter((user: any) => user.role === 'admin').length <= 1
  ) {
    return NextResponse.json({ error: 'The organization must keep at least one admin' }, { status: 400 });
  }
  db.updateUserRole(userId, auth.session.organizationId, parsed.data.role);
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    action: 'team.role_updated',
    target_type: 'user',
    target_id: userId,
    metadata: { role: parsed.data.role },
  });
  return NextResponse.json({ success: true });
}
