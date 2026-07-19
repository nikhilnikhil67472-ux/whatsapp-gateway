import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { NextRequest } from 'next/server';

type SendResponse = {
  success?: boolean;
  error?: string;
  queued?: boolean;
  data?: {
    id: string;
    instanceId: string;
    remoteJid: string;
    status: string;
  };
};

type InstanceResponse = {
  success?: boolean;
  error?: string;
  data?: {
    id: string;
    instanceName: string;
    organization_id?: string;
    apiKey?: string;
  };
};

let db: typeof import('../../lib/db').db;
let sendMessage: typeof import('./whatsapp/send/route').POST;
let createInstance: typeof import('./instances/create/route').POST;
let getInstance: typeof import('./instances/[id]/route').GET;
let createWebhookHeaders: typeof import('../../lib/webhooks/signature').createWebhookHeaders;
let verifyWebhookSignature: typeof import('../../lib/webhooks/signature').verifyWebhookSignature;
let gatewayProxy: typeof import('../../proxy').proxy;
let dashboardCookie = '';
let orgASession = '';
let orgBSession = '';
let sendApiKey = '';
let sendInstanceId = '';
let orgAInstanceId = '';
let orgBInstanceId = '';

test.before(async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wag-api-routes-'));
  Object.assign(process.env, {
    SQLITE_DB_PATH: path.join(testRoot, 'gateway.db'),
    DB_PROVIDER: 'sqlite',
    NODE_ENV: 'production',
    DASHBOARD_PASSWORD: 'integration-test-password',
    AUTH_SECRET: 'integration-test-auth-secret-32-chars',
    ENCRYPTION_KEY: 'integration-test-encryption-key-32',
    ALLOW_INSECURE_API: 'false',
    API_RATE_LIMIT_PER_MINUTE: '1000',
  });
  delete process.env.GATEWAY_API_KEY;
  delete process.env.API_IP_ALLOWLIST;
  delete process.env.REDIS_URL;
  delete process.env.HACKATHON_PUBLIC_MODE;
  delete process.env.HACKATHON_PUBLIC_HOST;

  const [
    dbModule,
    sendRoute,
    createRoute,
    instanceRoute,
    apiKeyModule,
    dashboardAuth,
    webhookSignature,
    proxyModule,
  ] = await Promise.all([
    import('../../lib/db'),
    import('./whatsapp/send/route'),
    import('./instances/create/route'),
    import('./instances/[id]/route'),
    import('../../lib/security/api-key'),
    import('../../lib/security/dashboard-auth'),
    import('../../lib/webhooks/signature'),
    import('../../proxy'),
  ]);

  db = dbModule.db;
  sendMessage = sendRoute.POST;
  createInstance = createRoute.POST;
  getInstance = instanceRoute.GET;
  createWebhookHeaders = webhookSignature.createWebhookHeaders;
  verifyWebhookSignature = webhookSignature.verifyWebhookSignature;
  gatewayProxy = proxyModule.proxy;
  dashboardCookie = dashboardAuth.DASHBOARD_COOKIE;
  orgASession = dashboardAuth.createDashboardSession({
    userId: 'user-org-a',
    organizationId: 'org-a',
    role: 'admin',
    email: 'admin-a@example.test',
  });
  orgBSession = dashboardAuth.createDashboardSession({
    userId: 'user-org-b',
    organizationId: 'org-b',
    role: 'admin',
    email: 'admin-b@example.test',
  });

  sendApiKey = apiKeyModule.generateApiKey();
  sendInstanceId = db.createInstance({
    organization_id: 'org-a',
    instance_name: 'send-route-instance',
    status: 'connected',
    api_key_hash: apiKeyModule.hashApiKey(sendApiKey),
    api_key_prefix: sendApiKey.slice(0, 10),
  });
  orgAInstanceId = db.createInstance({
    organization_id: 'org-a',
    instance_name: 'org-a-instance',
    status: 'created',
  });
  orgBInstanceId = db.createInstance({
    organization_id: 'org-b',
    instance_name: 'org-b-instance',
    status: 'created',
  });
});

function postJson(url: string, body: unknown, options: {
  apiKey?: string;
  session?: string;
} = {}) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (options.apiKey) headers.set('Authorization', `Bearer ${options.apiKey}`);
  if (options.session) headers.set('Cookie', `${dashboardCookie}=${options.session}`);
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function getRequest(url: string, session?: string) {
  const headers = new Headers();
  if (session) headers.set('Cookie', `${dashboardCookie}=${session}`);
  return new NextRequest(url, { headers });
}

function validSendPayload() {
  return {
    instanceId: sendInstanceId,
    phoneNumber: '919876543210',
    type: 'text',
    text: 'Integration test message',
  };
}

test('POST /api/whatsapp/send queues a valid authenticated message', async () => {
  const response = await sendMessage(postJson(
    'http://localhost/api/whatsapp/send',
    validSendPayload(),
    { apiKey: sendApiKey },
  ));
  const body = await response.json() as SendResponse;

  assert.equal(response.status, 202);
  assert.equal(body.success, true);
  assert.equal(body.queued, true);
  assert.equal(body.data?.instanceId, sendInstanceId);
  assert.equal(body.data?.remoteJid, '919876543210@s.whatsapp.net');
  assert.equal(body.data?.status, 'pending');
  assert.equal(db.getOutboundMessage(body.data?.id || '')?.status, 'pending');
});

test('POST /api/whatsapp/send rejects a missing API key', async () => {
  const response = await sendMessage(postJson(
    'http://localhost/api/whatsapp/send',
    validSendPayload(),
  ));
  const body = await response.json() as SendResponse;

  assert.equal(response.status, 401);
  assert.equal(body.error, 'Missing API key');
});

test('POST /api/whatsapp/send rejects an invalid API key', async () => {
  const response = await sendMessage(postJson(
    'http://localhost/api/whatsapp/send',
    validSendPayload(),
    { apiKey: 'wag_invalid-integration-key' },
  ));
  const body = await response.json() as SendResponse;

  assert.equal(response.status, 403);
  assert.equal(body.error, 'Invalid API key');
});

test('POST /api/whatsapp/send rejects missing type-specific fields', async () => {
  const response = await sendMessage(postJson(
    'http://localhost/api/whatsapp/send',
    {
      instanceId: sendInstanceId,
      phoneNumber: '919876543210',
      type: 'text',
    },
    { apiKey: sendApiKey },
  ));
  const body = await response.json() as SendResponse;

  assert.equal(response.status, 400);
  assert.equal(body.error, 'Missing required fields for the specified type');
});

test('POST /api/instances/create requires dashboard authentication', async () => {
  const response = await createInstance(postJson(
    'http://localhost/api/instances/create',
    { instanceName: 'unauthorized-instance' },
  ));
  const body = await response.json() as InstanceResponse;

  assert.equal(response.status, 401);
  assert.equal(body.error, 'Dashboard login required');
});

test('POST /api/instances/create creates an org-scoped instance and queues startup', async () => {
  const response = await createInstance(postJson(
    'http://localhost/api/instances/create',
    { instanceName: 'org-a-created-instance' },
    { session: orgASession },
  ));
  const body = await response.json() as InstanceResponse;
  const instance = db.getInstance(body.data?.id || '');
  const command = db.listPendingWorkerCommands(20)
    .find((entry) => entry.instance_id === body.data?.id);

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.match(body.data?.apiKey || '', /^wag_/);
  assert.equal(instance?.organization_id, 'org-a');
  assert.equal(command?.command, 'start');
});

test('GET /api/instances/[id] requires dashboard authentication', async () => {
  const response = await getInstance(
    getRequest(`http://localhost/api/instances/${orgAInstanceId}`),
    { params: Promise.resolve({ id: orgAInstanceId }) },
  );
  const body = await response.json() as InstanceResponse;

  assert.equal(response.status, 401);
  assert.equal(body.error, 'Dashboard login required');
});

test('GET /api/instances/[id] returns an instance within the session organization', async () => {
  const response = await getInstance(
    getRequest(`http://localhost/api/instances/${orgAInstanceId}`, orgASession),
    { params: Promise.resolve({ id: orgAInstanceId }) },
  );
  const body = await response.json() as InstanceResponse;

  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data?.id, orgAInstanceId);
});

test('GET /api/instances/[id] hides another organization instance', async () => {
  const denied = await getInstance(
    getRequest(`http://localhost/api/instances/${orgBInstanceId}`, orgASession),
    { params: Promise.resolve({ id: orgBInstanceId }) },
  );
  const allowed = await getInstance(
    getRequest(`http://localhost/api/instances/${orgBInstanceId}`, orgBSession),
    { params: Promise.resolve({ id: orgBInstanceId }) },
  );

  assert.equal(denied.status, 404);
  assert.equal(allowed.status, 200);
});

test('hackathon public mode bypasses API and dashboard auth on the exact host only', async () => {
  process.env.HACKATHON_PUBLIC_MODE = 'true';
  process.env.HACKATHON_PUBLIC_HOST = 'codex-hackathon-winner.duckdns.org';

  try {
    const publicSend = await sendMessage(postJson(
      'https://codex-hackathon-winner.duckdns.org/api/whatsapp/send',
      validSendPayload(),
    ));
    assert.equal(publicSend.status, 202);

    const protectedSend = await sendMessage(postJson(
      'http://54.226.66.175/api/whatsapp/send',
      validSendPayload(),
    ));
    assert.equal(protectedSend.status, 401);

    const created = await createInstance(postJson(
      'https://codex-hackathon-winner.duckdns.org/api/instances/create',
      { instanceName: 'public-judge-instance' },
    ));
    const createdBody = await created.json() as InstanceResponse;
    assert.equal(created.status, 200);
    assert.equal(createdBody.data?.organization_id, undefined);
    assert.equal(
      db.getInstance(createdBody.data?.id || '')?.organization_id,
      'org_default',
    );

    const fetched = await getInstance(
      getRequest(
        `https://codex-hackathon-winner.duckdns.org/api/instances/${createdBody.data?.id}`,
      ),
      { params: Promise.resolve({ id: createdBody.data?.id || '' }) },
    );
    assert.equal(fetched.status, 200);

    const dashboardResponse = gatewayProxy(new NextRequest(
      'https://codex-hackathon-winner.duckdns.org/dashboard/instances',
    ));
    assert.equal(dashboardResponse.headers.get('x-middleware-next'), '1');

    const protectedDashboard = gatewayProxy(new NextRequest(
      'http://54.226.66.175/dashboard/instances',
    ));
    assert.equal(protectedDashboard.status, 307);
    assert.match(protectedDashboard.headers.get('location') || '', /\/login/);
  } finally {
    delete process.env.HACKATHON_PUBLIC_MODE;
    delete process.env.HACKATHON_PUBLIC_HOST;
  }
});

test('webhook signatures reject tampering and otherwise valid expired deliveries', () => {
  const payload = JSON.stringify({ event: 'message.received', messageId: 'wamid-1' });
  const secret = 'integration-webhook-secret';
  const headers = createWebhookHeaders({
    payload,
    eventType: 'message.received',
    deliveryId: 'delivery-integration-1',
    secret,
  });
  const timestamp = headers['X-Webhook-Timestamp'];
  const signature = headers['X-Webhook-Signature'];

  assert.equal(verifyWebhookSignature({
    payload,
    timestamp,
    signature,
    secret,
  }), true);
  assert.equal(verifyWebhookSignature({
    payload: `${payload} `,
    timestamp,
    signature,
    secret,
  }), false);

  const actualNow = Date.now;
  Date.now = () => actualNow() + 10 * 60 * 1_000;
  try {
    assert.equal(verifyWebhookSignature({
      payload,
      timestamp,
      signature,
      secret,
    }), false);
  } finally {
    Date.now = actualNow;
  }
});
