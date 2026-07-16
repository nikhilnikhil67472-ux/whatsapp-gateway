'use client';

import { useState } from 'react';
import { Check, Copy, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CreateInstanceForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [created, setCreated] = useState<{ id: string; apiKey: string } | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await fetch('/api/instances/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instanceName: name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''),
          rejectCall: true,
          groupsIgnore: true,
        })
      });
      
      const json = await res.json();
      if (json.success) {
        setCreated({ id: json.data.id, apiKey: json.data.apiKey });
        router.refresh();
      } else {
        setError(json.error || 'Failed to create instance');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create instance');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => {
        setIsOpen(true);
        setError('');
        setCreated(null);
      }}>
        <Plus size={16} /> New Instance
      </button>

      {isOpen && (
        <div className="modal-backdrop">
          <div className="card modal-card" role="dialog" aria-modal="true" aria-labelledby="create-instance-title">
            <h3 id="create-instance-title">{created ? 'Instance created' : 'Create WhatsApp Instance'}</h3>
            {created ? (
              <div>
                <p className="help-text" style={{ marginBottom: '14px' }}>
                  This API key is shown once. Your AI agent will use it to send messages.
                </p>
                <div className="api-key-reveal">
                  <code>{created.apiKey}</code>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Copy API key"
                    onClick={async () => {
                      await navigator.clipboard.writeText(created.apiKey);
                      setCopied(true);
                    }}
                  >
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                  </button>
                </div>
                <button
                  type="button"
                  className="btn"
                  style={{ width: '100%', marginTop: '18px' }}
                  onClick={() => router.push(`/dashboard/instances/${created.id}/qr`)}
                >
                  Continue to QR pairing
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label htmlFor="instance-name">Instance Name</label>
                <input 
                  id="instance-name"
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. client_xyz"
                  required
                />
                <p className="help-text">Will be lowercased and cleaned automatically.</p>
              </div>
              {error && <div className="test-result error" role="alert">{error}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsOpen(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
