import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sendText, sendMedia, sendAudio } from '@/lib/whatsapp-engine/send';

const sendSchema = z.object({
  instanceId: z.string().uuid(),
  remoteJid: z.string(),
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

    const { instanceId, remoteJid, type, text, mediaUrl, mediaType, mimeType, quotedMessageId } = parsed.data;

    let result;
    if (type === 'text' && text) {
      result = await sendText({ instanceId, remoteJid, text, quotedMessageId });
    } else if (type === 'media' && mediaUrl && mediaType && mimeType) {
      result = await sendMedia({ instanceId, remoteJid, mediaUrl, mediaType, mimeType, caption: text, quotedMessageId });
    } else if (type === 'audio' && mediaUrl) {
      result = await sendAudio({ instanceId, remoteJid, audioUrl: mediaUrl, quotedMessageId });
    } else {
      return NextResponse.json({ error: 'Missing required fields for the specified type' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Send error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
