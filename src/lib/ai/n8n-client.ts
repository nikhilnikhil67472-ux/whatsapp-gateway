import { NormalizedWhatsAppMessage } from '../whatsapp-engine/normalize';
import { ProcessedMedia } from '../whatsapp-engine/media';
import { db } from '../db/sqlite';

export interface N8nProcessParams {
  instanceId: string;
  instanceName: string;
  clientId?: string;
  n8nWebhookUrl: string;
  n8nSecret: string | null;
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
    console.error('Failed to fetch history for AI', err);
  }

  // 2. Prepare payload
  const senderPhone = normalizedMessage.senderPhoneNumber || null;
  const senderLid = normalizedMessage.senderLid || null;
  const senderJid = normalizedMessage.senderJid || normalizedMessage.remoteJid;
  const payload = {
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
      from: normalizedMessage.remoteJid,
      from_number: senderPhone,
      from_lid: senderLid,
      push_name: normalizedMessage.pushName,
      is_group: normalizedMessage.isGroup,
      type: normalizedMessage.type,
      text: normalizedMessage.text,
      caption: normalizedMessage.caption,
    },
    media: processedMedia ? {
      type: processedMedia.mediaType,
      mime_type: processedMedia.mimeType,
      url: processedMedia.publicUrl
    } : null,
    history
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (n8nSecret) {
    headers['Authorization'] = `Bearer ${n8nSecret}`;
  }

  // 3. Log AI run start
  const runId = db.createAiRun({
    instance_id: instanceId,
    message_id: dbMessageId,
    n8n_url: n8nWebhookUrl,
    status: 'processing',
  });

  // 4. Fire Webhook
  try {
    const start = Date.now();
    console.log(`[n8n] Sending payload to webhook...`);
    const response = await fetch(n8nWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    console.log(`[n8n] Webhook responded with status: ${response.status}`);

    const duration = Date.now() - start;

    if (!response.ok) {
      const errText = await response.text();
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
      error_message: error.message,
      completed_at: new Date().toISOString()
    });
    return null;
  }
}
