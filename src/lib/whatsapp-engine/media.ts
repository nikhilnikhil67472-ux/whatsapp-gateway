import { downloadMediaMessage, WAMessage } from '@whiskeysockets/baileys';
import { NormalizedWhatsAppMessage } from './normalize';
import path from 'path';
import { Transform } from 'stream';
import { storeMedia } from '../media/storage';
import { errorDetails, logger } from '../observability/logger';

export type ProcessedMedia = {
  mediaId?: string;
  mediaType: string;
  mimeType: string;
  fileName: string;
  storagePath?: string;
  publicUrl?: string;
  base64Data?: string;
  sizeBytes?: number;
  transcription?: string;
  aiDescription?: string;
  extractedText?: string;
  storageProvider?: string;
  storageKey?: string;
  buffer?: Buffer;
  intelligenceErrors?: string[];
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

export async function processInboundMedia(
  message: NormalizedWhatsAppMessage,
  options: {
    includeBase64?: boolean;
    storageProvider?: string | null;
    reuploadRequest?: (message: WAMessage) => Promise<WAMessage>;
  } = {},
): Promise<ProcessedMedia | null> {
  if (!['image', 'voice', 'audio', 'video', 'document', 'sticker'].includes(message.type)) return null;

  const ext = getExtension(message.mimeType);
  const defaultFileName = `${message.type}_${Date.now()}.${ext}`;
  const requestedFileName = path.basename(message.fileName || defaultFileName);
  const fileName = requestedFileName.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || defaultFileName;
  
  const result: ProcessedMedia = {
    mediaType: message.type,
    mimeType: message.mimeType || 'application/octet-stream',
    fileName,
  };

  try {
    const rawMsg = message.raw as WAMessage;
    
    const stream = await downloadMediaMessage(
      rawMsg,
      'stream',
      {},
      {
        logger: logger as any,
        reuploadRequest: options.reuploadRequest || (async () => rawMsg),
      },
    ) as Transform;

    const maxBytes = Number(process.env.MAX_INBOUND_MEDIA_BYTES || 20 * 1024 * 1024);
    const chunks: Buffer[] = [];
    let sizeBytes = 0;

    for await (const chunk of stream) {
      const bufferChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      sizeBytes += bufferChunk.length;
      if (sizeBytes > maxBytes) {
        stream.destroy();
        throw new Error(`Inbound media exceeds the ${maxBytes} byte limit`);
      }
      chunks.push(bufferChunk);
    }

    const buffer = Buffer.concat(chunks);
    if (!buffer.length) return result;

    const safeMessageId = message.messageId.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storage = await storeMedia({
      buffer,
      key: `${message.instanceId}/${safeMessageId}/${fileName}`,
      mimeType: result.mimeType,
      provider: options.storageProvider,
    });

    result.storageProvider = storage.storageProvider;
    result.storagePath = storage.storagePath;
    result.storageKey = storage.storageKey;
    result.publicUrl = storage.publicUrl;
    result.sizeBytes = sizeBytes;
    result.buffer = buffer;
    if (options.includeBase64) result.base64Data = buffer.toString('base64');

    return result;
  } catch (err) {
    logger.error({
      instance_id: message.instanceId,
      message_id: message.messageId,
      media_type: message.type,
      ...errorDetails(err),
    }, 'Inbound media processing failed.');
    return result;
  }
}
