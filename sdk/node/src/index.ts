import crypto from 'node:crypto';

export type GatewayClientOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
};

export type SendTarget = {
  instanceId: string;
  phoneNumber?: string;
  remoteJid?: string;
};

export type SendTextInput = SendTarget & {
  text: string;
  quotedMessageId?: string;
};

export type SendMediaInput = SendTarget & {
  mediaUrl?: string;
  base64?: string;
  mediaType: 'image' | 'video' | 'document';
  mimeType: string;
  fileName?: string;
  caption?: string;
  quotedMessageId?: string;
};

export type SendAudioInput = SendTarget & {
  audioUrl?: string;
  base64?: string;
  mimeType?: string;
  quotedMessageId?: string;
};

export type SendLocationInput = SendTarget & {
  latitude: number;
  longitude: number;
  locationName?: string;
  address?: string;
  quotedMessageId?: string;
};

export type SendContactInput = SendTarget & {
  contactName: string;
  vcard: string;
  quotedMessageId?: string;
};

export class WhatsAppGatewayClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(options: GatewayClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs || 20_000;
  }

  async health() {
    return this.request('/api/health', { authenticated: false });
  }

  async sendText(input: SendTextInput) {
    return this.request('/api/whatsapp/send', {
      method: 'POST',
      body: {
        ...input,
        type: 'text',
      },
    });
  }

  async sendMedia(input: SendMediaInput) {
    const { caption, ...rest } = input;
    return this.request('/api/whatsapp/send', {
      method: 'POST',
      body: {
        ...rest,
        type: 'media',
        text: caption,
      },
    });
  }

  async sendAudio(input: SendAudioInput) {
    const { audioUrl, ...rest } = input;
    return this.request('/api/whatsapp/send', {
      method: 'POST',
      body: {
        ...rest,
        type: 'audio',
        mediaUrl: audioUrl,
      },
    });
  }

  async sendLocation(input: SendLocationInput) {
    return this.request('/api/whatsapp/send', {
      method: 'POST',
      body: {
        ...input,
        type: 'location',
      },
    });
  }

  async sendContact(input: SendContactInput) {
    return this.request('/api/whatsapp/send', {
      method: 'POST',
      body: {
        ...input,
        type: 'contact',
      },
    });
  }

  private async request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      authenticated?: boolean;
    } = {},
  ) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.authenticated === false ? {} : {
          Authorization: `Bearer ${this.apiKey}`,
        }),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `Gateway request failed with HTTP ${response.status}`);
    }
    return data;
  }
}

export function verifyWebhookSignature(params: {
  payload: string;
  timestamp: string;
  signature: string;
  secret: string;
  toleranceSeconds?: number;
}) {
  const timestamp = Number(params.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (
    Math.abs(Date.now() - timestamp * 1_000)
    > (params.toleranceSeconds || 300) * 1_000
  ) {
    return false;
  }
  const expected = `sha256=${crypto
    .createHmac('sha256', params.secret)
    .update(`${params.timestamp}.${params.payload}`)
    .digest('hex')}`;
  const actualBuffer = Buffer.from(params.signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}
