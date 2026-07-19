import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('deleteInstance removes all instance-scoped operational data in one transaction', async () => {
  const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wag-delete-instance-'));
  Object.assign(process.env, {
    SQLITE_DB_PATH: path.join(testRoot, 'gateway.db'),
    DB_PROVIDER: 'sqlite',
    ENCRYPTION_KEY: 'delete-instance-encryption-key-32',
  });

  const { db } = await import('../db');
  const instanceId = db.createInstance({
    organization_id: 'org_default',
    instance_name: 'cascade-delete-instance',
    status: 'connected',
  });
  const remoteJid = '919876543210@s.whatsapp.net';
  const conversationId = `${instanceId}_${remoteJid}`;

  db.saveAuthCreds(instanceId, 'encrypted-creds');
  db.saveAuthKey(instanceId, 'session', 'key-1', 'encrypted-key');
  db.addEventLog(instanceId, 'message.received', { text: 'hello' });
  db.upsertConversation({
    id: conversationId,
    instance_id: instanceId,
    remote_jid: remoteJid,
    last_message_at: db.now(),
  });
  const messageId = db.addMessage({
    instance_id: instanceId,
    conversation_id: conversationId,
    remote_jid: remoteJid,
    whatsapp_message_id: 'wamid-delete-test',
    direction: 'inbound',
    message_type: 'text',
    text_content: 'hello',
  });
  db.addMediaAsset({
    instance_id: instanceId,
    message_id: messageId,
    storage_provider: 'local',
    storage_path: `media/${instanceId}/message/image.jpg`,
    storage_key: `${instanceId}/message/image.jpg`,
  });
  const outboundId = db.enqueueOutboundMessage({
    instance_id: instanceId,
    organization_id: 'org_default',
    conversation_id: conversationId,
    remote_jid: remoteJid,
    reply_type: 'text',
    text_content: 'reply',
  });
  const commandId = db.enqueueWorkerCommand(instanceId, 'restart');
  const deliveryId = db.enqueueWebhookDelivery({
    instance_id: instanceId,
    event_type: 'message.received',
    target_url: 'https://example.test/webhook',
    payload: { message: 'hello' },
  });
  db.createAiRun({
    instance_id: instanceId,
    message_id: messageId,
    status: 'pending',
  });
  db.upsertContact({
    organization_id: 'org_default',
    instance_id: instanceId,
    remote_jid: remoteJid,
  });
  db.createTemplate({
    organization_id: 'org_default',
    instance_id: instanceId,
    name: 'Delete test template',
    content: 'Hello',
  });
  db.createAutoReplyRule({
    organization_id: 'org_default',
    instance_id: instanceId,
    name: 'Delete test rule',
    match_value: 'hello',
    response_payload: { text: 'Hi' },
  });
  db.upsertAgentMemory({
    instance_id: instanceId,
    contact_key: remoteJid,
    summary: 'Delete me',
  });
  db.addHealthSample({ instance_id: instanceId, status: 'connected' });
  db.recordConnectionEvent(instanceId, 'connected');
  db.addUsageEvent({
    organization_id: 'org_default',
    instance_id: instanceId,
    event_type: 'message.inbound',
  });
  db.addAuditLog({
    organization_id: 'org_default',
    instance_id: instanceId,
    action: 'delete.test',
  });

  assert.equal(db.deleteInstance(instanceId, 'another-org'), false);
  assert.ok(db.getInstance(instanceId));
  assert.equal(db.deleteInstance(instanceId, 'org_default'), true);

  assert.equal(db.getInstance(instanceId), null);
  assert.equal(db.getAuthCreds(instanceId), null);
  assert.deepEqual(db.listAuthKeys(instanceId), []);
  assert.deepEqual(db.listEventLogs(instanceId), []);
  assert.deepEqual(db.listConversations(instanceId), []);
  assert.deepEqual(db.listMessages(instanceId), []);
  assert.deepEqual(db.listAiRuns(instanceId), []);
  assert.deepEqual(db.listInstanceMediaAssets(instanceId), []);
  assert.equal(db.getOutboundMessage(outboundId), null);
  assert.equal(db.getWorkerCommand(commandId), null);
  assert.equal(db.getWebhookDelivery(deliveryId), null);
  assert.deepEqual(db.listContacts(instanceId), []);
  assert.deepEqual(db.listAutoReplyRules(instanceId), []);
  assert.equal(db.getAgentMemory(instanceId, remoteJid), null);
  assert.deepEqual(db.getInstanceHealth(instanceId), []);
});
