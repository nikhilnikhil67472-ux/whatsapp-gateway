import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRedisHealth } from '@/lib/queue/redis';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const instances = db.listInstances();
  const queues = db.getQueueStats();
  const redis = await getRedisHealth();
  const operations = db.getOperationalStats();
  const configuration = {
    appBaseUrl: Boolean(process.env.APP_BASE_URL),
    encryptionKey: Boolean(process.env.ENCRYPTION_KEY?.length === 32),
    gatewayApiKey: Boolean(process.env.GATEWAY_API_KEY),
    dashboardAuth: Boolean(
      process.env.DASHBOARD_PASSWORD
      && (process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || '').length >= 32
    ),
  };
  const productionReady = Object.values(configuration).every(Boolean)
    && (process.env.REDIS_REQUIRED !== 'true' || redis.connected);
  return NextResponse.json(
    {
      status: productionReady ? 'ok' : 'degraded',
      database: 'ok',
      app: 'online',
      instances: instances.length,
      connectedInstances: instances.filter((instance: any) => instance.status === 'connected').length,
      waitingQrInstances: instances.filter((instance: any) => instance.status === 'waiting_qr').length,
      queues,
      redis,
      operations,
      configuration,
      checkedAt: new Date().toISOString(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
