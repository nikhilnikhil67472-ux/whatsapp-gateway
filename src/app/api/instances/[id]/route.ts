import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { getEventSettings } from '@/lib/whatsapp-engine/event-settings';
import { toPublicInstance } from '@/lib/instances/public-instance';
import { encrypt } from '@/lib/security/encrypt';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const instance = db.getInstance(id);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    return NextResponse.json(
      { success: true, data: toPublicInstance(instance) },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const current = db.getInstance(id);
    if (!current) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    if (body.n8n_webhook_url) {
      let webhookUrl: URL;
      try {
        webhookUrl = new URL(body.n8n_webhook_url);
      } catch {
        return NextResponse.json({ error: 'Webhook URL is invalid' }, { status: 400 });
      }
      if (!['http:', 'https:'].includes(webhookUrl.protocol)) {
        return NextResponse.json({ error: 'Webhook URL must use HTTP or HTTPS' }, { status: 400 });
      }
    }
    if (typeof body.n8n_secret === 'string' && body.n8n_secret.length > 4_096) {
      return NextResponse.json({ error: 'Webhook bearer secret is too long' }, { status: 400 });
    }

    const eventSettings = getEventSettings({ ...current, event_settings: body.event_settings });
    const secretPatch: Record<string, string | null> = {};
    if (body.clear_n8n_secret === true) {
      secretPatch.n8n_secret_encrypted = null;
    } else if (typeof body.n8n_secret === 'string' && body.n8n_secret.trim()) {
      secretPatch.n8n_secret_encrypted = encrypt(body.n8n_secret.trim());
    }

    db.updateInstance(id, {
      ai_enabled: body.ai_enabled ?? true,
      n8n_webhook_url: body.n8n_webhook_url || null,
      agent_mode: body.agent_mode || 'text_only',
      allow_groups: eventSettings.groups.send_group_messages_to_ai,
      ignore_groups: eventSettings.groups.ignore_group_messages,
      reject_calls: eventSettings.calls.auto_reject_calls,
      msg_call: eventSettings.calls.auto_reply_text || null,
      event_settings: eventSettings,
      ...secretPatch,
    });

    return NextResponse.json({ success: true, data: toPublicInstance(db.getInstance(id)) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
