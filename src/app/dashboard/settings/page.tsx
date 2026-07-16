import { CheckCircle2, CircleAlert, Database, Globe2, KeyRound, LockKeyhole } from 'lucide-react';

export const dynamic = 'force-dynamic';

const configItems = [
  {
    label: 'Public app URL',
    configured: Boolean(process.env.APP_BASE_URL),
    value: process.env.APP_BASE_URL || 'Not configured',
    icon: Globe2,
  },
  {
    label: 'Dashboard login',
    configured: Boolean(
      process.env.DASHBOARD_PASSWORD
      && (process.env.AUTH_SECRET || process.env.ENCRYPTION_KEY || '').length >= 32,
    ),
    value: process.env.DASHBOARD_PASSWORD ? 'Password configured' : 'Not configured',
    icon: LockKeyhole,
  },
  {
    label: 'External API authentication',
    configured: Boolean(process.env.GATEWAY_API_KEY),
    value: process.env.GATEWAY_API_KEY ? 'Global key configured' : 'Instance keys only',
    icon: KeyRound,
  },
  {
    label: 'SQLite database',
    configured: true,
    value: process.env.SQLITE_DB_PATH || './data/gateway.db',
    icon: Database,
  },
];

export default function GlobalSettingsPage() {
  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Deployment</p>
          <h1 className="page-title">Global Configuration</h1>
          <p className="page-subtitle">Runtime settings applied across every WhatsApp instance.</p>
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
                {item.configured ? 'Ready' : 'Action needed'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
