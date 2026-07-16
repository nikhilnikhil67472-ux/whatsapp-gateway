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
