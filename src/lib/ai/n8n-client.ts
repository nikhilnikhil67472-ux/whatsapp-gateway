import { NormalizedWhatsAppMessage } from '../whatsapp-engine/normalize';
import { ProcessedMedia } from '../whatsapp-engine/media';
import { db } from '../db';
import crypto from 'crypto';
import { createWebhookHeaders } from '../webhooks/signature';
import { errorDetails, logger } from '../observability/logger';

export interface N8nProcessParams {
  instanceId: string;
  instanceName: string;
  clientId?: string;
  n8nWebhookUrl: string;
  n8nSecret: string | null;
  webhookSecret?: string | null;
  normalizedMessage: NormalizedWhatsAppMessage & { raw: any };
  processedMedia: ProcessedMedia | null;
  dbMessageId: string;
}

export async function processWithN8n(params: N8nProcessParams): Promise<any> {
  const {
    instanceId,
    instanceName,
    clientId,
    n8nWebhookUrl,
    n8nSecret,
    webhookSecret,
    normalizedMessage,
    processedMedia,
    dbMessageId
  } = params;

  // 1. Fetch recent history
  let history: any[] = [];
  try {
    history = db.getRecentMessages(instanceId, normalizedMessage.remoteJid, 10).map((data: any) => ({
      role: data.from_me ? 'assistant' : 'user',
      text: data.text_content || data.caption || '',
      timestamp: data.created_at || new Date().toISOString()
    })).reverse();
  } catch (err) {
    logger.warn({
      instance_id: instanceId,
      ...errorDetails(err),
    }, 'Failed to load conversation history for the AI webhook.');
  }

  // 2. Prepare payload
  const senderPhone = normalizedMessage.senderPhoneNumber || null;
  const senderLid = normalizedMessage.senderLid || null;
  const senderJid = normalizedMessage.senderPhoneJid || normalizedMessage.senderJid || normalizedMessage.remoteJid;
  const payload = {
    event: 'message.received',
    timestamp: new Date().toISOString(),
    instance: {
      id: instanceId,
      name: instanceName,
      client_id: clientId,
    },
    sender: {
      jid: senderJid,
      chat_jid: normalizedMessage.remoteJid,
      alt_jid: normalizedMessage.senderAltJid || normalizedMessage.remoteAltJid || null,
      phone_number: senderPhone,
      display_number: normalizedMessage.senderDisplayNumber || null,
      lid: senderLid,
      id_type: senderPhone ? 'phone' : senderLid ? 'lid' : 'unknown',
      phone_unavailable_reason: senderPhone ? null : senderLid ? 'WhatsApp sent a LID/private ID and no phone-number mapping was available yet.' : 'No sender phone number was available in this event.',
      push_name: normalizedMessage.pushName,
      is_group: normalizedMessage.isGroup,
    },
    message: {
      id: dbMessageId,
      whatsapp_id: normalizedMessage.messageId,
      from: normalizedMessage.isGroup ? normalizedMessage.remoteJid : senderJid,
      chat_jid: normalizedMessage.remoteJid,
      from_number: senderPhone,
      from_lid: senderLid,
      push_name: normalizedMessage.pushName,
      is_group: normalizedMessage.isGroup,
      type: normalizedMessage.type,
      text: normalizedMessage.text,
      caption: normalizedMessage.caption,
      timestamp: normalizedMessage.timestamp,
      data: normalizedMessage.data,
    },
    media: processedMedia ? {
      type: processedMedia.mediaType,
      media_type: processedMedia.mediaType,
      mimetype: processedMedia.mimeType,
      mime_type: processedMedia.mimeType,
      file_name: processedMedia.fileName,
      size_bytes: processedMedia.sizeBytes,
      url: processedMedia.publicUrl,
      base64_data: processedMedia.base64Data,
      transcription: processedMedia.transcription,
      vision_analysis: processedMedia.aiDescription,
      analysis: processedMedia.aiDescription,
      extracted_text: processedMedia.extractedText,
      intelligence_errors: processedMedia.intelligenceErrors,
    } : null,
    history
  };
  const deliveryId = crypto.randomUUID();
  const serializedPayload = JSON.stringify(payload);
  const headers = createWebhookHeaders({
    payload: serializedPayload,
    eventType: 'message.received',
    deliveryId,
    secret: webhookSecret,
    authorization: n8nSecret,
  });

  // 3. Log AI run start
  const runId = db.createAiRun({
    instance_id: instanceId,
    message_id: dbMessageId,
    n8n_url: n8nWebhookUrl,
    status: 'processing',
  });

  // 4. Fire Webhook
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.AI_WEBHOOK_TIMEOUT_MS || 45_000),
  );

  try {
    const start = Date.now();
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers,
      body: serializedPayload,
      signal: controller.signal,
    });

    logger.info({
      instance_id: instanceId,
      ai_run_id: runId,
      response_status: response.status,
    }, 'AI webhook responded.');

    const duration = Date.now() - start;

    if (!response.ok) {
      const errText = (await response.text()).slice(0, 2_000);
      db.updateAiRun(runId, {
        status: 'error',
        error_message: `HTTP ${response.status}: ${errText}`,
        completed_at: new Date().toISOString(),
        duration_ms: duration
      });
      return null;
    }

    const responseText = await response.text();
    let responseData: any = null;

    if (responseText.trim()) {
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = { output: responseText };
      }
    }

    db.updateAiRun(runId, {
      status: responseData ? 'success' : 'success_empty',
      response_payload: responseData || { raw_response: '', note: 'Webhook returned HTTP success with an empty body.' },
      error_message: responseData ? null : 'Webhook reached n8n, but it returned an empty response body.',
      completed_at: new Date().toISOString(),
      duration_ms: duration
    });

    return responseData;

  } catch (error: any) {
    db.updateAiRun(runId, {
      status: 'error',
      error_message: error.name === 'AbortError' ? 'AI webhook request timed out' : error.message,
      completed_at: new Date().toISOString()
    });
    logger.error({
      instance_id: instanceId,
      ai_run_id: runId,
      ...errorDetails(error),
    }, 'AI webhook request failed.');
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
