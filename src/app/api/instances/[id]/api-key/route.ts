import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { generateApiKey, hashApiKey } from '@/lib/security/api-key';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(request, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { id } = await params;
  if (!db.getInstance(id, auth.session.organizationId)) {
    return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  }

  const apiKey = generateApiKey();
  db.updateInstance(id, {
    api_key_hash: hashApiKey(apiKey),
    api_key_prefix: apiKey.slice(0, 10),
  });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: id,
    action: 'instance.api_key_rotated',
    target_type: 'instance',
    target_id: id,
  });

  return NextResponse.json({
    success: true,
    apiKey,
    note: 'The previous instance API key is now invalid.',
  });
}
