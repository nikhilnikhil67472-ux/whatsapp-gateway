import { db } from '../db/sqlite';
import { decrypt } from '../security/encrypt';
import { ProcessedMedia } from '../whatsapp-engine/media';
import { NormalizedWhatsAppMessage } from '../whatsapp-engine/normalize';
import { processWithN8n } from './n8n-client';

type AgentParams = {
  instance: Record<string, any>;
  normalizedMessage: NormalizedWhatsAppMessage & { raw: any };
  processedMedia: ProcessedMedia | null;
  dbMessageId: string;
};

type DirectAgentResult = {
  reply: true;
  type: 'text';
  text: string;
};

function getApiKey(instance: Record<string, any>, provider: 'openai' | 'anthropic') {
  if (instance.ai_api_key_encrypted) return decrypt(instance.ai_api_key_encrypted);
  return provider === 'openai'
    ? process.env.OPENAI_API_KEY || null
    : process.env.ANTHROPIC_API_KEY || null;
}

function currentText(params: AgentParams) {
  const { normalizedMessage, processedMedia } = params;
  const parts = [
    normalizedMessage.text,
    normalizedMessage.caption,
    processedMedia?.transcription
      ? `Voice note transcription:\n${processedMedia.transcription}`
      : null,
    processedMedia?.aiDescription
      ? `Image analysis:\n${processedMedia.aiDescription}`
      : null,
    processedMedia?.extractedText
      ? `Document text:\n${processedMedia.extractedText}`
      : null,
  ].filter(Boolean);
  return parts.join('\n\n') || `[Customer sent a ${normalizedMessage.type} message]`;
}

function history(params: AgentParams) {
  const limit = Math.max(1, Math.min(100, Number(params.instance.ai_memory_messages || 20)));
  return db.getRecentMessages(
    params.instance.id,
    params.normalizedMessage.remoteJid,
    limit,
  ).reverse().map((message: any) => ({
    role: message.from_me ? 'assistant' : 'user',
    text: message.text_content || message.caption || `[${message.message_type || 'message'}]`,
  }));
}

function systemPrompt(instance: Record<string, any>) {
  return instance.ai_system_prompt
    || process.env.DEFAULT_AI_SYSTEM_PROMPT
    || 'You are a helpful WhatsApp business assistant. Reply clearly and briefly. Never claim an action was completed unless the available context confirms it.';
}

async function processOpenAi(params: AgentParams): Promise<DirectAgentResult | null> {
  const key = getApiKey(params.instance, 'openai');
  if (!key) throw new Error('OpenAI API key is not configured');
  const model = params.instance.ai_model || process.env.OPENAI_MODEL || 'gpt-5-mini';
  const runId = db.createAiRun({
    instance_id: params.instance.id,
    message_id: params.dbMessageId,
    provider: 'openai',
    model,
    status: 'processing',
  });
  const startedAt = Date.now();

  try {
    const content: any[] = [{ type: 'input_text', text: currentText(params) }];
    if (
      params.processedMedia?.buffer
      && ['image', 'sticker'].includes(params.processedMedia.mediaType)
    ) {
      content.push({
        type: 'input_image',
        image_url: `data:${params.processedMedia.mimeType};base64,${params.processedMedia.buffer.toString('base64')}`,
        detail: 'auto',
      });
    }
    if (
      params.processedMedia?.buffer
      && params.processedMedia.mimeType.includes('pdf')
      && !params.processedMedia.extractedText
    ) {
      content.push({
        type: 'input_file',
        filename: params.processedMedia.fileName,
        file_data: params.processedMedia.buffer.toString('base64'),
      });
    }

    const input = [
      ...history(params).slice(0, -1).map((message) => ({
        role: message.role,
        content: message.text,
      })),
      { role: 'user', content },
    ];
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.AI_PROVIDER_TIMEOUT_MS || 60_000),
    );
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          instructions: systemPrompt(params.instance),
          input,
          store: false,
          max_output_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1_000),
        }),
        signal: controller.signal,
      });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error?.message || `OpenAI HTTP ${response.status}`);
      const text = String(result.output_text || '').trim();
      db.updateAiRun(runId, {
        status: text ? 'success' : 'success_empty',
        response_payload: { text, response_id: result.id },
        duration_ms: Date.now() - startedAt,
        prompt_tokens: result.usage?.input_tokens || null,
        completion_tokens: result.usage?.output_tokens || null,
        completed_at: db.now(),
      });
      return text ? { reply: true, type: 'text', text } : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    db.updateAiRun(runId, {
      status: 'error',
      error_message: error instanceof Error ? error.message : 'OpenAI request failed',
      duration_ms: Date.now() - startedAt,
      completed_at: db.now(),
    });
    throw error;
  }
}

async function processAnthropic(params: AgentParams): Promise<DirectAgentResult | null> {
  const key = getApiKey(params.instance, 'anthropic');
  if (!key) throw new Error('Anthropic API key is not configured');
  const model = params.instance.ai_model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
  const runId = db.createAiRun({
    instance_id: params.instance.id,
    message_id: params.dbMessageId,
    provider: 'anthropic',
    model,
    status: 'processing',
  });
  const startedAt = Date.now();

  try {
    const content: any[] = [{ type: 'text', text: currentText(params) }];
    if (
      params.processedMedia?.buffer
      && ['image', 'sticker'].includes(params.processedMedia.mediaType)
    ) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: params.processedMedia.mimeType,
          data: params.processedMedia.buffer.toString('base64'),
        },
      });
    }
    const messages = [
      ...history(params).slice(0, -1).map((message) => ({
        role: message.role,
        content: message.text,
      })),
      { role: 'user', content },
    ];
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      Number(process.env.AI_PROVIDER_TIMEOUT_MS || 60_000),
    );
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          system: systemPrompt(params.instance),
          max_tokens: Number(process.env.AI_MAX_OUTPUT_TOKENS || 1_000),
          messages,
        }),
        signal: controller.signal,
      });
      const result = await response.json() as any;
      if (!response.ok) throw new Error(result.error?.message || `Anthropic HTTP ${response.status}`);
      const text = (result.content || [])
        .filter((item: any) => item.type === 'text')
        .map((item: any) => item.text)
        .join('\n')
        .trim();
      db.updateAiRun(runId, {
        status: text ? 'success' : 'success_empty',
        response_payload: { text, response_id: result.id },
        duration_ms: Date.now() - startedAt,
        prompt_tokens: result.usage?.input_tokens || null,
        completion_tokens: result.usage?.output_tokens || null,
        completed_at: db.now(),
      });
      return text ? { reply: true, type: 'text', text } : null;
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    db.updateAiRun(runId, {
      status: 'error',
      error_message: error instanceof Error ? error.message : 'Anthropic request failed',
      duration_ms: Date.now() - startedAt,
      completed_at: db.now(),
    });
    throw error;
  }
}

function updateMemory(params: AgentParams, reply: any) {
  if (!reply) return;
  const memory = db.getAgentMemory(params.instance.id, params.normalizedMessage.remoteJid);
  const messages = [
    ...(memory?.messages || []),
    { role: 'user', text: currentText(params), at: db.now() },
    {
      role: 'assistant',
      text: reply.text || reply.output || '',
      at: db.now(),
    },
  ].slice(-Math.max(2, Number(params.instance.ai_memory_messages || 20)));
  db.upsertAgentMemory({
    instance_id: params.instance.id,
    contact_key: params.normalizedMessage.remoteJid,
    summary: memory?.summary || null,
    facts: memory?.facts || [],
    messages,
  });
}

export async function processWithAgent(params: AgentParams) {
  const provider = params.instance.ai_provider || 'webhook';
  let reply: any;
  if (provider === 'openai') {
    reply = await processOpenAi(params);
  } else if (provider === 'anthropic') {
    reply = await processAnthropic(params);
  } else {
    if (!params.instance.n8n_webhook_url) return null;
    reply = await processWithN8n({
      instanceId: params.instance.id,
      instanceName: params.instance.instance_name,
      clientId: params.instance.client_id,
      n8nWebhookUrl: params.instance.n8n_webhook_url,
      n8nSecret: params.instance.n8n_secret_encrypted
        ? decrypt(params.instance.n8n_secret_encrypted)
        : null,
      webhookSecret: params.instance.webhook_secret,
      normalizedMessage: params.normalizedMessage,
      processedMedia: params.processedMedia,
      dbMessageId: params.dbMessageId,
    });
  }
  updateMemory(params, reply);
  return reply;
}
