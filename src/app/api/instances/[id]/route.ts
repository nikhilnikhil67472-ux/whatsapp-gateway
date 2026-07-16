import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/sqlite';
import { getEventSettings } from '@/lib/whatsapp-engine/event-settings';
import { toPublicInstance } from '@/lib/instances/public-instance';
import { encrypt } from '@/lib/security/encrypt';
import { requireDashboardRole } from '@/lib/security/dashboard-session';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const instance = db.getInstance(id, auth.session.organizationId);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }
    return NextResponse.json(
      {
        success: true,
        data: toPublicInstance(instance, {
          includeWebhookSecret: auth.session.role !== 'viewer',
        }),
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireDashboardRole(req, 'developer');
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const { id } = await params;
    const body = await req.json();
    const current = db.getInstance(id, auth.session.organizationId);
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
    if (
      body.ai_provider
      && !['webhook', 'custom', 'openai', 'anthropic', 'none'].includes(body.ai_provider)
    ) {
      return NextResponse.json({ error: 'Unsupported AI provider' }, { status: 400 });
    }
    if (typeof body.ai_api_key === 'string' && body.ai_api_key.length > 8_192) {
      return NextResponse.json({ error: 'AI API key is too long' }, { status: 400 });
    }

    const eventSettings = getEventSettings({ ...current, event_settings: body.event_settings });
    const secretPatch: Record<string, string | null> = {};
    if (body.clear_n8n_secret === true) {
      secretPatch.n8n_secret_encrypted = null;
    } else if (typeof body.n8n_secret === 'string' && body.n8n_secret.trim()) {
      secretPatch.n8n_secret_encrypted = encrypt(body.n8n_secret.trim());
    }
    if (body.clear_ai_api_key === true) {
      secretPatch.ai_api_key_encrypted = null;
    } else if (typeof body.ai_api_key === 'string' && body.ai_api_key.trim()) {
      secretPatch.ai_api_key_encrypted = encrypt(body.ai_api_key.trim());
    }

    db.updateInstance(id, {
      ai_enabled: body.ai_enabled ?? true,
      ai_auto_reply: body.ai_auto_reply ?? true,
      ai_provider: body.ai_provider || 'webhook',
      ai_model: body.ai_model?.trim() || null,
      ai_system_prompt: body.ai_system_prompt?.trim() || null,
      ai_memory_messages: Math.max(1, Math.min(100, Number(body.ai_memory_messages || 20))),
      n8n_webhook_url: body.n8n_webhook_url || null,
      agent_mode: body.agent_mode || 'text_only',
      media_transcription_enabled: Boolean(body.media_transcription_enabled),
      media_vision_enabled: Boolean(body.media_vision_enabled),
      document_extraction_enabled: Boolean(body.document_extraction_enabled),
      storage_provider: ['local', 's3', 'minio'].includes(body.storage_provider)
        ? body.storage_provider
        : 'local',
      sandbox_mode: Boolean(body.sandbox_mode),
      outbound_per_minute: Math.max(1, Math.min(600, Number(body.outbound_per_minute || 30))),
      opt_out_keywords: Array.isArray(body.opt_out_keywords)
        ? body.opt_out_keywords.slice(0, 25)
        : current.opt_out_keywords,
      allow_groups: eventSettings.groups.send_group_messages_to_ai,
      ignore_groups: eventSettings.groups.ignore_group_messages,
      reject_calls: eventSettings.calls.auto_reject_calls,
      msg_call: eventSettings.calls.auto_reply_text || null,
      event_settings: eventSettings,
      ...secretPatch,
    });
    db.addAuditLog({
      organization_id: current.organization_id,
      user_id: auth.session.userId,
      instance_id: id,
      action: 'instance.settings_updated',
      target_type: 'instance',
      target_id: id,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent'),
      metadata: {
        ai_provider: body.ai_provider || 'webhook',
        sandbox_mode: Boolean(body.sandbox_mode),
      },
    });

    return NextResponse.json({
      success: true,
      data: toPublicInstance(
        db.getInstance(id, auth.session.organizationId),
        { includeWebhookSecret: true },
      ),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
