import fs from 'fs';
import path from 'path';
import { errorDetails, logger } from '../lib/observability/logger';

const POLL_INTERVAL_MS = Number(process.env.WORKER_POLL_INTERVAL_MS || 2_000);
let shuttingDown = false;
let pollTimer: NodeJS.Timeout | null = null;
let lastMaintenanceAt = 0;
let lastHealthMonitorAt = 0;
let bullWorkers: Array<{ close: () => Promise<void> }> = [];

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

let captureWorkerException: (
  error: unknown,
  context?: Record<string, unknown>,
) => void = () => {};

const STARTABLE_STATUSES = ['created', 'waiting_qr', 'connecting', 'connected', 'disconnected', 'reconnecting'];
const activeOperations = new Set<string>();

type Runtime = {
  WhatsAppEngineManager: typeof import('../lib/whatsapp-engine/manager').WhatsAppEngineManager;
  db: typeof import('../lib/db').db;
  sendText: typeof import('../lib/whatsapp-engine/send').sendText;
  sendMedia: typeof import('../lib/whatsapp-engine/send').sendMedia;
  sendAudio: typeof import('../lib/whatsapp-engine/send').sendAudio;
  sendLocation: typeof import('../lib/whatsapp-engine/send').sendLocation;
  sendContact: typeof import('../lib/whatsapp-engine/send').sendContact;
  decrypt: typeof import('../lib/security/encrypt').decrypt;
  createWebhookHeaders: typeof import('../lib/webhooks/signature').createWebhookHeaders;
  publishQueueJob: typeof import('../lib/queue/redis').publishQueueJob;
  deleteStoredMedia: typeof import('../lib/media/storage').deleteStoredMedia;
};

async function processWorkerCommands(runtime: Runtime, recordId?: string) {
  const { WhatsAppEngineManager, db } = runtime;
  const commands = (
    recordId ? [db.getWorkerCommand(recordId)] : db.listPendingWorkerCommands(20)
  ).filter(Boolean);

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
      const pending = db.getWorkerCommand(command.id);
      if (pending?.status === 'pending') {
        await runtime.publishQueueJob('command', command.id, { delay: 2_000 });
      }
      logger.error({
        command: command.command,
        command_id: command.id,
        instance_id: command.instance_id,
        ...errorDetails(error),
      }, 'Worker command failed.');
      captureWorkerException(error, {
        phase: 'worker_command',
        command: command.command,
        instance_id: command.instance_id,
      });
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
      logger.error({
        instance_id: instance.id,
        ...errorDetails(error),
      }, 'Worker failed to start WhatsApp instance.');
      captureWorkerException(error, {
        phase: 'instance_start',
        instance_id: instance.id,
      });
    } finally {
      activeOperations.delete(instance.id);
    }
  }
}

async function processPendingOutboundMessages(runtime: Runtime, recordId?: string) {
  const {
    db,
    sendText,
    sendMedia,
    sendAudio,
    sendLocation,
    sendContact,
  } = runtime;
  const pending = (
    recordId ? [db.getOutboundMessage(recordId)] : db.listPendingOutboundMessages(20)
  ).filter(Boolean);

  for (const message of pending) {
    if (!db.markOutboundMessageSending(message.id)) continue;

    try {
      const instance = db.getInstance(message.instance_id);
      if (!instance) throw new Error('WhatsApp instance no longer exists');
      const contact = db.getContactByRemoteJid(message.instance_id, message.remote_jid);
      if (contact?.opted_out && !message.payload?.allowOptedOut) {
        throw new Error('Recipient opted out of automated messages');
      }
      const perMinute = Math.max(1, Number(instance.outbound_per_minute || 30));
      const recentCount = db.countRecentOutbound(
        message.instance_id,
        message.remote_jid,
        new Date(Date.now() - 60_000).toISOString(),
      );
      if (recentCount > perMinute) {
        throw new Error(`Anti-spam throttle: maximum ${perMinute} messages per minute per contact`);
      }
      if (instance.sandbox_mode) {
        db.markOutboundMessageSimulated(message.id);
        db.addEventLog(message.instance_id, 'message.sandbox_sent', {
          outbound_id: message.id,
          remote_jid: message.remote_jid,
          type: message.reply_type,
        });
        continue;
      }

      let sendResult: any;
      if (message.reply_type === 'text') {
        sendResult = await sendText({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          text: message.text_content,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'media') {
        sendResult = await sendMedia({
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
        sendResult = await sendAudio({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          audioUrl: message.media_url || undefined,
          base64: message.payload?.base64,
          mimeType: message.mime_type || undefined,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'location') {
        sendResult = await sendLocation({
          instanceId: message.instance_id,
          remoteJid: message.remote_jid,
          latitude: message.payload.latitude,
          longitude: message.payload.longitude,
          name: message.payload.name || undefined,
          address: message.payload.address || undefined,
          quotedMessageId: message.quoted_message_id || undefined,
        });
      } else if (message.reply_type === 'contact') {
        sendResult = await sendContact({
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
      const sentAt = db.now();
      db.upsertConversation({
        id: message.conversation_id || `${message.instance_id}_${message.remote_jid}`,
        instance_id: message.instance_id,
        remote_jid: message.remote_jid,
        is_group: message.remote_jid.endsWith('@g.us'),
        last_message_at: sentAt,
        direction: 'outbound',
      });
      db.addMessage({
        instance_id: message.instance_id,
        conversation_id: message.conversation_id || `${message.instance_id}_${message.remote_jid}`,
        remote_jid: message.remote_jid,
        whatsapp_message_id: sendResult?.key?.id || `outbound_${message.id}`,
        from_me: true,
        direction: 'outbound',
        message_type: message.reply_type,
        text_content: message.text_content,
        raw_payload: sendResult || { outbound_id: message.id },
        created_at: sentAt,
      });
      db.addUsageEvent({
        organization_id: instance.organization_id,
        instance_id: message.instance_id,
        api_key_id: message.api_key_id || null,
        event_type: 'message.outbound',
      });
      logger.info({
        outbound_id: message.id,
        instance_id: message.instance_id,
        remote_jid: message.remote_jid,
      }, 'Outbound WhatsApp message sent.');
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Failed to send outbound message';
      db.markOutboundMessageFailed(message.id, messageText);
      const retry = db.getOutboundMessage(message.id);
      if (retry?.status === 'retry') {
        await runtime.publishQueueJob('outbound', message.id, {
          delay: Math.max(0, Date.parse(retry.next_attempt_at) - Date.now()),
        });
      }
      logger.error({
        outbound_id: message.id,
        instance_id: message.instance_id,
        ...errorDetails(error),
      }, 'Outbound WhatsApp message failed.');
      captureWorkerException(error, {
        phase: 'outbound_send',
        outbound_id: message.id,
        instance_id: message.instance_id,
      });
    }
  }
}

async function processWebhookDeliveries(runtime: Runtime, recordId?: string) {
  const { db, decrypt, createWebhookHeaders } = runtime;
  const deliveries = (
    recordId ? [db.getWebhookDelivery(recordId)] : db.listPendingWebhookDeliveries(20)
  ).filter(Boolean);

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
    const startedAt = Date.now();

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

      const responseBody = (await response.text()).slice(0, 4_000);
      if (!response.ok) {
        throw Object.assign(new Error(`HTTP ${response.status}: ${responseBody}`), {
          responseStatus: response.status,
          responseBody,
        });
      }

      db.markWebhookDeliveryDelivered(
        delivery.id,
        response.status,
        responseBody || null,
        Date.now() - startedAt,
      );
    } catch (error) {
      const typedError = error as Error & { responseStatus?: number; responseBody?: string };
      db.markWebhookDeliveryFailed(
        delivery.id,
        typedError.name === 'AbortError'
          ? 'Webhook request timed out'
          : typedError.message || 'Webhook delivery failed',
        typedError.responseStatus,
        typedError.responseBody || null,
        Date.now() - startedAt,
      );
      const retry = db.getWebhookDelivery(delivery.id);
      if (retry?.status === 'retry') {
        await runtime.publishQueueJob('webhook', delivery.id, {
          delay: Math.max(0, Date.parse(retry.next_attempt_at) - Date.now()),
        });
      }
      logger.error({
        delivery_id: delivery.id,
        instance_id: delivery.instance_id,
        ...errorDetails(error),
      }, 'Webhook delivery failed.');
      captureWorkerException(error, {
        phase: 'webhook_delivery',
        delivery_id: delivery.id,
        instance_id: delivery.instance_id,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function startBullMqWorkers(runtime: Runtime) {
  const [
    { Worker },
    { getRedisConnection, QUEUE_NAMES, redisConfigured },
  ] = await Promise.all([
    import('bullmq'),
    import('../lib/queue/redis'),
  ]);
  if (!redisConfigured()) return;
  const connection = getRedisConnection();
  if (!connection) return;
  if (connection.status === 'wait') await connection.connect();

  bullWorkers = [
    new Worker(
      QUEUE_NAMES.command,
      async (job) => processWorkerCommands(runtime, String(job.data.recordId)),
      { connection, concurrency: 5 },
    ),
    new Worker(
      QUEUE_NAMES.outbound,
      async (job) => processPendingOutboundMessages(runtime, String(job.data.recordId)),
      { connection, concurrency: Number(process.env.OUTBOUND_QUEUE_CONCURRENCY || 10) },
    ),
    new Worker(
      QUEUE_NAMES.webhook,
      async (job) => processWebhookDeliveries(runtime, String(job.data.recordId)),
      { connection, concurrency: Number(process.env.WEBHOOK_QUEUE_CONCURRENCY || 20) },
    ),
  ];

  for (const worker of bullWorkers as any[]) {
    worker.on('error', (error: Error) => {
      logger.error(errorDetails(error), 'BullMQ worker error.');
      captureWorkerException(error, { phase: 'bullmq_worker' });
    });
  }
  logger.info('BullMQ workers are active.');
}

async function runMaintenance({ db, deleteStoredMedia }: Runtime) {
  const intervalMs = Number(process.env.MAINTENANCE_INTERVAL_MS || 6 * 60 * 60 * 1_000);
  if (Date.now() - lastMaintenanceAt < intervalMs) return;
  lastMaintenanceAt = Date.now();

  const retentionDays = Number(process.env.DATA_RETENTION_DAYS || 30);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1_000).toISOString();
  const expiredMedia = db.listExpiredMediaAssets(cutoff, 500);
  const deletedIds: string[] = [];

  for (const asset of expiredMedia) {
    try {
      await deleteStoredMedia(asset);
      deletedIds.push(asset.id);
    } catch (error) {
      logger.error({
        media_asset_id: asset.id,
        ...errorDetails(error),
      }, 'Failed to delete expired media.');
      captureWorkerException(error, {
        phase: 'media_retention',
        media_asset_id: asset.id,
      });
    }
  }

  db.deleteMediaAssets(deletedIds);
  db.purgeOperationalRecords(cutoff);
}

async function runHealthMonitor({ WhatsAppEngineManager }: Runtime) {
  const intervalMs = Number(process.env.INSTANCE_HEALTH_INTERVAL_MS || 30_000);
  if (Date.now() - lastHealthMonitorAt < intervalMs) return;
  lastHealthMonitorAt = Date.now();
  await WhatsAppEngineManager.runHealthMonitor();
}

async function main() {
  const sentry = await import('../lib/observability/sentry-worker');
  sentry.initWorkerSentry();
  captureWorkerException = sentry.captureWorkerException;

  const [
    { WhatsAppEngineManager },
    { db },
    { sendText, sendMedia, sendAudio, sendLocation, sendContact },
    { decrypt },
    { createWebhookHeaders },
    { publishQueueJob },
    { deleteStoredMedia },
  ] = await Promise.all([
    import('../lib/whatsapp-engine/manager'),
    import('../lib/db'),
    import('../lib/whatsapp-engine/send'),
    import('../lib/security/encrypt'),
    import('../lib/webhooks/signature'),
    import('../lib/queue/redis'),
    import('../lib/media/storage'),
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
    publishQueueJob,
    deleteStoredMedia,
  };

  logger.info({
    app_base_url_configured: Boolean(process.env.APP_BASE_URL),
    redis_configured: Boolean(process.env.REDIS_URL),
  }, 'WhatsApp gateway worker started.');
  await startBullMqWorkers(runtime).catch((error) => {
    logger.error(errorDetails(error), 'BullMQ startup failed; using SQLite polling.');
    captureWorkerException(error, { phase: 'bullmq_startup' });
  });

  const poll = async () => {
    if (shuttingDown) return;
    await processWorkerCommands(runtime);
    await startConfiguredInstances(runtime);
    await processPendingOutboundMessages(runtime);
    await processWebhookDeliveries(runtime);
    await runHealthMonitor(runtime);
    await runMaintenance(runtime);
  };

  const schedulePoll = () => {
    pollTimer = setTimeout(async () => {
      try {
        await poll();
      } catch (error) {
        logger.error(errorDetails(error), 'Worker polling cycle failed.');
        captureWorkerException(error, { phase: 'poll' });
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
    logger.info({ signal }, 'Worker shutdown started.');
    await Promise.allSettled(bullWorkers.map((worker) => worker.close()));
    await WhatsAppEngineManager.shutdownAll();
    const { closeRedisResources } = await import('../lib/queue/redis');
    await closeRedisResources();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.fatal(errorDetails(error), 'Worker fatal startup error.');
  captureWorkerException(error, { phase: 'startup' });
  process.exitCode = 1;
});
