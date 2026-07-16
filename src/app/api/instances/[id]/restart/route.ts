import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { toPublicInstance } from '@/lib/instances/public-instance';
import { enqueueWorkerCommand } from '@/lib/queue/enqueue';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(req, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const instance = db.getInstance(id, auth.session.organizationId);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    db.updateInstance(id, {
      status: 'reconnecting',
      qr_base64: null,
      qr_updated_at: new Date().toISOString(),
    });
    const commandId = await enqueueWorkerCommand(id, 'restart');
    db.addAuditLog({
      organization_id: auth.session.organizationId,
      user_id: auth.session.userId,
      instance_id: id,
      action: 'instance.restart_requested',
      target_type: 'instance',
      target_id: id,
    });

    return NextResponse.json({
      success: true,
      message: 'Restart requested. The background worker will reconnect this instance.',
      commandId,
      data: toPublicInstance(db.getInstance(id, auth.session.organizationId)),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
