import { PDFParse } from 'pdf-parse';
import { decrypt } from '../security/encrypt';

type IntelligenceOptions = {
  instance: Record<string, any>;
  mediaType: string;
  mimeType: string;
  fileName: string;
  buffer: Buffer;
};

export type MediaIntelligence = {
  transcription?: string;
  analysis?: string;
  extractedText?: string;
  errors?: string[];
};

async function fetchAiProvider(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(process.env.AI_PROVIDER_TIMEOUT_MS || 60_000),
  );
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function aiKey(instance: Record<string, any>, provider: string) {
  if (instance.ai_api_key_encrypted) return decrypt(instance.ai_api_key_encrypted);
  if (provider === 'anthropic') return process.env.ANTHROPIC_API_KEY || null;
  return process.env.OPENAI_API_KEY || null;
}

async function transcribeAudio(options: IntelligenceOptions) {
  const key = process.env.OPENAI_TRANSCRIPTION_API_KEY || aiKey(options.instance, 'openai');
  if (!key) throw new Error('OpenAI transcription key is not configured');

  const form = new FormData();
  const fileBytes = Uint8Array.from(options.buffer);
  form.set('model', process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe');
  form.set('file', new Blob([fileBytes], { type: options.mimeType }), options.fileName);
  if (process.env.TRANSCRIPTION_LANGUAGE) {
    form.set('language', process.env.TRANSCRIPTION_LANGUAGE);
  }

  const response = await fetchAiProvider('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const result = await response.json() as { text?: string; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Transcription HTTP ${response.status}`);
  return result.text?.trim() || '';
}

async function analyzeImageWithOpenAi(options: IntelligenceOptions) {
  const key = aiKey(options.instance, 'openai');
  if (!key) throw new Error('OpenAI API key is not configured');
  const response = await fetchAiProvider('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.instance.ai_model || process.env.OPENAI_MODEL || 'gpt-5-mini',
      instructions: 'Describe the image accurately for a customer-support AI. Extract visible text and important objects. Be concise.',
      input: [{
        role: 'user',
        content: [{
          type: 'input_image',
          image_url: `data:${options.mimeType};base64,${options.buffer.toString('base64')}`,
          detail: 'auto',
        }],
      }],
    }),
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(result.error?.message || `OpenAI vision HTTP ${response.status}`);
  return String(result.output_text || '').trim();
}

async function analyzeImageWithAnthropic(options: IntelligenceOptions) {
  const key = aiKey(options.instance, 'anthropic');
  if (!key) throw new Error('Anthropic API key is not configured');
  const response = await fetchAiProvider('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: options.instance.ai_model || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: 'Describe the image accurately for a customer-support AI. Extract visible text and important objects. Be concise.',
      messages: [{
        role: 'user',
        content: [{
          type: 'image',
          source: {
            type: 'base64',
            media_type: options.mimeType,
            data: options.buffer.toString('base64'),
          },
        }],
      }],
    }),
  });
  const result = await response.json() as any;
  if (!response.ok) throw new Error(result.error?.message || `Anthropic vision HTTP ${response.status}`);
  return (result.content || [])
    .filter((item: any) => item.type === 'text')
    .map((item: any) => item.text)
    .join('\n')
    .trim();
}

async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, Number(process.env.MAX_EXTRACTED_DOCUMENT_CHARS || 100_000));
  } finally {
    await parser.destroy();
  }
}

export async function processMediaIntelligence(options: IntelligenceOptions): Promise<MediaIntelligence> {
  const result: MediaIntelligence = {};
  const errors: string[] = [];

  if (
    options.instance.media_transcription_enabled
    && ['voice', 'audio'].includes(options.mediaType)
  ) {
    try {
      result.transcription = await transcribeAudio(options);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Audio transcription failed');
    }
  }

  if (options.instance.media_vision_enabled && ['image', 'sticker'].includes(options.mediaType)) {
    try {
      result.analysis = options.instance.ai_provider === 'anthropic'
        ? await analyzeImageWithAnthropic(options)
        : await analyzeImageWithOpenAi(options);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Image analysis failed');
    }
  }

  if (
    options.instance.document_extraction_enabled
    && options.mimeType.includes('pdf')
  ) {
    try {
      result.extractedText = await extractPdfText(options.buffer);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'PDF extraction failed');
    }
  }

  if (errors.length) result.errors = errors;
  return result;
}
