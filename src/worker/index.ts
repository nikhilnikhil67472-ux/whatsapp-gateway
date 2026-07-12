import { WhatsAppEngineManager } from '../lib/whatsapp-engine/manager';
import { db } from '../lib/db/sqlite';

const STARTABLE_STATUSES = new Set([
  'created',
  'waiting_qr',
  'connected',
  'disconnected',
  'reconnecting',
  'failed',
]);

async function startConfiguredInstances() {
  const instances = db.listStartableInstances([...STARTABLE_STATUSES]);

  console.log(`[worker] Found ${instances.length} startable WhatsApp instance(s).`);

  for (const instance of instances) {
    try {
      console.log(`[worker] Starting instance ${instance.id} (${(instance as any).instance_name || 'unnamed'})`);
      await WhatsAppEngineManager.startInstance(instance.id);
    } catch (err) {
      console.error(`[worker] Failed to start instance ${instance.id}:`, err);
    }
  }
}

startConfiguredInstances().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[worker] Shutting down...');
  process.exit(0);
});
