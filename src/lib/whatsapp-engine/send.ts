import { AnyMessageContent, MiscMessageGenerationOptions } from '@whiskeysockets/baileys';
import { decodeBase64Media, fetchRemoteMedia } from '../security/remote-media';
import { WhatsAppEngineManager } from './manager';

function getSocket(instanceId: string) {
  const socket = WhatsAppEngineManager.getSocket(instanceId);
  if (!socket) throw new Error('WhatsApp instance is not connected yet');
  return socket;
}

function quoteOptions(remoteJid: string, quotedMessageId?: string): MiscMessageGenerationOptions {
  if (!quotedMessageId) return {};
  return {
    quoted: {
      key: { id: quotedMessageId, remoteJid },
      message: { conversation: '' },
    },
  };
}

async function getMediaBuffer(mediaUrl?: string, base64?: string) {
  if (base64) return decodeBase64Media(base64);
  if (!mediaUrl) throw new Error('Provide either mediaUrl or base64');
  return (await fetchRemoteMedia(mediaUrl)).buffer;
}

async function humanDelay() {
  const delay = Number(process.env.OUTBOUND_PRESENCE_DELAY_MS || 400);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
}

export async function sendText(params: {
  instanceId: string;
  remoteJid: string;
  text: string;
  quotedMessageId?: string;
}) {
  const socket = getSocket(params.instanceId);
  await socket.presenceSubscribe(params.remoteJid);
  await socket.sendPresenceUpdate('composing', params.remoteJid);

  try {
    await humanDelay();
    return await socket.sendMessage(
      params.remoteJid,
      { text: params.text },
      quoteOptions(params.remoteJid, params.quotedMessageId),
    );
  } finally {
    await socket.sendPresenceUpdate('paused', params.remoteJid).catch(() => undefined);
  }
}

export async function sendMedia(params: {
  instanceId: string;
  remoteJid: string;
  mediaUrl?: string;
  base64?: string;
  mediaType: string;
  mimeType: string;
  caption?: string;
  fileName?: string;
  quotedMessageId?: string;
}) {
  const socket = getSocket(params.instanceId);
  const buffer = await getMediaBuffer(params.mediaUrl, params.base64);
  await socket.presenceSubscribe(params.remoteJid);
  await socket.sendPresenceUpdate('composing', params.remoteJid);

  const message: AnyMessageContent = params.mediaType === 'image'
    ? { image: buffer, caption: params.caption, mimetype: params.mimeType }
    : params.mediaType === 'video'
      ? { video: buffer, caption: params.caption, mimetype: params.mimeType }
      : {
          document: buffer,
          caption: params.caption,
          mimetype: params.mimeType,
          fileName: params.fileName || 'attachment',
        };

  try {
    await humanDelay();
    return await socket.sendMessage(
      params.remoteJid,
      message,
      quoteOptions(params.remoteJid, params.quotedMessageId),
    );
  } finally {
    await socket.sendPresenceUpdate('paused', params.remoteJid).catch(() => undefined);
  }
}

export async function sendAudio(params: {
  instanceId: string;
  remoteJid: string;
  audioUrl?: string;
  base64?: string;
  mimeType?: string;
  quotedMessageId?: string;
}) {
  const socket = getSocket(params.instanceId);
  const buffer = await getMediaBuffer(params.audioUrl, params.base64);
  await socket.presenceSubscribe(params.remoteJid);
  await socket.sendPresenceUpdate('recording', params.remoteJid);

  try {
    await humanDelay();
    return await socket.sendMessage(
      params.remoteJid,
      {
        audio: buffer,
        ptt: true,
        mimetype: params.mimeType || 'audio/ogg; codecs=opus',
      },
      quoteOptions(params.remoteJid, params.quotedMessageId),
    );
  } finally {
    await socket.sendPresenceUpdate('paused', params.remoteJid).catch(() => undefined);
  }
}

export async function sendLocation(params: {
  instanceId: string;
  remoteJid: string;
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
  quotedMessageId?: string;
}) {
  const socket = getSocket(params.instanceId);
  return socket.sendMessage(
    params.remoteJid,
    {
      location: {
        degreesLatitude: params.latitude,
        degreesLongitude: params.longitude,
        name: params.name,
        address: params.address,
      },
    },
    quoteOptions(params.remoteJid, params.quotedMessageId),
  );
}

export async function sendContact(params: {
  instanceId: string;
  remoteJid: string;
  displayName: string;
  vcard: string;
  quotedMessageId?: string;
}) {
  const socket = getSocket(params.instanceId);
  return socket.sendMessage(
    params.remoteJid,
    {
      contacts: {
        displayName: params.displayName,
        contacts: [{ displayName: params.displayName, vcard: params.vcard }],
      },
    },
    quoteOptions(params.remoteJid, params.quotedMessageId),
  );
}
