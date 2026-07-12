'use client';

import { useState, useEffect, use } from 'react';
import { Save, TestTube2 } from 'lucide-react';
import { DEFAULT_EVENT_SETTINGS, getEventSettings } from '@/lib/whatsapp-engine/event-settings';

type SettingPath =
  | ['messages', keyof typeof DEFAULT_EVENT_SETTINGS.messages]
  | ['groups', keyof typeof DEFAULT_EVENT_SETTINGS.groups]
  | ['calls', keyof typeof DEFAULT_EVENT_SETTINGS.calls]
  | ['contacts', keyof typeof DEFAULT_EVENT_SETTINGS.contacts]
  | ['webhooks', keyof typeof DEFAULT_EVENT_SETTINGS.webhooks];

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export default function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params);
  const id = unwrappedParams.id;

  const [instance, setInstance] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    fetchInstance();
  }, [id]);

  async function fetchInstance() {
    const res = await fetch(`/api/instances/${id}`, { cache: 'no-store' });
    const json = await res.json();
    if (json.success) {
      const data = json.data;
      setInstance({
        ...data,
        event_settings: getEventSettings(data),
      });
    }
    setLoading(false);
  }

  function setEventSetting(path: SettingPath, value: boolean | string | string[]) {
    const [group, key] = path;
    setInstance((current: any) => ({
      ...current,
      event_settings: {
        ...current.event_settings,
        [group]: {
          ...current.event_settings[group],
          [key]: value,
        },
      },
    }));
  }

  function applyPreset(preset: 'support' | 'lead' | 'group' | 'logger') {
    const base = getEventSettings(instance);
    const presets = {
      support: {
        ...base,
        messages: { ...base.messages, receive_private_messages: true, send_private_messages_to_ai: true, process_media_messages: true },
        groups: { ...base.groups, ignore_group_messages: true, send_group_messages_to_ai: false },
        calls: { ...base.calls, detect_calls: true, auto_reject_calls: true, send_auto_reply: true },
        contacts: { ...base.contacts, track_presence: false },
      },
      lead: {
        ...base,
        messages: { ...base.messages, receive_private_messages: true, send_private_messages_to_ai: true },
        groups: { ...base.groups, ignore_group_messages: true, send_group_messages_to_ai: false },
        calls: { ...base.calls, detect_calls: true, auto_reject_calls: true, send_auto_reply: true },
        webhooks: { ...base.webhooks, forward_non_message_events: true },
      },
      group: {
        ...base,
        messages: { ...base.messages, receive_private_messages: true, send_private_messages_to_ai: true },
        groups: { ...base.groups, ignore_group_messages: false, send_group_messages_to_ai: true, log_participant_updates: true },
        calls: { ...base.calls, detect_calls: true, auto_reject_calls: true, send_auto_reply: true },
      },
      logger: {
        ...base,
        messages: { ...base.messages, receive_private_messages: true, send_private_messages_to_ai: false, log_reactions: true, log_deleted_messages: true, track_receipts: true },
        groups: { ...base.groups, ignore_group_messages: false, send_group_messages_to_ai: false, log_group_updates: true, log_participant_updates: true },
        calls: { ...base.calls, detect_calls: true, auto_reject_calls: false, send_auto_reply: false },
        webhooks: { ...base.webhooks, forward_non_message_events: true },
      },
    };

    setInstance((current: any) => ({
      ...current,
      ai_enabled: preset !== 'logger',
      event_settings: presets[preset],
    }));
  }

  async function testWebhook() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/instances/${id}/test-webhook`, { method: 'POST' });
      const json = await res.json();
      setTestResult({ ok: res.ok, ...json });
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const eventSettings = getEventSettings(instance);
      const res = await fetch(`/api/instances/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ai_enabled: instance.ai_enabled ?? true,
          n8n_webhook_url: instance.n8n_webhook_url || null,
          agent_mode: instance.agent_mode || 'text_only',
          event_settings: eventSettings,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Failed to save settings');

      alert('Settings saved successfully');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div>Loading...</div>;
  if (!instance) return <div>Instance not found</div>;

  const settings = getEventSettings(instance);

  return (
    <div className="page-shell">
      <div className="page-header">
        <div>
          <p className="page-kicker">Configuration</p>
          <h1 className="page-title">Instance Settings</h1>
          <p className="page-subtitle">
            Configure AI routing, event capture, group behavior, and call handling for {instance.instance_name}.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave}>
        <div className="card settings-card">
          <h2>Quick Presets</h2>
          <p className="help-text" style={{ marginBottom: '14px' }}>
            Pick a simple mode. You can still customize every setting below.
          </p>
          <div className="preset-grid">
            <button type="button" className="preset-card" onClick={() => applyPreset('support')}>
              <strong>Business Support</strong>
              <span>Private chat AI, groups off, calls auto-reply.</span>
            </button>
            <button type="button" className="preset-card" onClick={() => applyPreset('lead')}>
              <strong>Lead Capture</strong>
              <span>Forward useful events and reply to new customers.</span>
            </button>
            <button type="button" className="preset-card" onClick={() => applyPreset('group')}>
              <strong>Group Bot</strong>
              <span>Allow group messages and participant logs.</span>
            </button>
            <button type="button" className="preset-card" onClick={() => applyPreset('logger')}>
              <strong>Silent Logger</strong>
              <span>Log activity without sending AI replies.</span>
            </button>
          </div>
        </div>

        <div className="card settings-card">
          <h2>AI Routing</h2>

          <CheckboxRow
            label="Enable AI Agent for this instance"
            checked={instance.ai_enabled ?? true}
            onChange={(checked) => setInstance({ ...instance, ai_enabled: checked })}
          />

          <div className="form-row">
            <label>AI Automation Link</label>
            <input
              type="url"
              value={instance.n8n_webhook_url || ''}
              onChange={(e) => setInstance({ ...instance, n8n_webhook_url: e.target.value })}
              placeholder="https://your-n8n.com/webhook/..."
            />
            <p className="help-text">This is your n8n webhook URL. Live WhatsApp messages will be sent here with the customer phone number.</p>
          </div>

          <div className="form-row">
            <label>Agent Mode</label>
            <select
              value={instance.agent_mode || 'text_only'}
              onChange={(e) => setInstance({ ...instance, agent_mode: e.target.value })}
            >
              <option value="text_only">Text Only</option>
              <option value="text_plus_image">Text + Image</option>
              <option value="text_plus_audio">Text + Audio</option>
              <option value="full_multimodal">Full Multimodal</option>
            </select>
          </div>

          <div id="webhook-test" className="webhook-test-box">
            <div>
              <strong>Test AI Automation Link</strong>
              <p className="help-text">Sends a sample message with sender phone number to your webhook.</p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={testWebhook} disabled={testing || !instance.n8n_webhook_url}>
              <TestTube2 size={16} /> {testing ? 'Testing...' : 'Test Webhook'}
            </button>
          </div>
          {testResult && (
            <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>
              <strong>{testResult.ok ? 'Webhook reached successfully' : 'Webhook test failed'}</strong>
              <p>{testResult.hint || testResult.error}</p>
              {testResult.sentPayload?.sender?.phone_number && (
                <p>Sample sender number sent: <code>+{testResult.sentPayload.sender.phone_number}</code></p>
              )}
              {testResult.response && (
                <pre className="payload-preview">{JSON.stringify(testResult.response, null, 2)}</pre>
              )}
            </div>
          )}
        </div>

        <div className="settings-grid">
          <div className="card settings-card">
            <h2>Message Events</h2>
            <CheckboxRow
              label="Receive private messages"
              checked={settings.messages.receive_private_messages}
              onChange={(checked) => setEventSetting(['messages', 'receive_private_messages'], checked)}
            />
            <CheckboxRow
              label="Send private messages to AI"
              checked={settings.messages.send_private_messages_to_ai}
              onChange={(checked) => setEventSetting(['messages', 'send_private_messages_to_ai'], checked)}
            />
            <CheckboxRow
              label="Log outgoing messages"
              checked={settings.messages.log_outgoing_messages}
              onChange={(checked) => setEventSetting(['messages', 'log_outgoing_messages'], checked)}
            />
            <CheckboxRow
              label="Log message reactions"
              checked={settings.messages.log_reactions}
              onChange={(checked) => setEventSetting(['messages', 'log_reactions'], checked)}
            />
            <CheckboxRow
              label="Log deleted messages"
              checked={settings.messages.log_deleted_messages}
              onChange={(checked) => setEventSetting(['messages', 'log_deleted_messages'], checked)}
            />
            <CheckboxRow
              label="Track delivery/read status"
              checked={settings.messages.track_receipts}
              onChange={(checked) => setEventSetting(['messages', 'track_receipts'], checked)}
            />
            <CheckboxRow
              label="Process media messages"
              checked={settings.messages.process_media_messages}
              onChange={(checked) => setEventSetting(['messages', 'process_media_messages'], checked)}
            />
          </div>

          <div className="card settings-card">
            <h2>Group Events</h2>
            <CheckboxRow
              label="Ignore group messages"
              checked={settings.groups.ignore_group_messages}
              onChange={(checked) => setEventSetting(['groups', 'ignore_group_messages'], checked)}
            />
            <CheckboxRow
              label="Send group messages to AI"
              checked={settings.groups.send_group_messages_to_ai}
              onChange={(checked) => setEventSetting(['groups', 'send_group_messages_to_ai'], checked)}
            />
            <CheckboxRow
              label="Log group metadata updates"
              checked={settings.groups.log_group_updates}
              onChange={(checked) => setEventSetting(['groups', 'log_group_updates'], checked)}
            />
            <CheckboxRow
              label="Log participant add/remove/promote/demote"
              checked={settings.groups.log_participant_updates}
              onChange={(checked) => setEventSetting(['groups', 'log_participant_updates'], checked)}
            />
            <CheckboxRow
              label="Log group join requests"
              checked={settings.groups.log_join_requests}
              onChange={(checked) => setEventSetting(['groups', 'log_join_requests'], checked)}
            />
          </div>

          <div className="card settings-card">
            <h2>Call Settings</h2>
            <CheckboxRow
              label="Detect incoming calls"
              checked={settings.calls.detect_calls}
              onChange={(checked) => setEventSetting(['calls', 'detect_calls'], checked)}
            />
            <CheckboxRow
              label="Auto reject calls"
              checked={settings.calls.auto_reject_calls}
              onChange={(checked) => setEventSetting(['calls', 'auto_reject_calls'], checked)}
            />
            <CheckboxRow
              label="Send auto reply after call"
              checked={settings.calls.send_auto_reply}
              onChange={(checked) => setEventSetting(['calls', 'send_auto_reply'], checked)}
            />
            <div className="form-row">
              <label>Call auto reply message</label>
              <textarea
                value={settings.calls.auto_reply_text}
                onChange={(e) => setEventSetting(['calls', 'auto_reply_text'], e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <div className="card settings-card">
            <h2>Contacts & Chats</h2>
            <CheckboxRow
              label="Sync contacts"
              checked={settings.contacts.sync_contacts}
              onChange={(checked) => setEventSetting(['contacts', 'sync_contacts'], checked)}
            />
            <CheckboxRow
              label="Track chat updates"
              checked={settings.contacts.track_chat_updates}
              onChange={(checked) => setEventSetting(['contacts', 'track_chat_updates'], checked)}
            />
            <CheckboxRow
              label="Track typing/online presence"
              checked={settings.contacts.track_presence}
              onChange={(checked) => setEventSetting(['contacts', 'track_presence'], checked)}
            />
            <CheckboxRow
              label="Track blocklist changes"
              checked={settings.contacts.track_blocklist}
              onChange={(checked) => setEventSetting(['contacts', 'track_blocklist'], checked)}
            />
            <CheckboxRow
              label="Import old history on login"
              checked={settings.contacts.import_history}
              onChange={(checked) => setEventSetting(['contacts', 'import_history'], checked)}
            />
          </div>
        </div>

        <div className="card settings-card">
          <h2>Webhook Event Forwarding</h2>
          <CheckboxRow
            label="Forward non-message events to the n8n webhook"
            checked={settings.webhooks.forward_non_message_events}
            onChange={(checked) => setEventSetting(['webhooks', 'forward_non_message_events'], checked)}
          />
          <p className="help-text">
            Forwards call, group, reaction, delete, and contact events using the same webhook URL. Message AI replies still use the normal message flow.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
          <button type="submit" className="btn" disabled={saving}>
            <Save size={16} /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      <div className="card" style={{ marginTop: '24px', backgroundColor: '#fef2f2', borderColor: '#fca5a5' }}>
        <h3 style={{ marginTop: 0, color: '#991b1b' }}>Secret Information</h3>
        <p style={{ fontSize: '0.9rem' }}>
          <strong>Webhook Secret (Backend):</strong> <br />
          <code style={{ background: 'white', padding: '4px 8px', borderRadius: '4px', display: 'block', marginTop: '8px', wordBreak: 'break-all' }}>
            {instance.webhook_secret || 'Not set'}
          </code>
        </p>
      </div>
    </div>
  );
}
