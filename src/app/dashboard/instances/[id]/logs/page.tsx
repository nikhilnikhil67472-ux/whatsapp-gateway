import { db } from '@/lib/db';
import { getServerDashboardSession } from '@/lib/security/dashboard-server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function LogsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerDashboardSession();
  if (!db.getInstance(id, session.organizationId)) return <div>Instance not found</div>;

  const logs = db.listEventLogs(id, 50);
  const aiRuns = db.listAiRuns(id, 25);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Diagnostics</p>
          <h1 className="page-title">Event Logs</h1>
          <p className="page-subtitle">
            Showing the last 50 internal WhatsApp events logged for this instance.
          </p>
        </div>
      </div>

      <div className="card table-card" style={{ marginBottom: '22px' }}>
        <div className="table-toolbar">
          <div>
            <h2>AI Webhook Runs</h2>
            <p>Shows whether the gateway reached n8n and what n8n returned.</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Error / Response</th>
            </tr>
          </thead>
          <tbody>
            {!aiRuns || aiRuns.length === 0 ? (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    <strong>No AI webhook runs yet</strong>
                    Send a WhatsApp message after enabling AI to see webhook diagnostics.
                  </div>
                </td>
              </tr>
            ) : aiRuns.map((run: any) => (
              <tr key={run.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{run.started_at ? new Date(run.started_at).toLocaleString() : '-'}</td>
                <td>
                  <span className={`status-badge ${run.status === 'success' ? 'connected' : run.status === 'success_empty' ? 'waiting_qr' : 'failed'}`}>
                    {run.status.replace('_', ' ')}
                  </span>
                </td>
                <td>{run.duration_ms ? `${run.duration_ms}ms` : '-'}</td>
                <td>
                  {run.error_message && <p className="help-text" style={{ marginBottom: '8px' }}>{run.error_message}</p>}
                  {run.response_payload && (
                    <pre className="payload-preview">{JSON.stringify(run.response_payload, null, 2)}</pre>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="card table-card">
        <div className="table-toolbar">
          <div>
            <h2>Event Stream</h2>
            <p>Useful for debugging Baileys events, AI routing, and webhook forwarding.</p>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {!logs || logs.length === 0 ? (
              <tr>
                <td colSpan={3}>
                  <div className="empty-state">
                    <strong>No logs found</strong>
                    New WhatsApp events will appear here once the instance starts receiving updates.
                  </div>
                </td>
              </tr>
            ) : logs.map((log: any) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {log.received_at ? new Date(log.received_at).toLocaleString() : '-'}
                </td>
                <td>
                  <span className="status-badge connected">{log.event_type}</span>
                </td>
                <td>
                  <pre className="payload-preview">
                    {JSON.stringify(log.payload, null, 2)}
                  </pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
