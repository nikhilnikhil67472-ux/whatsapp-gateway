'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  Check,
  ContactRound,
  Plus,
  Save,
  Search,
  Tag,
  Trash2,
  UserRound,
} from 'lucide-react';

type Contact = {
  id: string;
  instance_id: string;
  remote_jid: string;
  phone_number?: string | null;
  display_name?: string | null;
  email?: string | null;
  status: 'open' | 'pending' | 'resolved' | 'blocked';
  assigned_user_id?: string | null;
  opted_out: boolean;
  notes?: string | null;
  last_message_at?: string | null;
  tags: Array<{ id: string; name: string; color: string }>;
};

type TagRecord = {
  id: string;
  name: string;
  color: string;
};

export default function CrmWorkspace({
  initialContacts,
  instances,
  users,
  initialTags,
}: {
  initialContacts: Contact[];
  instances: Array<{ id: string; name: string }>;
  users: Array<{ id: string; name: string; email: string }>;
  initialTags: TagRecord[];
}) {
  const [contacts, setContacts] = useState(initialContacts);
  const [tags, setTags] = useState(initialTags);
  const [selectedId, setSelectedId] = useState(initialContacts[0]?.id || '');
  const [draft, setDraft] = useState<Contact | null>(initialContacts[0] || null);
  const [query, setQuery] = useState('');
  const [instanceFilter, setInstanceFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#2563eb');

  const selected = contacts.find((contact) => contact.id === selectedId) || null;
  const filteredContacts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (instanceFilter !== 'all' && contact.instance_id !== instanceFilter) return false;
      if (statusFilter !== 'all' && contact.status !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        contact.display_name,
        contact.phone_number,
        contact.remote_jid,
        contact.email,
      ].some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
    });
  }, [contacts, instanceFilter, query, statusFilter]);

  function chooseContact(contact: Contact) {
    setSelectedId(contact.id);
    setDraft({ ...contact, tags: [...contact.tags] });
    setFeedback(null);
  }

  async function saveContact(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/dashboard/contacts/${draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: draft.display_name || null,
          email: draft.email || null,
          status: draft.status,
          assigned_user_id: draft.assigned_user_id || null,
          opted_out: draft.opted_out,
          notes: draft.notes || null,
          tag_ids: draft.tags.map((tag) => tag.id),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Contact could not be saved');
      setContacts((current) => current.map((contact) => (
        contact.id === draft.id ? result.data : contact
      )));
      setDraft(result.data);
      setFeedback({ ok: true, text: 'Contact saved' });
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Contact could not be saved',
      });
    } finally {
      setSaving(false);
    }
  }

  async function createTag(event: FormEvent) {
    event.preventDefault();
    if (!newTagName.trim()) return;
    const response = await fetch('/api/dashboard/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTagName, color: newTagColor }),
    });
    const result = await response.json();
    if (!response.ok) {
      setFeedback({ ok: false, text: result.error || 'Tag could not be created' });
      return;
    }
    const tagsResponse = await fetch('/api/dashboard/tags', { cache: 'no-store' });
    const tagsResult = await tagsResponse.json();
    if (tagsResponse.ok) setTags(tagsResult.data);
    setNewTagName('');
    setFeedback({ ok: true, text: 'Tag created' });
  }

  async function deleteTag(tagId: string) {
    if (!window.confirm('Delete this tag from every contact? This cannot be undone.')) return;

    const response = await fetch(`/api/dashboard/tags?id=${encodeURIComponent(tagId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) return;
    setTags((current) => current.filter((tag) => tag.id !== tagId));
    setContacts((current) => current.map((contact) => ({
      ...contact,
      tags: contact.tags.filter((tag) => tag.id !== tagId),
    })));
    if (draft) {
      setDraft({ ...draft, tags: draft.tags.filter((tag) => tag.id !== tagId) });
    }
  }

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Customer Operations</p>
          <h1 className="page-title">Contacts</h1>
          <p className="page-subtitle">Ownership, status, tags, consent, and notes.</p>
        </div>
        <div className="header-stat">
          <ContactRound size={18} />
          <strong>{contacts.length}</strong>
          <span>contacts</span>
        </div>
      </div>

      <div className="crm-toolbar">
        <label className="search-control">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search contacts"
            aria-label="Search contacts"
          />
        </label>
        <select
          value={instanceFilter}
          onChange={(event) => setInstanceFilter(event.target.value)}
          aria-label="Filter by instance"
        >
          <option value="all">All instances</option>
          {instances.map((instance) => (
            <option key={instance.id} value={instance.id}>{instance.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="pending">Pending</option>
          <option value="resolved">Resolved</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      <div className="crm-layout">
        <section className="surface-panel contact-directory" aria-label="Contact directory">
          <div className="directory-count">{filteredContacts.length} shown</div>
          <div className="contact-list">
            {filteredContacts.length === 0 && (
              <div className="empty-state">
                <ContactRound size={24} />
                <strong>No matching contacts</strong>
              </div>
            )}
            {filteredContacts.map((contact) => (
              <button
                type="button"
                key={contact.id}
                className={`contact-list-item ${selectedId === contact.id ? 'active' : ''}`}
                onClick={() => chooseContact(contact)}
              >
                <span className="entity-avatar">
                  {(contact.display_name || contact.phone_number || 'C').slice(0, 1).toUpperCase()}
                </span>
                <span className="contact-list-copy">
                  <strong>{contact.display_name || contact.phone_number || contact.remote_jid}</strong>
                  <small>{contact.phone_number || contact.remote_jid}</small>
                  <span className="tag-strip">
                    {contact.tags.slice(0, 3).map((tag) => (
                      <i key={tag.id} style={{ backgroundColor: tag.color }} title={tag.name} />
                    ))}
                  </span>
                </span>
                <span className={`status-badge ${contact.status}`}>{contact.status}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="surface-panel contact-editor">
          {!selected || !draft ? (
            <div className="empty-state">
              <UserRound size={24} />
              <strong>Select a contact</strong>
            </div>
          ) : (
            <form onSubmit={saveContact}>
              <div className="panel-heading editor-heading">
                <UserRound size={18} />
                <div>
                  <h2>{selected.display_name || selected.phone_number || 'Contact'}</h2>
                  <p>{instances.find((instance) => instance.id === selected.instance_id)?.name}</p>
                </div>
              </div>

              <div className="two-column-form">
                <div className="form-row">
                  <label htmlFor="contact-name">Display name</label>
                  <input
                    id="contact-name"
                    value={draft.display_name || ''}
                    onChange={(event) => setDraft({ ...draft, display_name: event.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="contact-email">Email</label>
                  <input
                    id="contact-email"
                    type="email"
                    value={draft.email || ''}
                    onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="contact-status">Status</label>
                  <select
                    id="contact-status"
                    value={draft.status}
                    onChange={(event) => setDraft({
                      ...draft,
                      status: event.target.value as Contact['status'],
                    })}
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="blocked">Blocked</option>
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="contact-owner">Owner</label>
                  <select
                    id="contact-owner"
                    value={draft.assigned_user_id || ''}
                    onChange={(event) => setDraft({
                      ...draft,
                      assigned_user_id: event.target.value || null,
                    })}
                  >
                    <option value="">Unassigned</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-row">
                <label htmlFor="contact-notes">Notes</label>
                <textarea
                  id="contact-notes"
                  rows={5}
                  value={draft.notes || ''}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                />
              </div>

              <fieldset className="tag-fieldset">
                <legend>Tags</legend>
                <div className="tag-options">
                  {tags.map((tag) => {
                    const checked = draft.tags.some((item) => item.id === tag.id);
                    return (
                      <label key={tag.id} className={`tag-option ${checked ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDraft({
                              ...draft,
                              tags: checked
                                ? draft.tags.filter((item) => item.id !== tag.id)
                                : [...draft.tags, tag],
                            });
                          }}
                        />
                        <i style={{ backgroundColor: tag.color }} />
                        {tag.name}
                        {checked && <Check size={14} />}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <label className="settings-check consent-check">
                <input
                  type="checkbox"
                  checked={draft.opted_out}
                  onChange={(event) => setDraft({ ...draft, opted_out: event.target.checked })}
                />
                <span>Opted out of automated messages</span>
              </label>

              <div className="editor-actions">
                <div>
                  {feedback && (
                    <span className={`inline-feedback ${feedback.ok ? 'success' : 'error'}`}>
                      {feedback.text}
                    </span>
                  )}
                </div>
                <button className="btn" type="submit" disabled={saving}>
                  <Save size={16} />
                  {saving ? 'Saving...' : 'Save Contact'}
                </button>
              </div>
            </form>
          )}
        </section>

        <aside className="surface-panel tag-manager">
          <div className="panel-heading">
            <Tag size={18} />
            <div>
              <h2>Tags</h2>
              <p>{tags.length} available</p>
            </div>
          </div>
          <form onSubmit={createTag} className="tag-create-form">
            <input
              type="color"
              value={newTagColor}
              onChange={(event) => setNewTagColor(event.target.value)}
              aria-label="Tag color"
            />
            <input
              value={newTagName}
              onChange={(event) => setNewTagName(event.target.value)}
              placeholder="New tag"
              aria-label="New tag name"
            />
            <button type="submit" className="icon-btn" title="Create tag" aria-label="Create tag">
              <Plus size={17} />
            </button>
          </form>
          <div className="managed-tag-list">
            {tags.map((tag) => (
              <div className="managed-tag" key={tag.id}>
                <i style={{ backgroundColor: tag.color }} />
                <span>{tag.name}</span>
                <button
                  type="button"
                  className="icon-btn icon-btn-quiet"
                  onClick={() => void deleteTag(tag.id)}
                  title="Delete tag"
                  aria-label={`Delete ${tag.name}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
