import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';
import { NormalizedWhatsAppMessage } from './normalize';
import fs from 'fs';
import path from 'path';

export type ProcessedMedia = {
  mediaId?: string;
  mediaType: string;
  mimeType: string;
  fileName: string;
  storagePath?: string;
  publicUrl?: string;
  transcription?: string;
  aiDescription?: string;
};

function getExtension(mimeType?: string): string {
  if (!mimeType) return 'bin';
  if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('pdf')) return 'pdf';
  return mimeType.split('/')[1]?.split(';')[0] || 'bin';
}

function getPublicMediaUrl(storagePath: string) {
  const relativeUrl = `/${storagePath.replace(/\\/g, '/')}`;
  const baseUrl = process.env.APP_BASE_URL?.replace(/\/$/, '');

  if (!baseUrl) {
    return relativeUrl;
  }

  return `${baseUrl}${relativeUrl}`;
}

export async function processInboundMedia(
  message: NormalizedWhatsAppMessage
): Promise<ProcessedMedia | null> {
  if (['text', 'unknown'].includes(message.type)) return null;

  const ext = getExtension(message.mimeType);
  const defaultFileName = `${message.type}_${Date.now()}.${ext}`;
  const fileName = message.fileName || defaultFileName;
  
  const result: ProcessedMedia = {
    mediaType: message.type,
    mimeType: message.mimeType || 'application/octet-stream',
    fileName,
  };

  try {
    const rawMsg = message.raw as WAMessage;
    
    // Download media as buffer using Baileys
    const buffer = await downloadMediaMessage(
      rawMsg,
      'buffer',
      {},
      { 
        logger: console as any,
        reuploadRequest: () => new Promise((resolve) => resolve(rawMsg))
      }
    ) as Buffer;
    
    if (!buffer) return result;

    const safeRemoteJid = message.remoteJid.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `media/${message.instanceId}/${safeRemoteJid}/${message.messageId}/${fileName}`;
    const absolutePath = path.join(process.cwd(), 'public', storagePath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);

    result.storagePath = storagePath;
    result.publicUrl = getPublicMediaUrl(storagePath);

    return result;
  } catch (err) {
    console.error('Media processing failed:', err);
    return result;
  }
}
