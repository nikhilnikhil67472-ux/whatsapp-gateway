import { NormalizedWhatsAppMessage } from './normalize';

function jidToPhone(jid?: string | null) {
  if (!jid) return null;
  if (!jid.endsWith('@s.whatsapp.net') && !jid.endsWith('@hosted')) return null;
  const phone = jid.split('@')[0].split(':')[0].replace(/\D/g, '');
  return phone || null;
}

function jidToLid(jid?: string | null) {
  if (!jid) return null;
  if (!jid.endsWith('@lid') && !jid.endsWith('@hosted.lid')) return null;
  return jid.split('@')[0].split(':')[0] || null;
}

export function getJidIdentity(jid?: string | null) {
  const phone = jidToPhone(jid);
  const lid = jidToLid(jid);
  return {
    jid: jid || null,
    phoneNumber: phone,
    lid,
    displayNumber: phone ? `+${phone}` : null,
    isLid: Boolean(lid),
  };
}

export async function enrichSenderIdentity(sock: any, message: NormalizedWhatsAppMessage) {
  const candidates = [
    message.senderAltJid,
    message.remoteAltJid,
    (message.raw as any)?.key?.participantPn,
    (message.raw as any)?.key?.remoteJidPn,
    message.senderJid,
    message.remoteJid,
  ].filter(Boolean) as string[];

  for (const jid of candidates) {
    const phone = jidToPhone(jid);
    if (phone) {
      message.senderPhoneNumber = phone;
      message.senderPhoneJid = jid;
      message.senderDisplayNumber = `+${phone}`;
      message.senderLid = jidToLid(message.senderJid) || jidToLid(message.remoteJid);
      return message;
    }
  }

  const lidJid = candidates.find((jid) => jid.endsWith('@lid') || jid.endsWith('@hosted.lid'));
  if (lidJid) {
    try {
      const pnJid = await sock?.signalRepository?.lidMapping?.getPNForLID?.(lidJid);
      const phone = jidToPhone(pnJid);
      if (phone) {
        message.senderPhoneNumber = phone;
        message.senderPhoneJid = pnJid;
        message.senderDisplayNumber = `+${phone}`;
        message.senderLid = jidToLid(lidJid);
        message.senderAltJid = pnJid;
        return message;
      }
    } catch (err) {
      console.warn('[identity] Failed to resolve LID to phone number:', err);
    }
  }

  message.senderPhoneNumber = null;
  message.senderPhoneJid = null;
  message.senderDisplayNumber = null;
  message.senderLid = jidToLid(message.senderJid) || jidToLid(message.remoteJid);
  return message;
}
