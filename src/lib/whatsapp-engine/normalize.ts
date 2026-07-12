import { WAMessage, extractMessageContent } from '@whiskeysockets/baileys';

export type NormalizedWhatsAppMessage = {
  instanceId: string;
  remoteJid: string;
  senderJid: string;
  senderAltJid?: string;
  remoteAltJid?: string;
  isGroup: boolean;
  fromMe: boolean;
  messageId: string;
  pushName?: string;
  senderPhoneNumber?: string | null;
  senderLid?: string | null;
  senderDisplayNumber?: string | null;
  timestamp?: number;

  type: 'text' | 'image' | 'voice' | 'audio' | 'video' | 'document' | 'sticker' | 'unknown';
  
  text?: string;
  caption?: string;
  mimeType?: string;
  fileName?: string;
  durationSeconds?: number;
  
  raw: any;
};

export function normalizeBaileysMessage(instanceId: string, msg: WAMessage): NormalizedWhatsAppMessage | null {
  if (!msg.message || !msg.key || !msg.key.remoteJid) return null;

  const remoteJid = msg.key.remoteJid;
  const isGroup = remoteJid.endsWith('@g.us');
  const senderJid = isGroup ? (msg.key.participant || remoteJid) : remoteJid;
  const senderAltJid = isGroup ? (msg.key.participantAlt || undefined) : (msg.key.remoteJidAlt || undefined);
  const remoteAltJid = msg.key.remoteJidAlt || undefined;
  const fromMe = msg.key.fromMe || false;
  const messageId = msg.key.id!;
  const pushName = msg.pushName || undefined;
  const timestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : undefined;

  const content = extractMessageContent(msg.message);
  if (!content) return null;

  let type: NormalizedWhatsAppMessage['type'] = 'unknown';
  let text: string | undefined;
  let caption: string | undefined;
  let mimeType: string | undefined;
  let fileName: string | undefined;
  let durationSeconds: number | undefined;

  if (content.conversation) {
    type = 'text';
    text = content.conversation;
  } else if (content.extendedTextMessage?.text) {
    type = 'text';
    text = content.extendedTextMessage.text;
  } else if (content.imageMessage) {
    type = 'image';
    caption = content.imageMessage.caption || undefined;
    mimeType = content.imageMessage.mimetype || undefined;
  } else if (content.audioMessage) {
    type = content.audioMessage.ptt ? 'voice' : 'audio';
    mimeType = content.audioMessage.mimetype || undefined;
    durationSeconds = content.audioMessage.seconds || undefined;
  } else if (content.documentMessage) {
    type = 'document';
    fileName = content.documentMessage.fileName || undefined;
    mimeType = content.documentMessage.mimetype || undefined;
  } else if (content.videoMessage) {
    type = 'video';
    caption = content.videoMessage.caption || undefined;
    mimeType = content.videoMessage.mimetype || undefined;
  } else if (content.stickerMessage) {
    type = 'sticker';
  }

  return {
    instanceId,
    remoteJid,
    senderJid,
    senderAltJid,
    remoteAltJid,
    isGroup,
    fromMe,
    messageId,
    pushName,
    timestamp,
    type,
    text,
    caption,
    mimeType,
    fileName,
    durationSeconds,
    raw: msg
  };
}
