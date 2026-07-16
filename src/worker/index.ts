import fs from 'fs';
import path from 'path';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 2_000);
let shuttingDown = false;
let pollTimer: NodeJS.Timeout | null = null;
let lastMaintenanceAt = 0;

function loadLocalEnv() {
  for (const fileName of ['.env.local', '.env']) {
    const envPath = path.join(process.cwd(), fileName);
    if (!fs.existsSync(envPath)) continue;

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const separatorIndex = trimmed.indexOf('=');
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      if (!key || process.env[key] !== undefined) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }
}

loadLocalEnv();

const STARTABLE_STATUSES = ['created', 'waiting_qr', 'connecting', 'connected', 'disconnected', 'reconnecting'];
const activeOperations = new Set<string>();

type Runtime = {
  WhatsAppEngineManager: typeof import('../lib/whatsapp-engine/manager').WhatsAppEngineManager;
  db: typeof import('../lib/db/sqlite').db;
  sendText: typeof import('../lib/whatsapp-engine/send').sendText;
  sendMedia: typeof import('../lib/whatsapp-engine/send').sendMedia;
  sendAudio: typeof import('../lib/whatsapp-engine/send').sendAudio;
  sendLocation: typeof import('../lib/whatsapp-engine/send').sendLocation;
  sendContact: typeof import('../lib/whatsapp-engine/send').sendContact;
  decrypt: typeof import('../lib/security/encrypt').decrypt;
  createWebhookHeaders: typeof import('../lib/webhooks/signature').createWebhookHeaders;
};

async function processWorkerCommands(runtime: Runtime) {
  const { WhatsAppEngineManager, db } = runtime;
  const commands = db.listPendingWorkerCommands(20).filter(Boolean);

  for (const command of commands) {
    if (!db.markWorkerCommandProcessing(command.id)) continue;

    try {
      if (command.command === 'start') {
        await WhatsAppEngineManager.startInstance(command.instance_id);
      } else if (command.command === 'restart') {
        await WhatsAppEngineManager.restartInstance(command.instance_id);
      } else if (command.command === 'logout') {
        await WhatsAppEngineManager.logoutInstance(command.instance_id);
      } else if (command.command === 'stop') {
        await WhatsAppEngineManager.stopInstance(command.instance_id);
      } else {
        throw new Error(`Unsupported worker command: ${command.command}`);
      }
      db.completeWorkerCommand(command.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Worker command failed';
      db.failWorkerCommand(command.id, message);
      console.error(`[worker] Command ${command.command} failed for ${command.instance_id}:`, error);
    }
  }
}

async function startConfiguredInstances({ WhatsAppEngineManager, db }: Runtime) {
  const instances = db.listStartableInstances(STARTABLE_STATUSES);

  for (const instance of instances) {
    if (WhatsAppEngineManager.getSocket(instance.id) || activeOperations.has(instance.id)) continue;
    if (instance.status === 'reconnecting' && WhatsAppEngineManager.hasReconnectScheduled(instance.id)) continue;

    activeOperations.add(instance.id);
    try {
      await WhatsAppEngineManager.startInstance(instance.id);
    } catch (error) {
      console.error(`[worker] Failed to start instance ${instance.id}:`, error);
    } finally {
      activeOperations.delete(instance.id);
    }
  }
}

async function processPendingOutboundMessages({
  db,
  sendText,
  sendMedia,
  sendAudio,
  sendLocation,
  sendContact,
}: Runtime) {
  const pending = db.listPendingOutboundMessages(20).filter(Boolean);

  for (const message of pending) {
    if (!db.markOutboundMessageSending(message.id)) continue;

    try {
      if (message.reply_type === 'text') {
        await sendText({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          text: message.text_content,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'media') {
        await sendMedia({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          mediaUrl: message.media_url || undefined,
          base64: message.payload?.base64,
          mediaType: message.media_type,
          mimeType: message.mime_type,
          caption: message.text_content || undefined,
          fileName: message.payload?.fileName,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'audio') {
        await sendAudio({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          audioUrl: message.media_url || undefined,
          base64: message.payload?.base64,
          mimeType: message.mime_type || undefined,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'location') {
        await sendLocation({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          latitude: message.payload.latitude,
          longitude: message.payload.longitude,
          name: message.payload.name || undefined,
          address: message.payload.address || undefined,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'contact') {
        await sendContact({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          displayName: message.payload.displayName,
          vcard: message.payload.vcard,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else {
        throw new Error(`Unsupported outbound message type: ${message.reply_type}`);
      }

      db.markOutboundMessageSent(message.id);
      console.log(`[worker] Sent outbound message ${message.id} to ${message.remote_jid}`);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Failed to send outbound message';
      db.markOutboundMessageFailed(message.id, messageText);
      console.error(`[worker] Outbound message ${message.id} failed:`, error);
    }
  }
}

async function processWebhookDeliveries({ db, decrypt, createWebhookHeaders }: Runtime) {
  const deliveries = db.listPendingWebhookDeliveries(20).filter(Boolean);

  for (const delivery of deliveries) {
    if (!db.markWebhookDeliverySending(delivery.id)) continue;

    const instance = db.getInstance(delivery.instance_id);
    if (!instance) {
      db.markWebhookDeliveryFailed(delivery.id, 'WhatsApp instance no longer exists');
      continue;
    }

    const payload = JSON.stringify(delivery.payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(process.env.WEBHOOK_TIMEOUT_MS || 15_000));

    try {
      const authorization = instance.n8n_secret_encrypted
        ? decrypt(instance.n8n_secret_encrypted)
        : null;
      const response = await fetch(delivery.target_url, {
        method: 'POST',
        headers: createWebhookHeaders({
          payload,
          eventType: delivery.event_type,
          deliveryId: delivery.id,
          secret: instance.webhook_secret,
          authorization,
        }),
        body: payload,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = (await response.text()).slice(0, 1_000);
        throw Object.assign(new Error(`HTTP ${response.status}: ${body}`), { responseStatus: response.status });
      }

      db.markWebhookDeliveryDelivered(delivery.id, response.status);
    } catch (error) {
      const typedError = error as Error & { responseStatus?: number };
      db.markWebhookDeliveryFailed(
        delivery.id,
        typedError.name === 'AbortError'
          ? 'Webhook request timed out'
          : typedError.message || 'Webhook delivery failed',
        typedError.responseStatus,
      );
      console.error(`[worker] Webhook delivery ${delivery.id} failed:`, error);
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function runMaintenance({ db }: Runtime) {
  const intervalMs = Number(process.env.MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1_000);
  if (Date.now() - lastMaintenanceAt < intervalMs) return;
  lastMaintenanceAt = Date.now();

  const retentionDays = Number(process.env.DATA_RETENTION_DAYS || 30);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
  const mediaRoot = path.resolve(process.cwd(), 'public', 'media');
  const expiredMedia = db.listExpiredMediaAssets(cutoff, 500);
  const deletedIds: string[] = [];

  for (const asset of expiredMedia) {
    const filePath = path.resolve(process.cwd(), 'public', asset.storage_path);
    if (!filePath.startsWith(`${mediaRoot}${path.sep}`)) continue;
    try {
      await fs.promises.unlink(filePath);
      deletedIds.push(asset.id);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') deletedIds.push(asset.id);
      else console.error(`[worker] Failed to delete expired media ${asset.id}:`, error);
    }
  }

  db.deleteMediaAssets(deletedIds);
  db.purgeOperationalRecords(cutoff);
}

async function main() {
  const [
    { WhatsAppEngineManager },
    { db },
    { sendText, sendMedia, sendAudio, sendLocation, sendContact },
    { decrypt },
    { createWebhookHeaders },
  ] = await Promise.all([
    import('../lib/whatsapp-engine/manager'),
    import('../lib/db/sqlite'),
    import('../lib/whatsapp-engine/send'),
    import('../lib/security/encrypt'),
    import('../lib/webhooks/signature'),
  ]);

  const runtime = {
    WhatsAppEngineManager,
    db,
    sendText,
    sendMedia,
    sendAudio,
    sendLocation,
    sendContact,
    decrypt,
    createWebhookHeaders,
  };

  console.log(`[worker] Started. APP_BASE_URL=${process.env.APP_BASE_URL || '(not set)'}`);

  const poll = async () => {
    if (shuttingDown) return;
    await processWorkerCommands(runtime);
    await startConfiguredInstances(runtime);
    await processPendingOutboundMessages(runtime);
    await processWebhookDeliveries(runtime);
    await runMaintenance(runtime);
  };

  const schedulePoll = () => {
    pollTimer = setTimeout(async () => {
      try {
        await poll();
      } catch (error) {
        console.error('[worker] Polling error:', error);
      } finally {
        if (!shuttingDown) schedulePoll();
      }
    }, POLL_INTERVAL_MS);
  };

  await poll();
  schedulePoll();

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (pollTimer) clearTimeout(pollTimer);
    console.log(`[worker] ${signal} received, closing WhatsApp sockets...`);
    await WhatsAppEngineManager.shutdownAll();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[worker] Fatal startup error:', error);
  process.exitCode = 1;
});
