import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { getEventSettings } from '@/lib/whatsapp-engine/event-settings';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const instance = db.getInstance(id);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { ...instance, event_settings: getEventSettings(instance) } });
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

    const eventSettings = getEventSettings({ ...current, event_settings: body.event_settings });
    db.updateInstance(id, {
      ai_enabled: body.ai_enabled ?? true,
      n8n_webhook_url: body.n8n_webhook_url || null,
      agent_mode: body.agent_mode || 'text_only',
      allow_groups: eventSettings.groups.send_group_messages_to_ai,
      ignore_groups: eventSettings.groups.ignore_group_messages,
      reject_calls: eventSettings.calls.auto_reject_calls,
      msg_call: eventSettings.calls.auto_reply_text || null,
      event_settings: eventSettings,
    });

    return NextResponse.json({ success: true, data: db.getInstance(id) });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
