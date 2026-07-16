import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  authorizeGatewayRequest,
  generateApiKey,
  hashApiKey,
} from './api-key';
import { shouldUseSecureDashboardCookie } from './dashboard-auth';
import { createWebhookHeaders } from '../webhooks/signature';

test('instance API keys authenticate without storing the raw value', () => {
  const key = generateApiKey();
  const request = new Request('http://localhost/api/whatsapp/send', {
    headers: { Authorization: `Bearer ${key}` },
  });
  const result = authorizeGatewayRequest(request, { api_key_hash: hashApiKey(key) });

  assert.equal(result.ok, true);
  assert.match(key, /^wag_/);
});

test('webhook signature covers timestamp and exact body', () => {
  const payload = JSON.stringify({ event: 'message.received', value: 42 });
  const secret = 'test-signing-secret';
  const headers = createWebhookHeaders({
    payload,
    eventType: 'message.received',
    deliveryId: 'delivery-1',
    secret,
  });

  const timestamp = headers['X-Webhook-Timestamp'];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');

  assert.equal(headers['X-Webhook-Signature'], `sha256=${expected}`);
  assert.equal(headers['X-Webhook-Delivery'], 'delivery-1');
});

test('dashboard cookies follow the public request protocol behind a proxy', () => {
  assert.equal(shouldUseSecureDashboardCookie({
    forwardedProtocol: 'http',
    requestProtocol: 'http:',
  }), false);
  assert.equal(shouldUseSecureDashboardCookie({
    forwardedProtocol: 'https',
    requestProtocol: 'http:',
  }), true);
  assert.equal(shouldUseSecureDashboardCookie({
    forwardedProtocol: 'https, http',
    requestProtocol: 'http:',
  }), true);
});
