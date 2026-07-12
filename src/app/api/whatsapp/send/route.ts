import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db/sqlite';

export const dynamic = 'force-dynamic';

const sendSchema = z.object({
  instanceId: z.string().uuid(),
  remoteJid: z.string().optional(),
  phoneNumber: z.string().optional(),
  type: z.enum(['text', 'media', 'audio']),
  text: z.string().optional(),
  mediaUrl: z.string().optional(),
  mediaType: z.string().optional(),
  mimeType: z.string().optional(),
  quotedMessageId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.issues }, { status: 400 });
    }

    const { instanceId, type, text, mediaUrl, mediaType, mimeType, quotedMessageId } = parsed.data;
    const remoteJid = parsed.data.remoteJid || toRemoteJid(parsed.data.phoneNumber);

    if (!remoteJid) {
      return NextResponse.json({ error: 'Provide either remoteJid or phoneNumber' }, { status: 400 });
    }

    if (
      (type === 'text' && !text) ||
      (type === 'media' && (!mediaUrl || !mediaType || !mimeType)) ||
      (type === 'audio' && !mediaUrl)
    ) {
      return NextResponse.json({ error: 'Missing required fields for the specified type' }, { status: 400 });
    }

    const instance = db.getInstance(instanceId);
    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 });
    }

    const outboundId = db.enqueueOutboundMessage({
      instance_id: instanceId,
      conversation_id: `${instanceId}_${remoteJid}`,
      remote_jid: remoteJid,
      reply_type: type,
      text_content: text || null,
      media_url: mediaUrl || null,
      media_type: mediaType || null,
      mime_type: mimeType || null,
      quoted_message_id: quotedMessageId || null,
    });

    return NextResponse.json({
      success: true,
      queued: true,
      data: {
        id: outboundId,
        instanceId,
        remoteJid,
        type,
        status: 'pending',
      },
    });
  } catch (error: any) {
    console.error('Send error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

function toRemoteJid(phoneNumber?: string) {
  if (!phoneNumber) return null;
  if (phoneNumber.includes('@')) return phoneNumber;
  const digits = phoneNumber.replace(/\D/g, '');
  return digits ? `${digits}@s.whatsapp.net` : null;
}
