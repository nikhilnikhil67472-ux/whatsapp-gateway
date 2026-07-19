import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {
  authorizeGatewayRequest,
  generateApiKey,
  hashApiKey,
} from './api-key';
import {
  readDashboardSession,
  shouldUseSecureDashboardCookie,
} from './dashboard-auth';
import {
  decryptStoredValue,
  encryptStoredValue,
  isEncryptedStoredValue,
} from './encrypt';
import {
  createWebhookHeaders,
  verifyWebhookSignature,
} from '../webhooks/signature';
import { hashPassword, verifyPassword } from './password';
import {
  isHackathonPublicHeaders,
  isHackathonPublicModeConfigured,
  isHackathonPublicRequest,
} from './hackathon-public-mode';

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
  assert.equal(verifyWebhookSignature({
    payload,
    timestamp,
    signature: headers['X-Webhook-Signature'],
    secret,
  }), true);
  assert.equal(verifyWebhookSignature({
    payload: `${payload} `,
    timestamp,
    signature: headers['X-Webhook-Signature'],
    secret,
  }), false);
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

test('database secrets are encrypted and legacy plaintext remains migratable', () => {
  const previousKey = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = '12345678901234567890123456789012';
  try {
    const encrypted = encryptStoredValue('session-json');
    assert.equal(isEncryptedStoredValue(encrypted), true);
    assert.equal(decryptStoredValue(encrypted).value, 'session-json');
    assert.deepEqual(decryptStoredValue('legacy-json'), {
      value: 'legacy-json',
      migrated: false,
    });
  } finally {
    process.env.ENCRYPTION_KEY = previousKey;
  }
});

test('legacy dashboard sessions retain bootstrap administrator access until expiry', () => {
  const previousPassword = process.env.DASHBOARD_PASSWORD;
  const previousSecret = process.env.AUTH_SECRET;
  process.env.DASHBOARD_PASSWORD = 'test-password';
  process.env.AUTH_SECRET = '12345678901234567890123456789012';
  try {
    const payload = Buffer.from(JSON.stringify({
      expiresAt: Date.now() + 60_000,
    })).toString('base64url');
    const signature = crypto
      .createHmac('sha256', process.env.AUTH_SECRET)
      .update(payload)
      .digest('base64url');
    const session = readDashboardSession(`${payload}.${signature}`);
    assert.equal(session?.userId, 'user_admin');
    assert.equal(session?.organizationId, 'org_default');
    assert.equal(session?.role, 'admin');
  } finally {
    process.env.DASHBOARD_PASSWORD = previousPassword;
    process.env.AUTH_SECRET = previousSecret;
  }
});

test('team passwords use salted scrypt hashes', () => {
  const first = hashPassword('correct horse battery staple');
  const second = hashPassword('correct horse battery staple');
  assert.notEqual(first, second);
  assert.equal(verifyPassword('correct horse battery staple', first), true);
  assert.equal(verifyPassword('wrong password', first), false);
});

test('hackathon public mode only matches the configured hostname', () => {
  const previousMode = process.env.HACKATHON_PUBLIC_MODE;
  const previousHost = process.env.HACKATHON_PUBLIC_HOST;
  process.env.HACKATHON_PUBLIC_MODE = 'true';
  process.env.HACKATHON_PUBLIC_HOST = 'codex-hackathon-winner.duckdns.org';

  try {
    assert.equal(isHackathonPublicModeConfigured(), true);
    assert.equal(isHackathonPublicRequest(new Request(
      'https://codex-hackathon-winner.duckdns.org/api/whatsapp/send',
    )), true);
    assert.equal(isHackathonPublicHeaders(new Headers({
      host: 'CODEX-HACKATHON-WINNER.DUCKDNS.ORG:443',
    })), true);
    assert.equal(isHackathonPublicRequest(new Request(
      'http://54.226.66.175/api/whatsapp/send',
    )), false);
    assert.equal(isHackathonPublicRequest(new Request(
      'https://codex-hackathon-winner.duckdns.org.example.com/api/whatsapp/send',
    )), false);
  } finally {
    if (previousMode === undefined) delete process.env.HACKATHON_PUBLIC_MODE;
    else process.env.HACKATHON_PUBLIC_MODE = previousMode;
    if (previousHost === undefined) delete process.env.HACKATHON_PUBLIC_HOST;
    else process.env.HACKATHON_PUBLIC_HOST = previousHost;
  }
});

test('hackathon public mode remains closed when disabled or missing a host', () => {
  const previousMode = process.env.HACKATHON_PUBLIC_MODE;
  const previousHost = process.env.HACKATHON_PUBLIC_HOST;

  try {
    process.env.HACKATHON_PUBLIC_MODE = 'false';
    process.env.HACKATHON_PUBLIC_HOST = 'codex-hackathon-winner.duckdns.org';
    assert.equal(isHackathonPublicModeConfigured(), false);

    process.env.HACKATHON_PUBLIC_MODE = 'true';
    delete process.env.HACKATHON_PUBLIC_HOST;
    assert.equal(isHackathonPublicModeConfigured(), false);
    assert.equal(isHackathonPublicRequest(new Request(
      'https://codex-hackathon-winner.duckdns.org/dashboard/instances',
    )), false);
  } finally {
    if (previousMode === undefined) delete process.env.HACKATHON_PUBLIC_MODE;
    else process.env.HACKATHON_PUBLIC_MODE = previousMode;
    if (previousHost === undefined) delete process.env.HACKATHON_PUBLIC_HOST;
    else process.env.HACKATHON_PUBLIC_HOST = previousHost;
  }
});

test('hackathon public mode bypasses configured API and metrics credentials', async () => {
  const previousMode = process.env.HACKATHON_PUBLIC_MODE;
  const previousHost = process.env.HACKATHON_PUBLIC_HOST;
  const previousMetricsToken = process.env.METRICS_TOKEN;
  process.env.HACKATHON_PUBLIC_MODE = 'true';
  process.env.HACKATHON_PUBLIC_HOST = 'codex-hackathon-winner.duckdns.org';
  process.env.METRICS_TOKEN = 'private-metrics-token';

  try {
    const gatewayAuthorization = authorizeGatewayRequest(new Request(
      'https://codex-hackathon-winner.duckdns.org/api/whatsapp/send',
    ));
    assert.equal(gatewayAuthorization.ok, true);
    if (gatewayAuthorization.ok) {
      assert.equal(gatewayAuthorization.source, 'hackathon-public');
    }

    const { GET: getMetrics } = await import('../../app/metrics/route');
    const metricsResponse = await getMetrics(new Request(
      'https://codex-hackathon-winner.duckdns.org/metrics',
    ));
    const protectedMetricsResponse = await getMetrics(new Request(
      'http://54.226.66.175/metrics',
    ));
    assert.equal(metricsResponse.status, 200);
    assert.equal(protectedMetricsResponse.status, 401);
  } finally {
    if (previousMode === undefined) delete process.env.HACKATHON_PUBLIC_MODE;
    else process.env.HACKATHON_PUBLIC_MODE = previousMode;
    if (previousHost === undefined) delete process.env.HACKATHON_PUBLIC_HOST;
    else process.env.HACKATHON_PUBLIC_HOST = previousHost;
    if (previousMetricsToken === undefined) delete process.env.METRICS_TOKEN;
    else process.env.METRICS_TOKEN = previousMetricsToken;
  }
});
