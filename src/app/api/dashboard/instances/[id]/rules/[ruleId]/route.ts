import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id, ruleId } = await params;
  if (!db.getInstance(id, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }
  const rule = db.listAutoReplyRules(id).find((item: any) => item.id === ruleId);
  if (!rule || !db.deleteAutoReplyRule(ruleId, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
  }
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: id,
    action: 'auto_reply_rule.deleted',
    target_type: 'auto_reply_rule',
    target_id: ruleId,
  });
  return NextResponse.json({ success: true });
}
