import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { errorDetails, logger } from '../observability/logger';

export const QUEUE_NAMES = {
  outbound: 'wag-outbound',
  webhook: 'wag-webhook',
  command: 'wag-command',
} as const;

export type QueueKind = keyof typeof QUEUE_NAMES;

const state = globalThis as typeof globalThis & {
  wagRedis?: IORedis;
  wagQueues?: Partial<Record<QueueKind, Queue>>;
  wagRedisFailedAt?: number;
};

export function redisConfigured() {
  return Boolean(process.env.REDIS_URL);
}

export function getRedisConnection() {
  if (!redisConfigured()) return null;
  if (state.wagRedis) return state.wagRedis;

  const redis = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });
  redis.on('error', (error) => {
    state.wagRedisFailedAt = Date.now();
    logger.error(errorDetails(error), 'Redis connection error.');
  });
  state.wagRedis = redis;
  return redis;
}

async function ensureRedisConnected(redis: IORedis) {
  if (redis.status === 'wait') await redis.connect();
  if (redis.status === 'end') throw new Error('Redis connection is closed');
}

function getQueue(kind: QueueKind) {
  const connection = getRedisConnection();
  if (!connection) return null;
  state.wagQueues ||= {};
  state.wagQueues[kind] ||= new Queue(QUEUE_NAMES[kind], {
    connection,
    defaultJobOptions: {
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    },
  });
  return state.wagQueues[kind]!;
}

export async function publishQueueJob(
  kind: QueueKind,
  recordId: string,
  options: { delay?: number } = {},
) {
  const queue = getQueue(kind);
  if (!queue) return false;

  try {
    const redis = getRedisConnection();
    if (redis) await ensureRedisConnected(redis);
    await queue.add(kind, { recordId }, {
      jobId: `${kind}:${recordId}:${Math.floor(Date.now() / 1_000)}`,
      delay: Math.max(0, options.delay || 0),
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
    });
    return true;
  } catch (error) {
    logger.error({
      queue_kind: kind,
      record_id: recordId,
      ...errorDetails(error),
    }, 'BullMQ publish failed; SQLite polling will recover the record.');
    return false;
  }
}

export async function getRedisHealth() {
  if (!redisConfigured()) {
    return { configured: false, connected: false, latencyMs: null as number | null };
  }
  const redis = getRedisConnection();
  if (!redis) return { configured: true, connected: false, latencyMs: null as number | null };

  const startedAt = Date.now();
  try {
    await ensureRedisConnected(redis);
    await redis.ping();
    return { configured: true, connected: true, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      latencyMs: null as number | null,
      error: error instanceof Error ? error.message : 'Redis health check failed',
    };
  }
}

export async function closeRedisResources() {
  await Promise.allSettled(
    Object.values(state.wagQueues || {}).map((queue) => queue?.close()),
  );
  state.wagQueues = {};
  if (state.wagRedis) {
    await state.wagRedis.quit().catch(() => state.wagRedis?.disconnect());
    state.wagRedis = undefined;
  }
}
