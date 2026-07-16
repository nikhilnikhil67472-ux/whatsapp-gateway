import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { enqueueWorkerCommand } from '@/lib/queue/enqueue';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(req, 'admin');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const instance = db.getInstance(id, auth.session.organizationId);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    db.updateInstance(id, { status: 'logout_requested', qr_base64: null });
    const commandId = await enqueueWorkerCommand(id, 'logout');
    db.addAuditLog({
      organization_id: auth.session.organizationId,
      user_id: auth.session.userId,
      instance_id: id,
      action: 'instance.logout_requested',
      target_type: 'instance',
      target_id: id,
    });
    return NextResponse.json({
      success: true,
      message: 'Logout requested. The background worker will remove the session.',
      commandId,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
