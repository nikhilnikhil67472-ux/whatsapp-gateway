import assert from 'node:assert/strict';
import test from 'node:test';
import { getEventSettings } from './event-settings';
import { toPublicInstance } from '../instances/public-instance';
import { enrichSenderIdentity } from './identity';
import { NormalizedWhatsAppMessage } from './normalize';

test('event settings preserve defaults while applying instance overrides', () => {
  const settings = getEventSettings({
    event_settings: {
      messages: { include_media_base64: true },
      groups: { ignore_group_messages: false },
    },
  });

  assert.equal(settings.messages.include_media_base64, true);
  assert.equal(settings.messages.receive_private_messages, true);
  assert.equal(settings.groups.ignore_group_messages, false);
});

test('public instances never expose encrypted bearer secrets or API hashes', () => {
  const instance = toPublicInstance({
    id: 'one',
    instance_name: 'primary',
    n8n_secret_encrypted: 'encrypted',
    api_key_hash: 'hash',
    api_key_prefix: 'wag_123',
    webhook_secret: 'signing-secret',
  });

  assert.equal(instance ? 'n8n_secret_encrypted' in instance : true, false);
  assert.equal(instance ? 'api_key_hash' in instance : true, false);
  assert.equal(instance ? 'webhook_secret' in instance : true, false);
  assert.equal(instance?.has_n8n_secret, true);

  const developerInstance = toPublicInstance({
    id: 'one',
    webhook_secret: 'signing-secret',
  }, { includeWebhookSecret: true });
  assert.equal(
    (developerInstance as Record<string, any>)?.webhook_secret,
    'signing-secret',
  );
});

test('LID senders are resolved to a phone-number JID when Baileys has a mapping', async () => {
  const message = {
    instanceId: 'one',
    remoteJid: '123456@lid',
    senderJid: '123456@lid',
    isGroup: false,
    fromMe: false,
    messageId: 'message-1',
    type: 'text',
    text: 'hello',
    raw: { key: {} },
  } as NormalizedWhatsAppMessage;
  const socket = {
    signalRepository: {
      lidMapping: {
        getPNForLID: async () => '919876543210@s.whatsapp.net',
      },
    },
  };

  await enrichSenderIdentity(socket, message);
  assert.equal(message.senderPhoneNumber, '919876543210');
  assert.equal(message.senderPhoneJid, '919876543210@s.whatsapp.net');
  assert.equal(message.senderLid, '123456');
});
