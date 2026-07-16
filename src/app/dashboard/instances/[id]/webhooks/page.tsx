'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CircleAlert,
  Clock3,
  RefreshCw,
  RotateCcw,
  TestTube2,
  Webhook,
} from 'lucide-react';

type Delivery = {
  id: string;
  event_type: string;
  target_url: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  response_status?: number | null;
  response_body?: string | null;
  error_message?: string | null;
  latency_ms?: number | null;
  dead_letter_at?: string | null;
  replayed_from_id?: string | null;
  created_at: string;
  delivered_at?: string | null;
};

function webhookHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

export default function WebhookDeliveriesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'failed' | 'delivered'>('all');
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    const response = await fetch(`/api/dashboard/instances/${id}/webhooks?limit=200`, {
      cache: 'no-store',
    });
    const result = await response.json();
    if (response.ok && result.success) setDeliveries(result.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadDeliveries(), 0);
    const interval = window.setInterval(() => void loadDeliveries(), 10_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [loadDeliveries]);

  const visibleDeliveries = useMemo(() => {
    if (filter === 'failed') return deliveries.filter((delivery) => delivery.status === 'failed');
    if (filter === 'delivered') return deliveries.filter((delivery) => delivery.status === 'delivered');
    if (filter === 'active') {
      return deliveries.filter((delivery) => ['pending', 'retry', 'sending'].includes(delivery.status));
    }
    return deliveries;
  }, [deliveries, filter]);

  const failedCount = deliveries.filter((delivery) => delivery.status === 'failed').length;
  const activeCount = deliveries.filter((delivery) => ['pending', 'retry', 'sending'].includes(delivery.status)).length;
  const deliveredCount = deliveries.filter((delivery) => delivery.status === 'delivered').length;

  async function replay(deliveryId: string) {
    setReplaying(deliveryId);
    setFeedback(null);
    try {
      const response = await fetch(`/api/dashboard/webhooks/${deliveryId}/replay`, {
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Replay could not be queued');
      setFeedback({ ok: true, text: 'Webhook replay queued' });
      await loadDeliveries();
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Replay could not be queued',
      });
    } finally {
      setReplaying(null);
    }
  }

  async function testWebhook() {
    setTesting(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/instances/${id}/test-webhook`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || result.hint || 'Webhook test failed');
      setFeedback({
        ok: true,
        text: `Webhook responded with HTTP ${result.status} in ${result.durationMs}ms`,
      });
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Webhook test failed',
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Delivery Operations</p>
          <h1 className="page-title">Webhooks</h1>
          <p className="page-subtitle">Delivery status, retries, dead letters, and replay.</p>
        </div>
        <div className="actions-row">
          <button type="button" className="btn btn-secondary" onClick={testWebhook} disabled={testing}>
            <TestTube2 size={16} />
            {testing ? 'Testing...' : 'Test Endpoint'}
          </button>
          <button type="button" className="icon-btn icon-btn-large" onClick={() => void loadDeliveries()} title="Refresh">
            <RefreshCw size={17} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      <div className="metric-grid webhook-metrics">
        <div className="metric-card">
          <span>Delivered</span>
          <strong className="metric-ok">{deliveredCount}</strong>
        </div>
        <div className="metric-card">
          <span>Retrying</span>
          <strong className="metric-warn">{activeCount}</strong>
        </div>
        <div className="metric-card">
          <span>Dead letter</span>
          <strong className={failedCount ? 'metric-danger' : ''}>{failedCount}</strong>
        </div>
        <div className="metric-card">
          <span>Total shown</span>
          <strong>{deliveries.length}</strong>
        </div>
      </div>

      {feedback && (
        <div className={`inline-feedback page-feedback ${feedback.ok ? 'success' : 'error'}`} role="status">
          {feedback.text}
        </div>
      )}

      <section className="surface-panel">
        <div className="panel-toolbar webhook-toolbar">
          <div className="segmented-control" aria-label="Webhook status filter">
            {(['all', 'active', 'failed', 'delivered'] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ))}
          </div>
          <span className="toolbar-count">{visibleDeliveries.length} deliveries</span>
        </div>

        <div className="delivery-list">
          {!loading && visibleDeliveries.length === 0 && (
            <div className="empty-state">
              <Webhook size={24} />
              <strong>No webhook deliveries</strong>
            </div>
          )}
          {visibleDeliveries.map((delivery) => (
            <details className="delivery-row" key={delivery.id}>
              <summary>
                <span className={`delivery-status ${delivery.status}`} aria-hidden="true" />
                <span className="delivery-event">
                  <strong>{delivery.event_type}</strong>
                  <small>{webhookHost(delivery.target_url)}</small>
                </span>
                <span className={`status-badge ${delivery.status}`}>{delivery.status}</span>
                <span className="delivery-attempts">
                  {delivery.attempts}/{delivery.max_attempts}
                </span>
                <span className="delivery-latency">
                  <Clock3 size={14} />
                  {delivery.latency_ms ? `${delivery.latency_ms}ms` : '-'}
                </span>
                <time>{new Date(delivery.created_at).toLocaleString()}</time>
              </summary>
              <div className="delivery-details">
                {delivery.error_message && (
                  <div className="delivery-error">
                    <CircleAlert size={16} />
                    <span>{delivery.error_message}</span>
                  </div>
                )}
                <dl className="detail-grid">
                  <div>
                    <dt>Delivery ID</dt>
                    <dd><code>{delivery.id}</code></dd>
                  </div>
                  <div>
                    <dt>HTTP status</dt>
                    <dd>{delivery.response_status || '-'}</dd>
                  </div>
                  <div>
                    <dt>Target</dt>
                    <dd>{delivery.target_url}</dd>
                  </div>
                  <div>
                    <dt>Replay source</dt>
                    <dd>{delivery.replayed_from_id || '-'}</dd>
                  </div>
                </dl>
                <div className="delivery-payloads">
                  <div>
                    <strong>Payload</strong>
                    <pre className="payload-preview">{JSON.stringify(delivery.payload, null, 2)}</pre>
                  </div>
                  <div>
                    <strong>Response</strong>
                    <pre className="payload-preview">{delivery.response_body || 'No response body'}</pre>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={(event) => {
                    event.preventDefault();
                    void replay(delivery.id);
                  }}
                  disabled={replaying === delivery.id}
                >
                  <RotateCcw size={15} />
                  {replaying === delivery.id ? 'Queueing...' : 'Replay'}
                </button>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
