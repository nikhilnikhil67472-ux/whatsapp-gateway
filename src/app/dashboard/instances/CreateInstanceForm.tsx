'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function CreateInstanceForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    
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
        setIsOpen(false);
        setName('');
        router.refresh();
        router.push(`/dashboard/instances/${json.data.id}/qr`);
      } else {
        alert(json.error || 'Failed to create instance');
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className="btn" onClick={() => setIsOpen(true)}>
        <Plus size={16} /> New Instance
      </button>

      {isOpen && (
        <div className="modal-backdrop">
          <div className="card modal-card">
            <h3>Create WhatsApp Instance</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-row">
                <label>Instance Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. client_xyz"
                  required
                />
                <p className="help-text">Will be lowercased and cleaned automatically.</p>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setIsOpen(false)}>Cancel</button>
                <button type="submit" className="btn" disabled={loading}>
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
