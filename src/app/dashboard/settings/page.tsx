import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Cloud,
  Database,
  Globe2,
  KeyRound,
  LockKeyhole,
  RadioTower,
} from 'lucide-react';
import { redirect } from 'next/navigation';
import { getRedisHealth } from '@/lib/queue/redis';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';

export const dynamic = 'force-dynamic';

export default async function GlobalSettingsPage() {
  const session = await getServerDashboardSession();
  if (session.role !== 'admin') redirect('/dashboard/instances');
  const redis = await getRedisHealth();
  const configItems = [
    {
      label: 'Public app URL',
      configured: Boolean(process.env.APP_BASE_URL),
      value: process.env.APP_BASE_URL || 'Not configured',
      icon: Globe2,
    },
    {
      label: 'Dashboard authentication',
      configured: Boolean(
        process.env.DASHBOARD_PASSWORD
        && (process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || '').length >= 32,
      ),
      value: process.env.DASHBOARD_PASSWORD ? 'Password and signed sessions configured' : 'Not configured',
      icon: LockKeyhole,
    },
    {
      label: 'Auth-state encryption',
      configured: process.env.ENCRYPTION_KEY?.length === 32,
      value: process.env.ENCRYPTION_KEY?.length === 32 ? 'AES-256-GCM enabled' : 'Requires exact 32-character key',
      icon: KeyRound,
    },
    {
      label: 'SQLite database',
      configured: true,
      value: process.env.SQLITE_DB_PATH || './data/gateway.db',
      icon: Database,
    },
    {
      label: 'Redis and BullMQ',
      configured: !redis.configured || redis.connected,
      value: redis.configured
        ? redis.connected ? `Connected (${redis.latencyMs}ms)` : redis.error || 'Connection failed'
        : 'Optional SQLite queue fallback active',
      icon: RadioTower,
    },
    {
      label: 'Object storage',
      configured: Boolean(process.env.S3_BUCKET),
      value: process.env.S3_BUCKET
        ? `${process.env.S3_BUCKET} (${process.env.S3_REGION || 'us-east-1'})`
        : 'Local media storage',
      icon: Cloud,
    },
    {
      label: 'Sentry',
      configured: Boolean(process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN),
      value: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN
        ? 'Error tracking enabled'
        : 'Not configured',
      icon: Activity,
    },
    {
      label: 'Prometheus metrics',
      configured: true,
      value: process.env.METRICS_TOKEN ? 'Protected by bearer token' : '/metrics',
      icon: Activity,
    },
  ];

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Deployment</p>
          <h1 className="page-title">Global Configuration</h1>
          <p className="page-subtitle">Runtime dependencies and production security.</p>
        </div>
      </div>

      <div className="config-list">
        {configItems.map((item) => {
          const Icon = item.icon;
          return (
            <div className="config-row" key={item.label}>
              <div className="config-icon"><Icon size={19} /></div>
              <div>
                <strong>{item.label}</strong>
                <code>{item.value}</code>
              </div>
              <span className={item.configured ? 'config-ok' : 'config-warn'}>
                {item.configured ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
                {item.configured ? 'Ready' : 'Optional / action needed'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
