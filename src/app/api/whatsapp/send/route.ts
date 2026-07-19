import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { authorizeGatewayRequest } from '@/lib/security/api-key';
import { enqueueOutboundMessage } from '@/lib/queue/enqueue';
import { checkRateLimit } from '@/lib/security/rate-limit';
import { errorDetails, logger } from '@/lib/observability/logger';

export const dynamic = 'force-dynamic';

const sendSchema = z.object({
  instanceId: z.string().min(1),
  remoteJid: z.string().max(160).optional(),
  phoneNumber: z.string().max(30).optional(),
  type: z.enum(['text', 'media', 'audio', 'location', 'contact']),
  text: z.string().max(65_536).optional(),
  mediaUrl: z.string().url().max(2_048).optional(),
  base64: z.string().max(35_000_000).optional(),
  mediaType: z.enum(['image', 'video', 'document']).optional(),
  mimeType: z.string().max(200).optional(),
  fileName: z.string().max(180).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  locationName: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  contactName: z.string().max(200).optional(),
  vcard: z.string().max(20_000).optional(),
  quotedMessageId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
    }

    const {
      instanceId,
      type,
      text,
      mediaUrl,
      base64,
      mediaType,
      mimeType,
      fileName,
      latitude,
      longitude,
      locationName,
      address,
      contactName,
      vcard,
      quotedMessageId,
    } = parsed.data;
    const remoteJid = parsed.data.remoteJid || toRemoteJid(parsed.data.phoneNumber);

    if (!remoteJid) {
      return NextResponse.json({ error: 'Provide either remoteJid or phoneNumber' }, { status: 400 });
    }

    if (
      (type === 'text' && !text) ||
      (type === 'media' && (!(mediaUrl || base64) || !mediaType || !mimeType)) ||
      (type === 'audio' && !(mediaUrl || base64)) ||
      (type === 'location' && (latitude === undefined || longitude === undefined)) ||
      (type === 'contact' && (!contactName || !vcard))
    ) {
      return NextResponse.json({ error: 'Missing required fields for the specified type' }, { status: 400 });
    }

    const instance = db.getInstanceByIdentifier(instanceId);
    if (!instance) {
      return NextResponse.json({
        error: 'Instance not found',
        hint: 'Use the instance UUID from the dashboard URL, or the exact instance name.',
        receivedInstanceId: instanceId,
      }, { status: 404 });
    }
    const resolvedInstanceId = instance.id;
    const authorization = authorizeGatewayRequest(req, instance);
    if (!authorization.ok) {
      return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    }
    const rateLimit = await checkRateLimit({
      key: authorization.rateLimitKey || `instance:${resolvedInstanceId}`,
      limit: Number(process.env.API_RATE_LIMIT_PER_MINUTE || 120),
    });
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSeconds: rateLimit.retryAfterSeconds },
        {
          status: 429,
          headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) },
        },
      );
    }

    const outboundId = await enqueueOutboundMessage({
      instance_id: resolvedInstanceId,
      organization_id: instance.organization_id,
      api_key_id: authorization.apiKeyId || null,
      conversation_id: `${resolvedInstanceId}_${remoteJid}`,
      remote_jid: remoteJid,
      reply_type: type,
      text_content: text || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      mime_type: mimeType || null,
      quoted_message_id: quotedMessageId || null,
      payload: {
        base64: base64 || null,
        fileName: fileName || null,
        latitude,
        longitude,
        name: locationName || null,
        address: address || null,
        displayName: contactName || null,
        vcard: vcard || null,
      },
    });
    db.addAuditLog({
      organization_id: instance.organization_id,
      user_id: authorization.userId || null,
      instance_id: resolvedInstanceId,
      action: 'message.queued',
      target_type: 'outbound_message',
      target_id: outboundId,
      ip_address: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: req.headers.get('user-agent'),
      metadata: { type, remote_jid: remoteJid, auth_source: authorization.source },
    });
    db.addUsageEvent({
      organization_id: instance.organization_id,
      user_id: authorization.userId || null,
      instance_id: resolvedInstanceId,
      api_key_id: authorization.apiKeyId || null,
      event_type: 'api.request',
    });

    return NextResponse.json(
      {
        success: true,
        queued: true,
        data: {
          id: outboundId,
          instanceId: resolvedInstanceId,
          remoteJid,
          type,
          status: 'pending',
          rateLimit: {
            limit: rateLimit.limit,
            remaining: rateLimit.remaining,
          },
        },
      },
      { status: 202 },
    );
  } catch (error: any) {
    logger.error(errorDetails(error), 'Outbound message request failed.');
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

function toRemoteJid(phoneNumber?: string) {
  if (!phoneNumber) return null;
  if (phoneNumber.includes('@')) return phoneNumber.trim();
  const digits = phoneNumber.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
}
