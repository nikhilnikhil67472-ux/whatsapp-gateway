import { NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const instance = db.getInstance(id);
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
    const response = await fetch(instance.n8n_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const rawText = await response.text();
    let responsePayload: any = rawText;
    try {
      responsePayload = JSON.parse(rawText);
    } catch {
      // Keep raw text.
    }

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
