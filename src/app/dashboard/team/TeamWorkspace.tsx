'use client';

import { FormEvent, useState } from 'react';
import {
  Check,
  Copy,
  KeyRound,
  Plus,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';

type UserRecord = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'developer' | 'viewer';
  status: string;
  created_at: string;
};

type ApiKeyRecord = {
  id: string;
  user_id?: string | null;
  instance_id?: string | null;
  name: string;
  key_prefix: string;
  role: string;
  scopes: string[];
  ip_allowlist: string[];
  last_used_at?: string | null;
  expires_at?: string | null;
  revoked_at?: string | null;
  created_at: string;
};

const availableScopes = [
  'messages:send',
  'instances:read',
  'contacts:read',
  'webhooks:read',
];

export default function TeamWorkspace({
  currentUserId,
  initialUsers,
  initialApiKeys,
  instances,
}: {
  currentUserId: string;
  initialUsers: UserRecord[];
  initialApiKeys: ApiKeyRecord[];
  instances: Array<{ id: string; name: string }>;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [apiKeys, setApiKeys] = useState(initialApiKeys);
  const [memberDraft, setMemberDraft] = useState({
    name: '',
    email: '',
    password: '',
    role: 'viewer',
  });
  const [keyDraft, setKeyDraft] = useState({
    name: '',
    user_id: '',
    instance_id: '',
    role: 'developer',
    scopes: ['messages:send'],
    ip_allowlist: '',
    expires_at: '',
  });
  const [revealedKey, setRevealedKey] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function refreshUsers() {
    const response = await fetch('/api/dashboard/users', { cache: 'no-store' });
    const result = await response.json();
    if (response.ok) setUsers(result.data);
  }

  async function refreshKeys() {
    const response = await fetch('/api/dashboard/api-keys', { cache: 'no-store' });
    const result = await response.json();
    if (response.ok) setApiKeys(result.data);
  }

  async function createMember(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch('/api/dashboard/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberDraft),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Team member could not be created');
      setMemberDraft({ name: '', email: '', password: '', role: 'viewer' });
      setFeedback({ ok: true, text: 'Team member created' });
      await refreshUsers();
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Team member could not be created',
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateRole(userId: string, role: UserRecord['role']) {
    const response = await fetch(`/api/dashboard/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const result = await response.json();
    if (!response.ok) {
      setFeedback({ ok: false, text: result.error || 'Role could not be updated' });
      return;
    }
    setUsers((current) => current.map((user) => user.id === userId ? { ...user, role } : user));
    setFeedback({ ok: true, text: 'Role updated' });
  }

  async function createApiKey(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    setRevealedKey('');
    try {
      const response = await fetch('/api/dashboard/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyDraft.name,
          user_id: keyDraft.user_id || null,
          instance_id: keyDraft.instance_id || null,
          role: keyDraft.role,
          scopes: keyDraft.role === 'admin' ? ['*'] : keyDraft.scopes,
          ip_allowlist: keyDraft.ip_allowlist
            .split(/[\n,]/)
            .map((value) => value.trim())
            .filter(Boolean),
          expires_at: keyDraft.expires_at
            ? new Date(`${keyDraft.expires_at}T23:59:59.000Z`).toISOString()
            : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'API key could not be created');
      setRevealedKey(result.apiKey);
      setKeyDraft({
        name: '',
        user_id: '',
        instance_id: '',
        role: 'developer',
        scopes: ['messages:send'],
        ip_allowlist: '',
        expires_at: '',
      });
      setFeedback({ ok: true, text: 'API key created' });
      await refreshKeys();
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'API key could not be created',
      });
    } finally {
      setSaving(false);
    }
  }

  async function revokeApiKey(apiKeyId: string) {
    if (!window.confirm('Revoke this API key? Any integration using it will stop immediately.')) return;

    const response = await fetch(`/api/dashboard/api-keys/${apiKeyId}`, { method: 'DELETE' });
    if (response.ok) {
      await refreshKeys();
      setFeedback({ ok: true, text: 'API key revoked' });
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Administration</p>
          <h1 className="page-title">Team & API Keys</h1>
          <p className="page-subtitle">Dashboard roles and programmatic access.</p>
        </div>
        <div className="header-stat">
          <Users size={18} />
          <strong>{users.length}</strong>
          <span>members</span>
        </div>
      </div>

      {feedback && (
        <div className={`inline-feedback page-feedback ${feedback.ok ? 'success' : 'error'}`}>
          {feedback.text}
        </div>
      )}

      <div className="admin-layout">
        <section className="surface-panel">
          <div className="panel-heading">
            <Users size={18} />
            <div>
              <h2>Team Members</h2>
              <p>Admin, developer, and viewer access.</p>
            </div>
          </div>
          <div className="responsive-table">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="entity-cell">
                        <div className="entity-avatar">{user.name.slice(0, 1).toUpperCase()}</div>
                        <div>
                          <div className="entity-title">
                            {user.name}
                            {user.id === currentUserId && <small className="you-label">You</small>}
                          </div>
                          <div className="entity-subtitle">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className="table-select"
                        value={user.role}
                        onChange={(event) => void updateRole(
                          user.id,
                          event.target.value as UserRecord['role'],
                        )}
                        disabled={user.id === currentUserId}
                        aria-label={`Role for ${user.name}`}
                      >
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                        <option value="viewer">Viewer</option>
                      </select>
                    </td>
                    <td><span className="status-badge connected">{user.status}</span></td>
                    <td>{new Date(user.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="surface-panel admin-form-panel">
          <div className="panel-heading">
            <UserPlus size={18} />
            <div><h2>Add Member</h2></div>
          </div>
          <form onSubmit={createMember}>
            <div className="form-row">
              <label htmlFor="member-name">Name</label>
              <input
                id="member-name"
                value={memberDraft.name}
                onChange={(event) => setMemberDraft({ ...memberDraft, name: event.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="member-email">Email</label>
              <input
                id="member-email"
                type="email"
                value={memberDraft.email}
                onChange={(event) => setMemberDraft({ ...memberDraft, email: event.target.value })}
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="member-password">Temporary password</label>
              <input
                id="member-password"
                type="password"
                minLength={10}
                value={memberDraft.password}
                onChange={(event) => setMemberDraft({ ...memberDraft, password: event.target.value })}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="form-row">
              <label htmlFor="member-role">Role</label>
              <select
                id="member-role"
                value={memberDraft.role}
                onChange={(event) => setMemberDraft({ ...memberDraft, role: event.target.value })}
              >
                <option value="viewer">Viewer</option>
                <option value="developer">Developer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <button className="btn btn-block" type="submit" disabled={saving}>
              <UserPlus size={16} />
              {saving ? 'Creating...' : 'Create Member'}
            </button>
          </form>
        </aside>
      </div>

      <div className="admin-layout api-key-section">
        <section className="surface-panel">
          <div className="panel-heading">
            <KeyRound size={18} />
            <div>
              <h2>API Keys</h2>
              <p>Hashed at rest and optionally scoped by instance or IP.</p>
            </div>
          </div>
          <div className="api-key-list">
            {apiKeys.length === 0 && (
              <div className="empty-state">
                <KeyRound size={24} />
                <strong>No user API keys</strong>
              </div>
            )}
            {apiKeys.map((apiKey) => (
              <div className={`api-key-row ${apiKey.revoked_at ? 'revoked' : ''}`} key={apiKey.id}>
                <ShieldCheck size={18} />
                <div className="api-key-main">
                  <strong>{apiKey.name}</strong>
                  <code>{apiKey.key_prefix}...</code>
                  <span>{apiKey.scopes.join(', ') || apiKey.role}</span>
                </div>
                <div className="api-key-meta">
                  <span>{apiKey.instance_id ? instances.find((item) => item.id === apiKey.instance_id)?.name : 'All instances'}</span>
                  <small>{apiKey.last_used_at ? `Used ${new Date(apiKey.last_used_at).toLocaleString()}` : 'Never used'}</small>
                </div>
                <span className={`status-badge ${apiKey.revoked_at ? 'failed' : 'connected'}`}>
                  {apiKey.revoked_at ? 'revoked' : 'active'}
                </span>
                {!apiKey.revoked_at && (
                  <button
                    type="button"
                    className="icon-btn icon-btn-quiet"
                    onClick={() => void revokeApiKey(apiKey.id)}
                    title="Revoke API key"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="surface-panel admin-form-panel">
          <div className="panel-heading">
            <Plus size={18} />
            <div><h2>Create API Key</h2></div>
          </div>
          {revealedKey && (
            <div className="api-key-reveal key-reveal-panel">
              <code>{revealedKey}</code>
              <button
                type="button"
                className="icon-btn"
                title="Copy API key"
                onClick={async () => {
                  await navigator.clipboard.writeText(revealedKey);
                  setCopied(true);
                }}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
          )}
          <form onSubmit={createApiKey}>
            <div className="form-row">
              <label htmlFor="key-name">Name</label>
              <input
                id="key-name"
                value={keyDraft.name}
                onChange={(event) => setKeyDraft({ ...keyDraft, name: event.target.value })}
                required
              />
            </div>
            <div className="two-column-form">
              <div className="form-row">
                <label htmlFor="key-user">Owner</label>
                <select
                  id="key-user"
                  value={keyDraft.user_id}
                  onChange={(event) => setKeyDraft({ ...keyDraft, user_id: event.target.value })}
                >
                  <option value="">Organization</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <label htmlFor="key-instance">Instance</label>
                <select
                  id="key-instance"
                  value={keyDraft.instance_id}
                  onChange={(event) => setKeyDraft({ ...keyDraft, instance_id: event.target.value })}
                >
                  <option value="">All instances</option>
                  {instances.map((instance) => (
                    <option key={instance.id} value={instance.id}>{instance.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="key-role">Role</label>
              <select
                id="key-role"
                value={keyDraft.role}
                onChange={(event) => setKeyDraft({ ...keyDraft, role: event.target.value })}
              >
                <option value="developer">Developer</option>
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            {keyDraft.role !== 'admin' && (
              <fieldset className="scope-fieldset">
                <legend>Scopes</legend>
                {availableScopes.map((scope) => (
                  <label className="settings-check" key={scope}>
                    <input
                      type="checkbox"
                      checked={keyDraft.scopes.includes(scope)}
                      onChange={(event) => setKeyDraft({
                        ...keyDraft,
                        scopes: event.target.checked
                          ? [...keyDraft.scopes, scope]
                          : keyDraft.scopes.filter((item) => item !== scope),
                      })}
                    />
                    <span>{scope}</span>
                  </label>
                ))}
              </fieldset>
            )}
            <div className="form-row">
              <label htmlFor="key-ips">IP allowlist</label>
              <textarea
                id="key-ips"
                rows={3}
                value={keyDraft.ip_allowlist}
                onChange={(event) => setKeyDraft({ ...keyDraft, ip_allowlist: event.target.value })}
                placeholder="203.0.113.10, 10.0.0.0/8"
              />
            </div>
            <div className="form-row">
              <label htmlFor="key-expiry">Expires</label>
              <input
                id="key-expiry"
                type="date"
                value={keyDraft.expires_at}
                onChange={(event) => setKeyDraft({ ...keyDraft, expires_at: event.target.value })}
              />
            </div>
            <button className="btn btn-block" type="submit" disabled={saving}>
              <KeyRound size={16} />
              {saving ? 'Creating...' : 'Create API Key'}
            </button>
          </form>
        </aside>
      </div>
    </div>
  );
}
