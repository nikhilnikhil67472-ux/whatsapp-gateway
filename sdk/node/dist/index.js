import crypto from 'node:crypto';
export class WhatsAppGatewayClient {
    baseUrl;
    apiKey;
    timeoutMs;
    constructor(options) {
        this.baseUrl = options.baseUrl.replace(/\/$/, '');
        this.apiKey = options.apiKey;
        this.timeoutMs = options.timeoutMs || 20_000;
    }
    async health() {
        return this.request('/api/health', { authenticated: false });
    }
    async sendText(input) {
        return this.request('/api/whatsapp/send', {
            method: 'POST',
            body: {
                ...input,
                type: 'text',
            },
        });
    }
    async sendMedia(input) {
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
    async sendAudio(input) {
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
    async sendLocation(input) {
        return this.request('/api/whatsapp/send', {
            method: 'POST',
            body: {
                ...input,
                type: 'location',
            },
        });
    }
    async sendContact(input) {
        return this.request('/api/whatsapp/send', {
            method: 'POST',
            body: {
                ...input,
                type: 'contact',
            },
        });
    }
    async request(path, options = {}) {
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
export function verifyWebhookSignature(params) {
    const timestamp = Number(params.timestamp);
    if (!Number.isFinite(timestamp))
        return false;
    if (Math.abs(Date.now() - timestamp * 1_000)
        > (params.toleranceSeconds || 300) * 1_000) {
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
