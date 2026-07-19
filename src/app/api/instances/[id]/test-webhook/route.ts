import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';
import { decrypt } from '@/lib/security/encrypt';
import { createWebhookHeaders } from '@/lib/webhooks/signature';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(req, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const instance = db.getInstance(id, auth.session.organizationId);
    if (!instance) return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    if (!instance.n8n_webhook_url) {
      return NextResponse.json({ error: 'Add your AI Automation Link before testing.' }, { status: 400 });
    }

    const samplePhone = '919999999999';
    const payload = {
      event: 'webhook.test',
      instance: {
        id,
        name: instance.instance_name,
        client_id: instance.client_id,
      },
      sender: {
        jid: `${samplePhone}@s.whatsapp.net`,
        phone_number: samplePhone,
        display_number: `+${samplePhone}`,
        push_name: 'Test Customer',
        is_group: false,
      },
      message: {
        id: 'test-message',
        whatsapp_id: 'test-whatsapp-message',
        from: `${samplePhone}@s.whatsapp.net`,
        from_number: samplePhone,
        push_name: 'Test Customer',
        is_group: false,
        type: 'text',
        text: 'Hello, this is a test message from WhatsApp AI Gateway.',
        caption: null,
      },
      media: null,
      history: [
        { role: 'user', text: 'Hello', timestamp: new Date().toISOString() },
      ],
      test: true,
      timestamp: new Date().toISOString(),
    };

    const start = Date.now();
    const serializedPayload = JSON.stringify(payload);
    const response = await fetch(instance.n8n_webhook_url, {
      method: 'POST',
      headers: createWebhookHeaders({
        payload: serializedPayload,
        eventType: 'webhook.test',
        deliveryId: crypto.randomUUID(),
        secret: instance.webhook_secret,
        authorization: instance.n8n_secret_encrypted
          ? decrypt(instance.n8n_secret_encrypted)
          : null,
      }),
      body: serializedPayload,
      signal: AbortSignal.timeout(Number(process.env.WEBHOOK_TIMEOUT_MS || 15_000)),
    });
    const rawText = await response.text();
    let responsePayload: any = rawText;
    try {
      responsePayload = JSON.parse(rawText);
    } catch {
      // Keep raw text.
    }

    db.addAuditLog({
      organization_id: auth.session.organizationId,
      user_id: auth.session.userId,
      instance_id: id,
      action: 'webhook.tested',
      target_type: 'instance',
      target_id: id,
      metadata: { status: response.status, duration_ms: Date.now() - start },
    });

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      durationMs: Date.now() - start,
      sentPayload: payload,
      response: responsePayload,
      hint: response.ok
        ? 'Webhook reached successfully. Make sure it returns reply text for live messages.'
        : 'Webhook did not return a success status. Check the n8n workflow URL and execution logs.',
    }, { status: response.ok ? 200 : 502 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Webhook test failed' }, { status: 500 });
  }
}
