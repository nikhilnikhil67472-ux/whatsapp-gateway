'use client';

import { useCallback, useEffect, useState, use } from 'react';
import Image from 'next/image';
import { CircleCheckBig, RefreshCcw } from 'lucide-react';

export default function QRPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [instance, setInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchInstance = useCallback(async () => {
    const response = await fetch(`/api/instances/${id}`, { cache: 'no-store' });
    const result = await response.json();
    if (result.success) setInstance(result.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void fetchInstance(), 0);
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/instances/${id}/status`, { cache: 'no-store' });
      const result = await response.json();
      if (result.data) setInstance(result.data);
    }, 2_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
    };
  }, [fetchInstance, id]);

  async function handleRefresh() {
    setRefreshing(true);
    setError('');
    try {
      const response = await fetch(`/api/instances/${id}/restart`, { method: 'POST' });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Failed to restart socket');
      }
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Failed to restart socket');
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (!instance) return <div>Instance not found</div>;

  return (
    <div className="page-shell qr-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Pair Device</p>
          <h1 className="page-title">Connect WhatsApp</h1>
          <p className="page-subtitle">
            Scan the QR from WhatsApp Linked Devices. The gateway keeps the session in SQLite across restarts.
          </p>
        </div>
      </div>

      <div className="card qr-card">
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>{instance.instance_name}</h2>
        <div style={{ marginBottom: '24px' }}>
          Status: <span className={`status-badge ${instance.status}`}>{instance.status.replaceAll('_', ' ')}</span>
        </div>

        {instance.status === 'connected' ? (
          <div>
            <div className="connected-icon"><CircleCheckBig size={30} /></div>
            <h3>WhatsApp connected</h3>
            <p style={{ color: 'var(--text-muted)' }}>
              Linked Phone: {instance.phone_number || '-'}<br />
              Push Name: {instance.push_name || '-'}
            </p>
          </div>
        ) : instance.qr_base64 && instance.status === 'waiting_qr' ? (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>
              Open WhatsApp on your phone and scan this code from Linked Devices.
            </p>
            <div className="qr-frame">
              <Image
                src={instance.qr_base64}
                alt="WhatsApp QR Code"
                width={256}
                height={256}
                style={{ display: 'block' }}
              />
            </div>
            <div>
              <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCcw size={16} /> {refreshing ? 'Refreshing...' : 'Refresh QR Code'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ color: 'var(--text-muted)', marginBottom: '18px' }}>No QR code is available yet.</p>
            <button className="btn btn-secondary" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCcw size={16} /> {refreshing ? 'Requesting...' : 'Generate QR Code'}
            </button>
          </div>
        )}
        {error && <div className="test-result error" role="alert">{error}</div>}
      </div>
    </div>
  );
}
