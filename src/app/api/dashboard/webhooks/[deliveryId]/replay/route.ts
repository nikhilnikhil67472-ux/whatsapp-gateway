import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { publishQueueJob } from '@/lib/queue/redis';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deliveryId: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { deliveryId } = await params;
  const delivery = db.getWebhookDelivery(deliveryId);
  if (!delivery) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
  const instance = db.getInstance(delivery.instance_id, auth.session.organizationId);
  if (!instance) return NextResponse.json({ error: 'Delivery not found' }, { status: 404 });
  const replayId = db.replayWebhookDelivery(deliveryId);
  await publishQueueJob('webhook', replayId);
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: instance.id,
    action: 'webhook.replayed',
    target_type: 'webhook_delivery',
    target_id: replayId,
    metadata: { replayed_from_id: deliveryId },
  });
  return NextResponse.json({ success: true, deliveryId: replayId });
}
