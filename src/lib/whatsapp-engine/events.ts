import { normalizeBaileysMessage } from './normalize';
import { processInboundMedia } from './media';
import { processWithN8n } from '../ai/n8n-client';
import { decrypt } from '../security/encrypt';
import { getEventSettings, toJsonSafePayload } from './event-settings';
import { db } from '../db/sqlite';
import { enrichSenderIdentity } from './identity';

async function getInstance(instanceId: string) {
  return db.getInstance(instanceId);
}

async function logEvent(instanceId: string, eventType: string, payload: unknown) {
  db.addEventLog(instanceId, eventType, toJsonSafePayload(payload));
}

async function forwardEventToWebhook(instanceId: string, instance: any, eventType: string, payload: unknown) {
  const settings = getEventSettings(instance);
  if (!settings.webhooks.forward_non_message_events) return;
  if (!settings.webhooks.forwarded_events.includes(eventType)) return;
  if (!instance?.n8n_webhook_url) return;

  db.enqueueWebhookDelivery({
    instance_id: instanceId,
    event_type: eventType,
    target_url: instance.n8n_webhook_url,
    payload: {
      event: eventType,
      instance: {
        id: instanceId,
        name: instance.instance_name,
        client_id: instance.client_id,
      },
      data: toJsonSafePayload(payload),
      timestamp: new Date().toISOString(),
    },
  });
}

export function bindEvents(instanceId: string, sock: any) {
  
  sock.ev.on('messages.upsert', async (m: any) => {
    if (m.type !== 'notify') return;
    
    const instance = await getInstance(instanceId);

    if (!instance) return;
    const eventSettings = getEventSettings(instance);

    for (const msg of m.messages) {
      try {
        const normalized = normalizeBaileysMessage(instanceId, msg);
        if (!normalized) continue;
        await enrichSenderIdentity(sock, normalized);
        const cleanMsg = toJsonSafePayload(msg);
        console.log(`[Baileys ${instanceId}] Processing inbound message from ${normalized.remoteJid}: "${normalized.text?.substring(0, 50) || 'media/other'}"`);

        // Log to internal event bus collection
        await logEvent(instanceId, 'message.upsert', cleanMsg);

        if (normalized.fromMe) continue;
        if (!normalized.isGroup && !eventSettings.messages.receive_private_messages) continue;
        if (normalized.isGroup && eventSettings.groups.ignore_group_messages) continue;

        // Upsert Conversation
        const convId = `${instanceId}_${normalized.remoteJid}`;
        db.upsertConversation({
          id: convId,
          instance_id: instanceId,
          remote_jid: normalized.remoteJid,
          is_group: normalized.isGroup,
          display_name: normalized.pushName || null,
          last_message_at: db.now(),
        });

        // Duplicate Check
        if (db.messageExists(instanceId, normalized.messageId)) continue;

        // Insert Message
        const dbMessageId = db.addMessage({
          instance_id: instanceId,
          conversation_id: convId,
          remote_jid: normalized.remoteJid,
          whatsapp_message_id: normalized.messageId,
          from_me: normalized.fromMe,
          direction: 'inbound',
          message_type: normalized.type,
          text_content: normalized.text,
          caption: normalized.caption,
          raw_payload: cleanMsg,
          created_at: db.now(),
        });

        // Process Media
        const processedMedia = eventSettings.messages.process_media_messages
          ? await processInboundMedia(normalized, {
              includeBase64: eventSettings.messages.include_media_base64,
              reuploadRequest: (messageToUpdate) => sock.updateMediaMessage(messageToUpdate),
            })
          : null;
        if (processedMedia) {
          db.addMediaAsset({
            instance_id: instanceId,
            message_id: dbMessageId,
            media_type: processedMedia.mediaType,
            mime_type: processedMedia.mimeType,
            file_name: processedMedia.fileName,
            storage_path: processedMedia.storagePath,
            public_url: processedMedia.publicUrl,
          });
        }

        // AI Processing
        const sendMessageToAi = normalized.isGroup
          ? eventSettings.groups.send_group_messages_to_ai
          : eventSettings.messages.send_private_messages_to_ai;

        if (sendMessageToAi && instance.ai_enabled && instance.n8n_webhook_url) {
          console.log(`[Baileys ${instanceId}] AI is enabled, routing to n8n: ${instance.n8n_webhook_url}`);
          const n8nSecret = instance.n8n_secret_encrypted ? decrypt(instance.n8n_secret_encrypted) : null;
          
          const reply = await processWithN8n({
            instanceId,
            instanceName: instance.instance_name,
            clientId: instance.client_id,
            n8nWebhookUrl: instance.n8n_webhook_url,
            n8nSecret,
            webhookSecret: instance.webhook_secret,
            normalizedMessage: normalized as any,
            processedMedia,
            dbMessageId,
          });

          console.log(`[Baileys ${instanceId}] n8n Response:`, JSON.stringify(reply));

          if (reply && (reply.reply === true || reply.reply === 'true' || reply[0]?.reply || reply.output || reply.text || reply[0]?.output || reply[0]?.text)) {
            // Support if n8n returns it inside an array by mistake
            const r = Array.isArray(reply) ? reply[0] : reply;

            // Auto-detect standard AI node output (e.g., Langchain)
            if (r?.output && typeof r.output === 'string' && !r.text) {
              r.type = 'text';
              r.text = r.output;
              r.reply = true;
            } else if (r?.text && !r.reply) {
              r.type = 'text';
              r.reply = true;
            }

            let outboundId: string | null = null;
            if (r.type === 'text' && r.text) {
              outboundId = db.enqueueOutboundMessage({
                instance_id: instanceId,
                conversation_id: convId,
                remote_jid: normalized.remoteJid,
                reply_type: 'text',
                text_content: r.text,
                quoted_message_id: normalized.messageId,
              });
            } else if (r.type === 'media' && r.mediaUrl && r.mediaType && r.mimeType) {
              outboundId = db.enqueueOutboundMessage({
                instance_id: instanceId,
                conversation_id: convId,
                remote_jid: normalized.remoteJid,
                reply_type: 'media',
                text_content: r.text || null,
                media_url: r.mediaUrl,
                media_type: r.mediaType,
                mime_type: r.mimeType,
                quoted_message_id: normalized.messageId,
                payload: { fileName: r.fileName || null },
              });
            } else if (r.type === 'audio' && r.audioUrl) {
              outboundId = db.enqueueOutboundMessage({
                instance_id: instanceId,
                conversation_id: convId,
                remote_jid: normalized.remoteJid,
                reply_type: 'audio',
                media_url: r.audioUrl,
                mime_type: r.mimeType || null,
                quoted_message_id: normalized.messageId,
              });
            } else if (r.type === 'location' && Number.isFinite(r.latitude) && Number.isFinite(r.longitude)) {
              outboundId = db.enqueueOutboundMessage({
                instance_id: instanceId,
                conversation_id: convId,
                remote_jid: normalized.remoteJid,
                reply_type: 'location',
                quoted_message_id: normalized.messageId,
                payload: {
                  latitude: r.latitude,
                  longitude: r.longitude,
                  name: r.name || null,
                  address: r.address || null,
                },
              });
            } else if (r.type === 'contact' && r.displayName && r.vcard) {
              outboundId = db.enqueueOutboundMessage({
                instance_id: instanceId,
                conversation_id: convId,
                remote_jid: normalized.remoteJid,
                reply_type: 'contact',
                quoted_message_id: normalized.messageId,
                payload: {
                  displayName: r.displayName,
                  vcard: r.vcard,
                },
              });
            }

            if (outboundId) {
              console.log(`[Baileys ${instanceId}] Queued AI reply ${outboundId}.`);
            } else {
              console.log(`[Baileys ${instanceId}] Webhook reply did not match a supported outbound type.`);
            }
          } else {
            console.log(`[Baileys ${instanceId}] Webhook returned success, but reply.reply is missing or false. Not sending response back to WhatsApp.`);
          }
        } else {
          console.log(`[Baileys ${instanceId}] Skipping n8n (ai_enabled=${instance.ai_enabled}, url=${instance.n8n_webhook_url})`);
        }
      } catch (err) {
        console.error(`[Baileys ${instanceId}] Error processing incoming message:`, err);
      }
    }
  });

  sock.ev.on('call', async (calls: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.calls.detect_calls) return;

    for (const call of calls) {
      if (call.status === 'offer') {
        await logEvent(instanceId, 'call.received', call);
        await forwardEventToWebhook(instanceId, instance, 'call.received', call);

        if (settings.calls.auto_reject_calls) {
          await sock.rejectCall(call.id, call.from);
        }

        if (settings.calls.send_auto_reply && settings.calls.auto_reply_text) {
          await sock.sendMessage(call.from, { text: settings.calls.auto_reply_text });
        }
      }
    }
  });

  sock.ev.on('messages.update', async (updates: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.messages.track_receipts) return;

    await logEvent(instanceId, 'message.updated', updates);
  });

  sock.ev.on('messages.delete', async (deletion: any) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.messages.log_deleted_messages) return;

    await logEvent(instanceId, 'message.deleted', deletion);
    await forwardEventToWebhook(instanceId, instance, 'message.deleted', deletion);
  });

  sock.ev.on('messages.reaction', async (reactions: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.messages.log_reactions) return;

    await logEvent(instanceId, 'message.reaction', reactions);
    await forwardEventToWebhook(instanceId, instance, 'message.reaction', reactions);
  });

  sock.ev.on('message-receipt.update', async (receipts: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.messages.track_receipts) return;

    await logEvent(instanceId, 'message.receipt', receipts);
  });

  sock.ev.on('chats.upsert', async (chats: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.track_chat_updates) return;

    await logEvent(instanceId, 'chat.upsert', chats);
  });

  sock.ev.on('chats.update', async (updates: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.track_chat_updates) return;

    await logEvent(instanceId, 'chat.updated', updates);
  });

  sock.ev.on('contacts.upsert', async (contacts: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.sync_contacts) return;

    await logEvent(instanceId, 'contact.upsert', contacts);
  });

  sock.ev.on('contacts.update', async (updates: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.sync_contacts) return;

    await logEvent(instanceId, 'contact.updated', updates);
    await forwardEventToWebhook(instanceId, instance, 'contact.updated', updates);
  });

  sock.ev.on('groups.update', async (updates: any[]) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.groups.log_group_updates) return;

    await logEvent(instanceId, 'group.updated', updates);
    await forwardEventToWebhook(instanceId, instance, 'group.updated', updates);
  });

  sock.ev.on('group-participants.update', async (update: any) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.groups.log_participant_updates) return;

    await logEvent(instanceId, 'group.participants', update);
    await forwardEventToWebhook(instanceId, instance, 'group.participants', update);
  });

  sock.ev.on('group.join-request', async (update: any) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.groups.log_join_requests) return;

    await logEvent(instanceId, 'group.join_request', update);
    await forwardEventToWebhook(instanceId, instance, 'group.join_request', update);
  });

  sock.ev.on('presence.update', async (update: any) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.track_presence) return;

    await logEvent(instanceId, 'presence.updated', update);
  });

  sock.ev.on('blocklist.set', async (blocklist: any) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.track_blocklist) return;

    await logEvent(instanceId, 'blocklist.set', blocklist);
  });

  sock.ev.on('blocklist.update', async (update: any) => {
    const instance = await getInstance(instanceId);
    if (!instance) return;
    const settings = getEventSettings(instance);
    if (!settings.contacts.track_blocklist) return;

    await logEvent(instanceId, 'blocklist.updated', update);
  });
}
