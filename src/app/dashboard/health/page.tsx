import Link from 'next/link';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Database,
  Gauge,
  RadioTower,
  Server,
  Webhook,
} from 'lucide-react';
import { db } from '@/lib/db';
import { getRedisHealth } from '@/lib/queue/redis';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HealthPage() {
  const session = await getServerDashboardSession();
  const instances = db.listInstances(session.organizationId);
  const connected = instances.filter((instance: any) => instance.status === 'connected').length;
  const queues = db.getQueueStats();
  const operations = db.getOperationalStats();
  const redis = await getRedisHealth();
  const queuedOutbound = (queues.outbound.pending || 0) + (queues.outbound.retry || 0);
  const queuedWebhooks = (queues.webhooks.pending || 0) + (queues.webhooks.retry || 0);
  const deadLetters = queues.webhooks.failed || 0;
  const securityReady = Boolean(
    process.env.GATEWAY_API_KEY
    && process.env.DASHBOARD_PASSWORD
    && (process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || '').length >= 32,
  );

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">System Status</p>
          <h1 className="page-title">Health Center</h1>
          <p className="page-subtitle">Connections, queues, latency, and runtime dependencies.</p>
        </div>
        <Link href="/metrics" target="_blank" className="btn btn-secondary">
          <Gauge size={16} />
          Prometheus
        </Link>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Connected</span>
          <strong className="metric-ok">{connected}/{instances.length}</strong>
        </div>
        <div className="metric-card">
          <span>Messages (24h)</span>
          <strong>{operations.messages_24h}</strong>
        </div>
        <div className="metric-card">
          <span>Queued work</span>
          <strong className={queuedOutbound + queuedWebhooks ? 'metric-warn' : ''}>
            {queuedOutbound + queuedWebhooks}
          </strong>
        </div>
        <div className="metric-card">
          <span>Dead letters</span>
          <strong className={deadLetters ? 'metric-danger' : ''}>{deadLetters}</strong>
        </div>
      </div>

      <div className="health-grid">
        <section className="surface-panel dependency-panel">
          <div className="panel-heading">
            <Server size={18} />
            <div>
              <h2>Dependencies</h2>
              <p>Current runtime checks.</p>
            </div>
          </div>
          <div className="dependency-list">
            <div className="dependency-row">
              <span className="dependency-icon"><Database size={17} /></span>
              <div>
                <strong>SQLite</strong>
                <small>{process.env.SQLITE_DB_PATH || './data/gateway.db'}</small>
              </div>
              <span className="config-ok"><CheckCircle2 size={16} /> Ready</span>
            </div>
            <div className="dependency-row">
              <span className="dependency-icon"><RadioTower size={17} /></span>
              <div>
                <strong>Redis / BullMQ</strong>
                <small>
                  {redis.configured
                    ? redis.connected ? `${redis.latencyMs}ms` : redis.error || 'Unavailable'
                    : 'SQLite polling fallback'}
                </small>
              </div>
              <span className={redis.configured && !redis.connected ? 'config-warn' : 'config-ok'}>
                {redis.configured && !redis.connected
                  ? <><CircleAlert size={16} /> Offline</>
                  : <><CheckCircle2 size={16} /> {redis.connected ? 'Ready' : 'Optional'}</>}
              </span>
            </div>
            <div className="dependency-row">
              <span className="dependency-icon"><Webhook size={17} /></span>
              <div>
                <strong>Webhook latency</strong>
                <small>Maximum {operations.webhook_latency_max_ms}ms</small>
              </div>
              <strong>{operations.webhook_latency_average_ms}ms avg</strong>
            </div>
            <div className="dependency-row">
              <span className="dependency-icon"><Activity size={17} /></span>
              <div>
                <strong>AI latency</strong>
                <small>Maximum {operations.ai_latency_max_ms}ms</small>
              </div>
              <strong>{operations.ai_latency_average_ms}ms avg</strong>
            </div>
            <div className="dependency-row">
              <span className="dependency-icon"><CheckCircle2 size={17} /></span>
              <div>
                <strong>Security configuration</strong>
                <small>Dashboard, encryption, and outbound API.</small>
              </div>
              <span className={securityReady ? 'config-ok' : 'config-warn'}>
                {securityReady
                  ? <><CheckCircle2 size={16} /> Ready</>
                  : <><CircleAlert size={16} /> Review</>}
              </span>
            </div>
          </div>
        </section>

        <section className="surface-panel queue-panel">
          <div className="panel-heading">
            <Activity size={18} />
            <div>
              <h2>Durable Queues</h2>
              <p>SQLite record state across all instances.</p>
            </div>
          </div>
          <div className="queue-stat-list">
            {Object.entries(queues).map(([queueName, statuses]) => (
              <div className="queue-stat-row" key={queueName}>
                <strong>{queueName}</strong>
                <div>
                  {Object.keys(statuses).length === 0 && <span>empty</span>}
                  {Object.entries(statuses).map(([status, count]) => (
                    <span key={status}><i className={`queue-dot ${status}`} />{status}: {count}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="surface-panel instance-health-panel">
        <div className="panel-heading">
          <RadioTower size={18} />
          <div>
            <h2>Instance Reliability</h2>
            <p>Rolling 24-hour health samples.</p>
          </div>
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Instance</th>
                <th>Status</th>
                <th>Uptime</th>
                <th>Health latency</th>
                <th>Last health check</th>
              </tr>
            </thead>
            <tbody>
              {instances.length === 0 ? (
                <tr><td colSpan={5}><div className="empty-state"><strong>No instances</strong></div></td></tr>
              ) : instances.map((instance: any) => {
                const reliability = db.getInstanceReliability(instance.id);
                return (
                  <tr key={instance.id}>
                    <td>
                      <Link href={`/dashboard/instances/${instance.id}`} className="entity-title">
                        {instance.instance_name}
                      </Link>
                    </td>
                    <td><span className={`status-badge ${instance.status}`}>{instance.status.replaceAll('_', ' ')}</span></td>
                    <td>{reliability.uptime_percent === null ? '-' : `${reliability.uptime_percent}%`}</td>
                    <td>{reliability.samples ? `${reliability.average_latency_ms}ms` : '-'}</td>
                    <td>{instance.last_health_at ? new Date(instance.last_health_at).toLocaleString() : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
