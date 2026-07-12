import { Activity, CheckCircle2, Database, Server } from 'lucide-react';
import { db } from '@/lib/db/sqlite';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function HealthPage() {
  const instances = db.listInstances();
  const connected = instances.filter((instance: any) => instance.status === 'connected').length;
  const waitingQr = instances.filter((instance: any) => instance.status === 'waiting_qr').length;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">System Status</p>
          <h1 className="page-title">Health Center</h1>
          <p className="page-subtitle">
            A simple non-technical view of whether the app, local database, and WhatsApp instances are ready.
          </p>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>App</span>
          <strong className="metric-ok">Online</strong>
        </div>
        <div className="metric-card">
          <span>Database</span>
          <strong className="metric-ok">SQLite OK</strong>
        </div>
        <div className="metric-card">
          <span>Connected</span>
          <strong>{connected}</strong>
        </div>
        <div className="metric-card">
          <span>Waiting QR</span>
          <strong>{waitingQr}</strong>
        </div>
      </div>

      <div className="card">
        <div className="section-title-row">
          <div>
            <h2>What This Means</h2>
            <p>Use these checks before handing the system to a client.</p>
          </div>
          <Activity color="var(--primary)" />
        </div>
        <div className="setup-list">
          <div className="setup-step done">
            <div className="setup-step-icon"><Server size={18} /></div>
            <div>
              <strong>Dashboard is running</strong>
              <p>The web app is reachable on this machine.</p>
            </div>
          </div>
          <div className="setup-step done">
            <div className="setup-step-icon"><Database size={18} /></div>
            <div>
              <strong>Local database is ready</strong>
              <p>SQLite is storing instances, messages, logs, and AI runs locally.</p>
            </div>
          </div>
          <div className={`setup-step ${instances.length > 0 ? 'done' : ''}`}>
            <div className="setup-step-icon"><CheckCircle2 size={18} /></div>
            <div>
              <strong>WhatsApp instances</strong>
              <p>{instances.length > 0 ? `${instances.length} instance(s) created.` : 'Create an instance and scan QR to start.'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
