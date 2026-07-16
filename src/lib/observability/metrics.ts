import {
  collectDefaultMetrics,
  Gauge,
  Registry,
} from 'prom-client';
import { db } from '../db/sqlite';
import { getRedisHealth } from '../queue/redis';

type MetricsState = {
  registry: Registry;
  instanceStatus: Gauge<'status'>;
  instanceUptime: Gauge<'instance_id' | 'instance_name'>;
  instanceLatency: Gauge<'instance_id' | 'instance_name'>;
  queueJobs: Gauge<'queue' | 'status'>;
  messages24h: Gauge;
  webhookLatency: Gauge<'stat'>;
  aiLatency: Gauge<'stat'>;
  redisConnected: Gauge;
  redisLatency: Gauge;
};

const globalState = globalThis as typeof globalThis & {
  wagMetrics?: MetricsState;
};

function createMetrics(): MetricsState {
  const registry = new Registry();
  registry.setDefaultLabels({ service: 'whatsapp-gateway' });
  collectDefaultMetrics({
    register: registry,
    prefix: 'whatsapp_gateway_process_',
  });

  return {
    registry,
    instanceStatus: new Gauge({
      name: 'whatsapp_gateway_instances',
      help: 'Number of WhatsApp instances by status.',
      labelNames: ['status'],
      registers: [registry],
    }),
    instanceUptime: new Gauge({
      name: 'whatsapp_gateway_instance_uptime_seconds',
      help: 'Current connected uptime for each WhatsApp instance.',
      labelNames: ['instance_id', 'instance_name'],
      registers: [registry],
    }),
    instanceLatency: new Gauge({
      name: 'whatsapp_gateway_instance_health_latency_ms',
      help: 'Latest health-check latency for each WhatsApp instance.',
      labelNames: ['instance_id', 'instance_name'],
      registers: [registry],
    }),
    queueJobs: new Gauge({
      name: 'whatsapp_gateway_queue_records',
      help: 'Durable queue records grouped by queue and status.',
      labelNames: ['queue', 'status'],
      registers: [registry],
    }),
    messages24h: new Gauge({
      name: 'whatsapp_gateway_messages_last_24h',
      help: 'Messages recorded during the last 24 hours.',
      registers: [registry],
    }),
    webhookLatency: new Gauge({
      name: 'whatsapp_gateway_webhook_latency_ms',
      help: 'Webhook delivery latency during the last 24 hours.',
      labelNames: ['stat'],
      registers: [registry],
    }),
    aiLatency: new Gauge({
      name: 'whatsapp_gateway_ai_latency_ms',
      help: 'AI provider latency during the last 24 hours.',
      labelNames: ['stat'],
      registers: [registry],
    }),
    redisConnected: new Gauge({
      name: 'whatsapp_gateway_redis_connected',
      help: 'Whether Redis is currently reachable (1 or 0).',
      registers: [registry],
    }),
    redisLatency: new Gauge({
      name: 'whatsapp_gateway_redis_latency_ms',
      help: 'Latest Redis ping latency.',
      registers: [registry],
    }),
  };
}

const metrics = globalState.wagMetrics || createMetrics();
globalState.wagMetrics = metrics;

export async function renderPrometheusMetrics() {
  const instances = db.listInstances();
  const statusCounts = new Map<string, number>();
  metrics.instanceStatus.reset();
  metrics.instanceUptime.reset();
  metrics.instanceLatency.reset();

  for (const instance of instances) {
    statusCounts.set(instance.status, (statusCounts.get(instance.status) || 0) + 1);
    const labels = {
      instance_id: instance.id,
      instance_name: instance.instance_name,
    };
    const uptimeStartedAt = Date.parse(instance.uptime_started_at || '');
    metrics.instanceUptime.set(
      labels,
      instance.status === 'connected' && Number.isFinite(uptimeStartedAt)
        ? Math.max(0, (Date.now() - uptimeStartedAt) / 1_000)
        : 0,
    );
    metrics.instanceLatency.set(labels, Number(instance.last_health_latency_ms || 0));
  }
  for (const [status, count] of statusCounts) {
    metrics.instanceStatus.set({ status }, count);
  }

  metrics.queueJobs.reset();
  const queues = db.getQueueStats();
  for (const [queue, statuses] of Object.entries(queues)) {
    for (const [status, count] of Object.entries(statuses)) {
      metrics.queueJobs.set({ queue, status }, Number(count));
    }
  }

  const operations = db.getOperationalStats();
  metrics.messages24h.set(operations.messages_24h);
  metrics.webhookLatency.set({ stat: 'average' }, operations.webhook_latency_average_ms);
  metrics.webhookLatency.set({ stat: 'maximum' }, operations.webhook_latency_max_ms);
  metrics.aiLatency.set({ stat: 'average' }, operations.ai_latency_average_ms);
  metrics.aiLatency.set({ stat: 'maximum' }, operations.ai_latency_max_ms);

  const redis = await getRedisHealth();
  metrics.redisConnected.set(redis.connected ? 1 : 0);
  metrics.redisLatency.set(redis.latencyMs || 0);

  return {
    contentType: metrics.registry.contentType,
    body: await metrics.registry.metrics(),
  };
}
