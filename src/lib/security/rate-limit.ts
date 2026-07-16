import { getRedisConnection } from '../queue/redis';
import { errorDetails, logger } from '../observability/logger';

const localBuckets = new Map<string, { count: number; resetAt: number }>();

export async function checkRateLimit(params: {
  key: string;
  limit: number;
  windowSeconds?: number;
}) {
  const windowSeconds = Math.max(1, params.windowSeconds || 60);
  const limit = Math.max(1, params.limit);
  const bucket = Math.floor(Date.now() / (windowSeconds * 1_000));
  const redisKey = `wag:rate:${params.key}:${bucket}`;
  const redis = getRedisConnection();

  if (redis) {
    try {
      if (redis.status === 'wait') await redis.connect();
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSeconds + 1);
      return {
        allowed: count <= limit,
        limit,
        remaining: Math.max(0, limit - count),
        retryAfterSeconds: windowSeconds,
      };
    } catch (error) {
      logger.error(
        errorDetails(error),
        'Redis rate limiter unavailable; using process-local fallback.',
      );
    }
  }

  const now = Date.now();
  const current = localBuckets.get(params.key);
  const state = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + windowSeconds * 1_000 }
    : current;
  state.count += 1;
  localBuckets.set(params.key, state);
  if (localBuckets.size > 10_000) {
    for (const [key, value] of localBuckets) {
      if (value.resetAt <= now) localBuckets.delete(key);
    }
  }
  return {
    allowed: state.count <= limit,
    limit,
    remaining: Math.max(0, limit - state.count),
    retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1_000)),
  };
}
