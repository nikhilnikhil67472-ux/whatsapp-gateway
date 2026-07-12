import fs from 'fs';
import path from 'path';

const POLL_INTERVAL_MS = 5000;

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

const STARTABLE_STATUSES = new Set([
  'created',
  'waiting_qr',
  'connected',
  'disconnected',
  'reconnecting',
  'failed',
]);

const activeOperations = new Set<string>();

type Runtime = {
  WhatsAppEngineManager: typeof import('../lib/whatsapp-engine/manager').WhatsAppEngineManager;
  db: typeof import('../lib/db/sqlite').db;
};

async function startConfiguredInstances({ WhatsAppEngineManager, db }: Runtime) {
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

async function main() {
  const [{ WhatsAppEngineManager }, { db }] = await Promise.all([
    import('../lib/whatsapp-engine/manager'),
    import('../lib/db/sqlite'),
  ]);

  const runtime = { WhatsAppEngineManager, db };
  console.log(`[worker] APP_BASE_URL=${process.env.APP_BASE_URL || '(not set)'}`);

  await startConfiguredInstances(runtime);

  setInterval(() => {
    startConfiguredInstances(runtime).catch((err) => {
      console.error('[worker] Polling error:', err);
    });
  }, POLL_INTERVAL_MS);
}

main().catch((err) => {
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
