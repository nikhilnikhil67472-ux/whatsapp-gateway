import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ templateId: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { templateId } = await params;
  const deleted = db.deleteTemplate(templateId, auth.session.organizationId);
  if (!deleted) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    action: 'template.deleted',
    target_type: 'message_template',
    target_id: templateId,
  });
  return NextResponse.json({ success: true });
}
