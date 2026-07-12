import { WhatsAppEngineManager } from './manager';

export async function sendText(params: {
  instanceId: string;
  remoteJid: string;
  text: string;
  quotedMessageId?: string;
}) {
  const sock = WhatsAppEngineManager.getSocket(params.instanceId);
  if (!sock) throw new Error('WhatsApp socket not running');

  await sock.presenceSubscribe(params.remoteJid);
  await sock.sendPresenceUpdate('composing', params.remoteJid);
  
  // Artificial delay to seem human
  await new Promise(r => setTimeout(r, 1200));

  const options: any = {};
  if (params.quotedMessageId) {
    options.quoted = {
      key: { id: params.quotedMessageId, remoteJid: params.remoteJid },
      message: {} // Baileys needs this for quoting to work partially, actual content is hard to fetch if not cached, but ID works often
    };
  }

  const result = await sock.sendMessage(params.remoteJid, { text: params.text }, options);
  await sock.sendPresenceUpdate('paused', params.remoteJid);
  
  return result;
}

export async function sendMedia(params: {
  instanceId: string;
  remoteJid: string;
  mediaUrl: string;
  mediaType: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
  quotedMessageId?: string;
}) {
  const sock = WhatsAppEngineManager.getSocket(params.instanceId);
  if (!sock) throw new Error('WhatsApp socket not running');

  await sock.presenceSubscribe(params.remoteJid);
  await sock.sendPresenceUpdate('composing', params.remoteJid);
  await new Promise(r => setTimeout(r, 1200));

  const options: any = {};
  if (params.quotedMessageId) {
    options.quoted = { key: { id: params.quotedMessageId, remoteJid: params.remoteJid } };
  }

  // Baileys can send URLs natively
  const messageObj: any = {};
  
  if (params.mediaType === 'image') {
    messageObj.image = { url: params.mediaUrl };
    if (params.caption) messageObj.caption = params.caption;
  } else if (params.mediaType === 'video') {
    messageObj.video = { url: params.mediaUrl };
    if (params.caption) messageObj.caption = params.caption;
  } else {
    messageObj.document = { url: params.mediaUrl };
    if (params.fileName) messageObj.fileName = params.fileName;
    if (params.mimeType) messageObj.mimetype = params.mimeType;
    if (params.caption) messageObj.caption = params.caption;
  }

  const result = await sock.sendMessage(params.remoteJid, messageObj, options);
  await sock.sendPresenceUpdate('paused', params.remoteJid);

  return result;
}

export async function sendAudio(params: {
  instanceId: string;
  remoteJid: string;
  audioUrl: string;
  quotedMessageId?: string;
}) {
  const sock = WhatsAppEngineManager.getSocket(params.instanceId);
  if (!sock) throw new Error('WhatsApp socket not running');

  await sock.presenceSubscribe(params.remoteJid);
  await sock.sendPresenceUpdate('recording', params.remoteJid);
  await new Promise(r => setTimeout(r, 1200));

  const options: any = {};
  if (params.quotedMessageId) {
    options.quoted = { key: { id: params.quotedMessageId, remoteJid: params.remoteJid } };
  }

  const result = await sock.sendMessage(params.remoteJid, { 
    audio: { url: params.audioUrl }, 
    ptt: true // Voice note
  }, options);
  
  await sock.sendPresenceUpdate('paused', params.remoteJid);

  return result;
}
