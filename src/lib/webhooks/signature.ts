import crypto from 'crypto';

export function createWebhookHeaders(params: {
  payload: string;
  eventType: string;
  deliveryId: string;
  secret?: string | null;
  authorization?: string | null;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'whatsapp-gateway/2.0',
    'X-Webhook-Event': params.eventType,
    'X-Webhook-Delivery': params.deliveryId,
    'X-Webhook-Timestamp': timestamp,
  };

  if (params.authorization) {
    headers.Authorization = `Bearer ${params.authorization}`;
  }

  if (params.secret) {
    const signature = crypto
      .createHmac('sha256', params.secret)
      .update(`${timestamp}.${params.payload}`)
      .digest('hex');
    headers['X-Webhook-Signature'] = `sha256=${signature}`;
  }

  return headers;
}

export function verifyWebhookSignature(params: {
  payload: string;
  timestamp: string | null;
  signature: string | null;
  secret: string | null | undefined;
  toleranceSeconds?: number;
}) {
  if (!params.secret || !params.timestamp || !params.signature) return false;
  const timestamp = Number(params.timestamp);
  if (!Number.isFinite(timestamp)) return false;
  const tolerance = (params.toleranceSeconds || 300) * 1_000;
  if (Math.abs(Date.now() - timestamp * 1_000) > tolerance) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', params.secret)
    .update(`${params.timestamp}.${params.payload}`)
    .digest('hex')}`;
  const supplied = Buffer.from(params.signature);
  const expectedBuffer = Buffer.from(expected);
  return supplied.length === expectedBuffer.length
    && crypto.timingSafeEqual(supplied, expectedBuffer);
}
