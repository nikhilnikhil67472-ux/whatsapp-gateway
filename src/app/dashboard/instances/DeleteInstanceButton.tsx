'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function DeleteInstanceButton({
  instanceId,
  instanceName,
}: {
  instanceId: string;
  instanceName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function deleteInstance() {
    setDeleting(true);
    setError('');
    try {
      const response = await fetch(`/api/instances/${instanceId}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to delete instance');

      for (let attempt = 0; attempt < 30; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const statusResponse = await fetch(`/api/instances/${instanceId}`, { cache: 'no-store' });
        if (statusResponse.status === 404) {
          setOpen(false);
          router.refresh();
          return;
        }
      }

      setOpen(false);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete instance');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn icon-btn-quiet"
        title={`Delete ${instanceName}`}
        aria-label={`Delete ${instanceName}`}
        onClick={() => {
          setOpen(true);
          setConfirmation('');
          setError('');
        }}
      >
        <Trash2 size={17} />
      </button>

      {open && (
        <div className="modal-backdrop">
          <div className="card modal-card delete-instance-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-instance-title">
            <div className="delete-dialog-icon"><Trash2 size={20} /></div>
            <h3 id="delete-instance-title">Delete {instanceName}?</h3>
            <p className="help-text">
              This permanently removes its WhatsApp session, messages, media, webhooks, automations, and API keys.
            </p>
            <div className="form-row">
              <label htmlFor={`delete-confirm-${instanceId}`}>Type <strong>{instanceName}</strong> to confirm</label>
              <input
                id={`delete-confirm-${instanceId}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                autoFocus
                disabled={deleting}
              />
            </div>
            {error && <div className="test-result error" role="alert">{error}</div>}
            <div className="delete-dialog-actions">
              <button type="button" className="btn btn-secondary" disabled={deleting} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={deleting || confirmation !== instanceName}
                onClick={deleteInstance}
              >
                <Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
