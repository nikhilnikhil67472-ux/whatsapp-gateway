import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ apiKeyId: string }> },
) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { apiKeyId } = await params;
  const key = db.listUserApiKeys(auth.session.organizationId)
    .find((item: any) => item.id === apiKeyId);
  if (!key) return NextResponse.json({ error: 'API key not found' }, { status: 404 });
  db.revokeUserApiKey(apiKeyId);
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: key.instance_id,
    action: 'api_key.revoked',
    target_type: 'api_key',
    target_id: apiKeyId,
  });
  return NextResponse.json({ success: true });
}
