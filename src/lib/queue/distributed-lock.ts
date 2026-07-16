import crypto from 'node:crypto';
import { getRedisConnection, redisConfigured } from './redis';
import { errorDetails, logger } from '../observability/logger';

export type DistributedLease = {
  acquired: boolean;
  distributed: boolean;
  release: () => Promise<void>;
};

const releaseScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
  return 0
`;

const renewScript = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("pexpire", KEYS[1], ARGV[2])
  end
  return 0
`;

export async function acquireDistributedLease(
  resource: string,
  ttlMs = Number(process.env.INSTANCE_LOCK_TTL_MS || 45_000),
): Promise<DistributedLease> {
  if (!redisConfigured()) {
    return { acquired: true, distributed: false, release: async () => undefined };
  }

  const redis = getRedisConnection();
  if (!redis) {
    return { acquired: false, distributed: true, release: async () => undefined };
  }

  try {
    if (redis.status === 'wait') await redis.connect();
    const key = `wag:lock:${resource}`;
    const token = `${process.env.NODE_ID || process.pid}:${crypto.randomUUID()}`;
    const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') {
      return { acquired: false, distributed: true, release: async () => undefined };
    }

    let released = false;
    const renewEveryMs = Math.max(5_000, Math.floor(ttlMs / 3));
    const renewTimer = setInterval(async () => {
      if (released) return;
      try {
        const renewed = await redis.eval(renewScript, 1, key, token, String(ttlMs));
        if (renewed !== 1) {
          logger.error({ resource }, 'Distributed lease was lost.');
          clearInterval(renewTimer);
        }
      } catch (error) {
        logger.error({
          resource,
          ...errorDetails(error),
        }, 'Failed to renew distributed lease.');
      }
    }, renewEveryMs);
    renewTimer.unref?.();

    return {
      acquired: true,
      distributed: true,
      release: async () => {
        if (released) return;
        released = true;
        clearInterval(renewTimer);
        await redis.eval(releaseScript, 1, key, token).catch(() => undefined);
      },
    };
  } catch (error) {
    logger.error({
      resource,
      ...errorDetails(error),
    }, 'Redis lease acquisition failed.');
    if (process.env.REDIS_REQUIRED === 'true') {
      return { acquired: false, distributed: true, release: async () => undefined };
    }
    return { acquired: true, distributed: false, release: async () => undefined };
  }
}
