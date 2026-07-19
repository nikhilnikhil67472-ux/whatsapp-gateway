import { normalizeBaileysMessage } from './normalize';
import { processInboundMedia } from './media';
import { processWithAgent } from '../ai/agent';
import { processMediaIntelligence } from '../media/intelligence';
import { getEventSettings, toJsonSafePayload } from './event-settings';
import { db } from '../db';
import { enrichSenderIdentity } from './identity';
import {
  enqueueOutboundMessage,
  enqueueWebhookDelivery,
} from '../queue/enqueue';
import { errorDetails, logger } from '../observability/logger';

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

  await enqueueWebhookDelivery({
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

async function enqueueReply(params: {
  instance: any;
  conversationId: string;
  remoteJid: string;
  quotedMessageId?: string;
  reply: any;
  allowOptedOut?: boolean;
}) {
  const raw = Array.isArray(params.reply) ? params.reply[0] : params.reply;
  if (!raw) return null;
  const reply = { ...raw };
  if (reply.output && typeof reply.output === 'string' && !reply.text) {
    reply.type = 'text';
    reply.text = reply.output;
    reply.reply = true;
  } else if (reply.text && !reply.type) {
    reply.type = 'text';
    reply.reply = true;
  }

  const common = {
    instance_id: params.instance.id,
    organization_id: params.instance.organization_id,
    conversation_id: params.conversationId,
    remote_jid: params.remoteJid,
    quoted_message_id: params.quotedMessageId || null,
  };
  if (reply.type === 'text' && reply.text) {
    return enqueueOutboundMessage({
      ...common,
      reply_type: 'text',
      text_content: reply.text,
      payload: { allowOptedOut: Boolean(params.allowOptedOut) },
    });
  }
  if (
    reply.type === 'media'
    && (reply.mediaUrl || reply.base64)
    && reply.mediaType
    && reply.mimeType
  ) {
    return enqueueOutboundMessage({
      ...common,
      reply_type: 'media',
      text_content: reply.text || reply.caption || null,
      media_url: reply.mediaUrl || null,
      media_type: reply.mediaType,
      mime_type: reply.mimeType,
      payload: {
        base64: reply.base64 || null,
        fileName: reply.fileName || null,
        allowOptedOut: Boolean(params.allowOptedOut),
      },
    });
  }
  if (reply.type === 'audio' && (reply.audioUrl || reply.mediaUrl || reply.base64)) {
    return enqueueOutboundMessage({
      ...common,
      reply_type: 'audio',
      media_url: reply.audioUrl || reply.mediaUrl || null,
      mime_type: reply.mimeType || null,
      payload: {
        base64: reply.base64 || null,
        allowOptedOut: Boolean(params.allowOptedOut),
      },
    });
  }
  if (
    reply.type === 'location'
    && Number.isFinite(reply.latitude)
    && Number.isFinite(reply.longitude)
  ) {
    return enqueueOutboundMessage({
      ...common,
      reply_type: 'location',
      payload: {
        latitude: reply.latitude,
        longitude: reply.longitude,
        name: reply.name || null,
        address: reply.address || null,
        allowOptedOut: Boolean(params.allowOptedOut),
      },
    });
  }
  if (reply.type === 'contact' && reply.displayName && reply.vcard) {
    return enqueueOutboundMessage({
      ...common,
      reply_type: 'contact',
      payload: {
        displayName: reply.displayName,
        vcard: reply.vcard,
        allowOptedOut: Boolean(params.allowOptedOut),
      },
    });
  }
  return null;
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
        logger.info({
          instance_id: instanceId,
          remote_jid: normalized.remoteJid,
          message_type: normalized.type,
        }, 'Processing inbound WhatsApp message.');

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
          direction: 'inbound',
        });
        const contactId = db.upsertContact({
          organization_id: instance.organization_id,
          instance_id: instanceId,
          remote_jid: normalized.remoteJid,
          phone_number: normalized.senderPhoneNumber || null,
          display_name: normalized.pushName || null,
          last_message_at: db.now(),
          metadata: {
            sender_jid: normalized.senderJid,
            sender_lid: normalized.senderLid || null,
            is_group: normalized.isGroup,
          },
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
              storageProvider: instance.storage_provider,
              reuploadRequest: (messageToUpdate) => sock.updateMediaMessage(messageToUpdate),
            })
          : null;
        if (processedMedia) {
          if (processedMedia.buffer) {
            const intelligence = await processMediaIntelligence({
              instance,
              mediaType: processedMedia.mediaType,
              mimeType: processedMedia.mimeType,
              fileName: processedMedia.fileName,
              buffer: processedMedia.buffer,
            });
            processedMedia.transcription = intelligence.transcription;
            processedMedia.aiDescription = intelligence.analysis;
            processedMedia.extractedText = intelligence.extractedText;
            processedMedia.intelligenceErrors = intelligence.errors;
          }
          const mediaAssetId = db.addMediaAsset({
            instance_id: instanceId,
            message_id: dbMessageId,
            media_type: processedMedia.mediaType,
            mime_type: processedMedia.mimeType,
            file_name: processedMedia.fileName,
            storage_path: processedMedia.storagePath,
            public_url: processedMedia.publicUrl,
            storage_provider: processedMedia.storageProvider,
            storage_key: processedMedia.storageKey,
            transcription: processedMedia.transcription,
            analysis: processedMedia.aiDescription,
            extracted_text: processedMedia.extractedText,
            metadata: {
              intelligence_errors: processedMedia.intelligenceErrors || [],
              size_bytes: processedMedia.sizeBytes || null,
            },
          });
          db.linkMessageMediaAsset(dbMessageId, mediaAssetId);
        }

        const contact = db.getContactByRemoteJid(instanceId, normalized.remoteJid);
        const normalizedText = String(normalized.text || normalized.caption || '').trim().toLowerCase();
        const optOutKeywords = (instance.opt_out_keywords || ['stop', 'unsubscribe'])
          .map((value: unknown) => String(value).trim().toLowerCase())
          .filter(Boolean);
        if (!normalized.isGroup && normalizedText && optOutKeywords.includes(normalizedText)) {
          db.updateContact(contactId, { opted_out: true });
          db.addAuditLog({
            organization_id: instance.organization_id,
            instance_id: instanceId,
            action: 'contact.opted_out',
            target_type: 'contact',
            target_id: contactId,
            metadata: { keyword: normalizedText },
          });
          await enqueueReply({
            instance,
            conversationId: convId,
            remoteJid: normalized.remoteJid,
            quotedMessageId: normalized.messageId,
            allowOptedOut: true,
            reply: {
              type: 'text',
              text: process.env.OPT_OUT_CONFIRMATION_TEXT
                || 'You have been opted out of automated messages. Reply START to opt in again.',
            },
          });
          continue;
        }
        if (!normalized.isGroup && normalizedText === 'start' && contact?.opted_out) {
          db.updateContact(contactId, { opted_out: false });
          await enqueueReply({
            instance,
            conversationId: convId,
            remoteJid: normalized.remoteJid,
            quotedMessageId: normalized.messageId,
            allowOptedOut: true,
            reply: {
              type: 'text',
              text: process.env.OPT_IN_CONFIRMATION_TEXT
                || 'You are subscribed again. How can we help?',
            },
          });
          continue;
        }
        if (contact?.opted_out) continue;

        const autoReplyRule = normalizedText
          ? db.findMatchingAutoReplyRule(instanceId, normalizedText)
          : null;
        if (autoReplyRule) {
          const outboundId = await enqueueReply({
            instance,
            conversationId: convId,
            remoteJid: normalized.remoteJid,
            quotedMessageId: normalized.messageId,
            reply: {
              ...autoReplyRule.response_payload,
              type: autoReplyRule.response_type,
            },
          });
          if (outboundId) {
            db.markAutoReplyRuleTriggered(autoReplyRule.id);
            db.addUsageEvent({
              organization_id: instance.organization_id,
              instance_id: instanceId,
              event_type: 'auto_reply.sent',
              metadata: { rule_id: autoReplyRule.id },
            });
            continue;
          }
        }

        // AI Processing
        const sendMessageToAi = normalized.isGroup
          ? eventSettings.groups.send_group_messages_to_ai
          : eventSettings.messages.send_private_messages_to_ai;
        const hasAgentDestination = ['openai', 'anthropic'].includes(instance.ai_provider)
          || Boolean(instance.n8n_webhook_url);

        if (sendMessageToAi && instance.ai_enabled && hasAgentDestination) {
          logger.info({
            instance_id: instanceId,
            ai_provider: instance.ai_provider || 'webhook',
          }, 'Routing inbound message to AI agent.');
          const reply = await processWithAgent({
            instance,
            normalizedMessage: normalized as any,
            processedMedia,
            dbMessageId,
          });

          logger.info({
            instance_id: instanceId,
            ai_provider: instance.ai_provider || 'webhook',
            has_reply: Boolean(reply),
            reply_type: Array.isArray(reply) ? reply[0]?.type : reply?.type,
          }, 'AI agent completed.');

          if (reply && (reply.reply === true || reply.reply === 'true' || reply[0]?.reply || reply.output || reply.text || reply[0]?.output || reply[0]?.text)) {
            const outboundId = instance.ai_auto_reply === false
              ? null
              : await enqueueReply({
                  instance,
                  conversationId: convId,
                  remoteJid: normalized.remoteJid,
                  quotedMessageId: normalized.messageId,
                  reply,
                });

            if (outboundId) {
              logger.info({
                instance_id: instanceId,
                outbound_id: outboundId,
              }, 'AI reply queued.');
              db.addUsageEvent({
                organization_id: instance.organization_id,
                instance_id: instanceId,
                event_type: 'ai_reply.sent',
              });
            } else {
              logger.info({
                instance_id: instanceId,
                auto_reply: instance.ai_auto_reply !== false,
              }, 'AI response stored without outbound send.');
            }
          } else {
            logger.info({
              instance_id: instanceId,
            }, 'AI response did not request an outbound reply.');
          }
        } else {
          logger.debug({
            instance_id: instanceId,
            ai_enabled: Boolean(instance.ai_enabled),
            ai_provider: instance.ai_provider,
          }, 'AI routing skipped.');
        }
      } catch (err) {
        logger.error({
          instance_id: instanceId,
          ...errorDetails(err),
        }, 'Inbound WhatsApp message processing failed.');
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
