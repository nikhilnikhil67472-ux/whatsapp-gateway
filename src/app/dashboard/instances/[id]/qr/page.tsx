'use client';

import { useState, useEffect, use, useCallback } from 'react';
import Image from 'next/image';
import { RefreshCcw } from 'lucide-react';

export default function QRPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;

  const [instance, setInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchInstance = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/instances/${id}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.success) setInstance(json.data);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    fetchInstance();

    const interval = window.setInterval(async () => {
      const res = await fetch(`/api/instances/${id}/status`, { cache: 'no-store' });
      const json = await res.json();
      if (json.data) setInstance(json.data);
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [fetchInstance, id]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/instances/${id}/restart`, { method: 'POST' });
      if (!res.ok) throw new Error('Failed to restart socket');
    } catch (err: any) {
      alert(err.message);
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
            Scan the QR from WhatsApp Linked Devices. The gateway will keep this instance connected through Baileys.
          </p>
        </div>
      </div>

      <div className="card qr-card">
        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>{instance.instance_name}</h2>
        <div style={{ marginBottom: '24px' }}>
          Status: <span className={`status-badge ${instance.status}`}>{instance.status.replace('_', ' ')}</span>
        </div>

        {instance.status === 'connected' ? (
          <div>
            <div className="connected-icon">✓</div>
            <h3>WhatsApp Connected Successfully</h3>
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
      </div>
    </div>
  );
}
