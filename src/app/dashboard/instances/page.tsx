import Link from 'next/link';
import { Home, Settings, MessageSquare, QrCode, Activity } from 'lucide-react';
import CreateInstanceForm from './CreateInstanceForm';
import { db } from '@/lib/db/sqlite';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function InstancesPage() {
  const instances = db.listInstances();
  const connectedCount = instances.filter((instance: any) => instance.status === 'connected').length;
  const aiEnabledCount = instances.filter((instance: any) => instance.ai_enabled !== false).length;
  const waitingQrCount = instances.filter((instance: any) => instance.status === 'waiting_qr').length;

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Control Center</p>
          <h1 className="page-title">WhatsApp Instances</h1>
          <p className="page-subtitle">
            Connect numbers, scan QR codes, and route chats into your AI webhook from one clean workspace.
          </p>
        </div>
        <CreateInstanceForm />
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Total instances</span>
          <strong>{instances.length}</strong>
        </div>
        <div className="metric-card">
          <span>Connected</span>
          <strong>{connectedCount}</strong>
        </div>
        <div className="metric-card">
          <span>AI enabled</span>
          <strong>{aiEnabledCount}</strong>
        </div>
        <div className="metric-card">
          <span>Waiting QR</span>
          <strong>{waitingQrCount}</strong>
        </div>
      </div>

      <div className="card table-card">
        <div className="table-toolbar">
          <div>
            <h2>Instance Directory</h2>
            <p>Manage QR, configuration, and conversations for each connected WhatsApp account.</p>
          </div>
          <Activity size={20} color="var(--text-muted)" />
        </div>
        <table>
          <thead>
            <tr>
              <th>Instance Name</th>
              <th>Status</th>
              <th>Phone</th>
              <th>AI Config</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {!instances || instances.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="empty-state">
                    <strong>No instances yet</strong>
                    Create your first WhatsApp instance to scan a QR and connect an AI webhook.
                  </div>
                </td>
              </tr>
            ) : instances.map((instance: any) => (
              <tr key={instance.id}>
                <td>
                  <div className="entity-cell">
                    <div className="entity-avatar">
                      {(instance.instance_name || 'W').slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="entity-title">{instance.instance_name}</div>
                      <div className="entity-subtitle">{instance.push_name || 'No push name yet'}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={`status-badge ${instance.status}`}>
                    {instance.status.replace('_', ' ')}
                  </span>
                </td>
                <td>{instance.phone_number || '-'}</td>
                <td>
                  <span className={`status-badge ${instance.ai_enabled ? 'connected' : 'disconnected'}`}>
                    {instance.ai_enabled ? 'AI Enabled' : 'AI Disabled'}
                  </span>
                </td>
                <td>
                  <div className="actions-row">
                    <Link href={`/dashboard/instances/${instance.id}`} className="btn btn-secondary btn-small">
                      <Home size={16} /> Open
                    </Link>
                    <Link href={`/dashboard/instances/${instance.id}/qr`} className="btn btn-secondary btn-small">
                      <QrCode size={16} /> QR
                    </Link>
                    <Link href={`/dashboard/instances/${instance.id}/settings`} className="btn btn-secondary btn-small">
                      <Settings size={16} /> Config
                    </Link>
                    <Link href={`/dashboard/instances/${instance.id}/conversations`} className="btn btn-secondary btn-small">
                      <MessageSquare size={16} /> Chats
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
