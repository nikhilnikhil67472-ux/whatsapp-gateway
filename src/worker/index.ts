import { WhatsAppEngineManager } from '../lib/whatsapp-engine/manager';
import { db } from '../lib/db/sqlite';

const POLL_INTERVAL_MS = 5000;

const STARTABLE_STATUSES = new Set([
  'created',
  'waiting_qr',
  'connected',
  'disconnected',
  'reconnecting',
  'failed',
]);

const activeOperations = new Set<string>();

async function startConfiguredInstances() {
  const instances = db.listStartableInstances([...STARTABLE_STATUSES]);

  console.log(`[worker] Found ${instances.length} startable WhatsApp instance(s).`);

  for (const instance of instances) {
    const shouldRestart = (instance as any).status === 'reconnecting';
    if (!shouldRestart && WhatsAppEngineManager.getSocket(instance.id)) continue;
    if (activeOperations.has(instance.id)) continue;

    activeOperations.add(instance.id);
    try {
      if (shouldRestart) {
        console.log(`[worker] Restarting instance ${instance.id} (${(instance as any).instance_name || 'unnamed'})`);
        db.updateInstance(instance.id, {
          status: 'disconnected',
          qr_base64: null,
          last_disconnection_at: new Date().toISOString(),
        });
        await WhatsAppEngineManager.restartInstance(instance.id);
      } else {
        console.log(`[worker] Starting instance ${instance.id} (${(instance as any).instance_name || 'unnamed'})`);
        await WhatsAppEngineManager.startInstance(instance.id);
      }
    } catch (err) {
      console.error(`[worker] Failed to start instance ${instance.id}:`, err);
    } finally {
      setTimeout(() => activeOperations.delete(instance.id), POLL_INTERVAL_MS);
    }
  }
}

startConfiguredInstances().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exitCode = 1;
});

setInterval(() => {
  startConfiguredInstances().catch((err) => {
    console.error('[worker] Polling error:', err);
  });
}, POLL_INTERVAL_MS);

process.on('SIGINT', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
