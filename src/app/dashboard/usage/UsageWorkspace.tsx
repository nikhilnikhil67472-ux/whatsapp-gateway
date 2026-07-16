'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  FileClock,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import type { DashboardRole } from '@/lib/security/dashboard-auth';

type UsageResult = {
  summary: Array<{ event_type: string; quantity: number }>;
  timeline: Array<{ day: string; event_type: string; quantity: number }>;
  instances: Array<{ instance_id?: string | null; instance_name?: string | null; quantity: number }>;
};

type AuditLog = {
  id: string;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  instance_id?: string | null;
  metadata?: unknown;
  created_at: string;
};

function friendlyEvent(value: string) {
  return value.replaceAll('.', ' ').replaceAll('_', ' ');
}

export default function UsageWorkspace({ role }: { role: DashboardRole }) {
  const [days, setDays] = useState(30);
  const [usage, setUsage] = useState<UsageResult>({
    summary: [],
    timeline: [],
    instances: [],
  });
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const requests: Promise<Response>[] = [
      fetch(`/api/dashboard/usage?days=${days}`, { cache: 'no-store' }),
    ];
    if (role === 'admin') {
      requests.push(fetch('/api/dashboard/audit?limit=250', { cache: 'no-store' }));
    }
    const responses = await Promise.all(requests);
    const usageResult = await responses[0].json();
    if (responses[0].ok) setUsage(usageResult);
    if (responses[1]) {
      const auditResult = await responses[1].json();
      if (responses[1].ok) setAudit(auditResult.data);
    }
    setLoading(false);
  }, [days, role]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [load]);

  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of usage.timeline) {
      totals.set(row.day, (totals.get(row.day) || 0) + Number(row.quantity));
    }
    return [...totals.entries()].map(([day, quantity]) => ({ day, quantity }));
  }, [usage.timeline]);
  const maxDaily = Math.max(1, ...dailyTotals.map((item) => item.quantity));
  const totalEvents = usage.summary.reduce((sum, item) => sum + Number(item.quantity), 0);
  const outbound = usage.summary.find((item) => item.event_type === 'message.outbound')?.quantity || 0;
  const aiReplies = usage.summary.find((item) => item.event_type === 'ai_reply.sent')?.quantity || 0;
  const autoReplies = usage.summary.find((item) => item.event_type === 'auto_reply.sent')?.quantity || 0;

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Operations</p>
          <h1 className="page-title">Usage & Audit</h1>
          <p className="page-subtitle">Billable events, instance volume, and security changes.</p>
        </div>
        <div className="actions-row">
          <div className="segmented-control" aria-label="Usage date range">
            {[7, 30, 90].map((value) => (
              <button
                type="button"
                key={value}
                className={days === value ? 'active' : ''}
                onClick={() => setDays(value)}
              >
                {value}d
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn icon-btn-large" onClick={() => void load()} title="Refresh">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <span>Total tracked events</span>
          <strong>{totalEvents}</strong>
        </div>
        <div className="metric-card">
          <span>Outbound messages</span>
          <strong>{outbound}</strong>
        </div>
        <div className="metric-card">
          <span>AI replies</span>
          <strong>{aiReplies}</strong>
        </div>
        <div className="metric-card">
          <span>Rule replies</span>
          <strong>{autoReplies}</strong>
        </div>
      </div>

      <div className="usage-grid">
        <section className="surface-panel usage-chart-panel">
          <div className="panel-heading">
            <BarChart3 size={18} />
            <div>
              <h2>Daily Activity</h2>
              <p>All tracked usage events.</p>
            </div>
          </div>
          {dailyTotals.length === 0 ? (
            <div className="empty-state chart-empty">
              <Activity size={24} />
              <strong>No usage recorded</strong>
            </div>
          ) : (
            <div className="usage-chart" aria-label="Daily usage chart">
              {dailyTotals.map((item) => (
                <div className="usage-bar-column" key={item.day}>
                  <div className="usage-bar-value">{item.quantity}</div>
                  <div
                    className="usage-bar"
                    style={{ height: `${Math.max(6, (item.quantity / maxDaily) * 100)}%` }}
                  />
                  <time>{new Date(`${item.day}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</time>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="surface-panel event-breakdown">
          <div className="panel-heading">
            <Activity size={18} />
            <div><h2>Event Breakdown</h2></div>
          </div>
          <div className="breakdown-list">
            {usage.summary.length === 0 && <div className="empty-state"><strong>No events</strong></div>}
            {usage.summary.map((item) => (
              <div className="breakdown-row" key={item.event_type}>
                <span>{friendlyEvent(item.event_type)}</span>
                <strong>{item.quantity}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="surface-panel usage-instance-panel">
        <div className="panel-heading">
          <ShieldCheck size={18} />
          <div>
            <h2>Instance Usage</h2>
            <p>Aggregate quantity in the selected period.</p>
          </div>
        </div>
        <div className="responsive-table">
          <table>
            <thead>
              <tr>
                <th>Instance</th>
                <th>Events</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {usage.instances.length === 0 ? (
                <tr><td colSpan={3}><div className="empty-state"><strong>No instance usage</strong></div></td></tr>
              ) : usage.instances.map((item) => (
                <tr key={item.instance_id || 'unassigned'}>
                  <td>{item.instance_name || item.instance_id || 'System'}</td>
                  <td>{item.quantity}</td>
                  <td>
                    <div className="share-meter">
                      <i style={{ width: `${totalEvents ? (item.quantity / totalEvents) * 100 : 0}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {role === 'admin' && (
        <section className="surface-panel audit-panel">
          <div className="panel-heading">
            <FileClock size={18} />
            <div>
              <h2>Audit Trail</h2>
              <p>Latest 250 administrative actions.</p>
            </div>
          </div>
          <div className="audit-list">
            {audit.length === 0 && <div className="empty-state"><strong>No audit records</strong></div>}
            {audit.map((record) => (
              <details className="audit-row" key={record.id}>
                <summary>
                  <span className="audit-icon"><ShieldCheck size={15} /></span>
                  <strong>{friendlyEvent(record.action)}</strong>
                  <span>{record.target_type || 'system'}</span>
                  <time>{new Date(record.created_at).toLocaleString()}</time>
                </summary>
                <div className="audit-details">
                  <code>{record.target_id || record.instance_id || record.id}</code>
                  {record.metadata !== null && record.metadata !== undefined && (
                    <pre className="payload-preview">{JSON.stringify(record.metadata, null, 2)}</pre>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
