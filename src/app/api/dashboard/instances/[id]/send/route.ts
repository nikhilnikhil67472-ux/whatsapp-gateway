import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { enqueueOutboundMessage } from '@/lib/queue/enqueue';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

const schema = z.object({
  phoneNumber: z.string().min(7).max(30),
  text: z.string().min(1).max(65_536),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireDashboardRole(request, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid test message', details: parsed.error.issues }, { status: 400 });
  }
  const { id } = await params;
  const instance = db.getInstance(id, auth.session.organizationId);
  if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
  if (instance.status === 'deleting') {
    return NextResponse.json({ error: 'Instance deletion is in progress' }, { status: 409 });
  }
  const digits = parsed.data.phoneNumber.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return NextResponse.json({ error: 'Use a valid country-code phone number' }, { status: 400 });
  }
  const remoteJid = `${digits}@s.whatsapp.net`;
  const outboundId = await enqueueOutboundMessage({
    instance_id: id,
    organization_id: instance.organization_id,
    conversation_id: `${id}_${remoteJid}`,
    remote_jid: remoteJid,
    reply_type: 'text',
    text_content: parsed.data.text,
  });
  db.addAuditLog({
    organization_id: auth.session.organizationId,
    user_id: auth.session.userId,
    instance_id: id,
    action: 'message.test_queued',
    target_type: 'outbound_message',
    target_id: outboundId,
    metadata: { remote_jid: remoteJid },
  });
  return NextResponse.json({ success: true, id: outboundId, queued: true });
}
