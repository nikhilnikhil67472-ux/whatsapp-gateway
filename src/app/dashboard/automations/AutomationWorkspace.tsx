'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Braces,
  MessageSquareReply,
  Plus,
  RefreshCw,
  Trash2,
  Workflow,
} from 'lucide-react';

type InstanceOption = {
  id: string;
  name: string;
  status: string;
};

type Rule = {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  match_type: string;
  match_value: string;
  response_type: string;
  response_payload: Record<string, unknown>;
  cooldown_seconds: number;
  last_triggered_at?: string | null;
};

type Template = {
  id: string;
  instance_id?: string | null;
  name: string;
  category: string;
  content: string;
  variables: string[];
  active: boolean;
};

const emptyRule = {
  name: '',
  match_type: 'contains',
  match_value: '',
  response_type: 'text',
  response_text: '',
  media_type: 'image',
  mime_type: 'image/jpeg',
  priority: 100,
  cooldown_seconds: 0,
};

export default function AutomationWorkspace({
  instances,
}: {
  instances: InstanceOption[];
}) {
  const [instanceId, setInstanceId] = useState(instances[0]?.id || '');
  const [tab, setTab] = useState<'rules' | 'templates'>('rules');
  const [rules, setRules] = useState<Rule[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [ruleDraft, setRuleDraft] = useState(emptyRule);
  const [templateDraft, setTemplateDraft] = useState({
    name: '',
    category: 'general',
    content: '',
    global: false,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedInstance = useMemo(
    () => instances.find((instance) => instance.id === instanceId),
    [instanceId, instances],
  );

  const loadData = useCallback(async () => {
    if (!instanceId) return;
    setLoading(true);
    const [rulesResponse, templatesResponse] = await Promise.all([
      fetch(`/api/dashboard/instances/${instanceId}/rules`, { cache: 'no-store' }),
      fetch(`/api/dashboard/templates?instanceId=${encodeURIComponent(instanceId)}`, { cache: 'no-store' }),
    ]);
    const [rulesResult, templatesResult] = await Promise.all([
      rulesResponse.json(),
      templatesResponse.json(),
    ]);
    if (rulesResponse.ok) setRules(rulesResult.data);
    if (templatesResponse.ok) setTemplates(templatesResult.data);
    setLoading(false);
  }, [instanceId]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadData]);

  async function createRule(event: FormEvent) {
    event.preventDefault();
    if (!instanceId) return;
    setSaving(true);
    setFeedback(null);
    const responsePayload = ruleDraft.response_type === 'text'
      ? { reply: true, text: ruleDraft.response_text }
      : ruleDraft.response_type === 'audio'
        ? {
            reply: true,
            audioUrl: ruleDraft.response_text,
            mimeType: ruleDraft.mime_type || 'audio/ogg; codecs=opus',
          }
        : {
            reply: true,
            mediaUrl: ruleDraft.response_text,
            mediaType: ruleDraft.media_type,
            mimeType: ruleDraft.mime_type,
          };
    try {
      const response = await fetch(`/api/dashboard/instances/${instanceId}/rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleDraft.name,
          enabled: true,
          priority: Number(ruleDraft.priority),
          match_type: ruleDraft.match_type,
          match_value: ruleDraft.match_value,
          response_type: ruleDraft.response_type,
          response_payload: responsePayload,
          cooldown_seconds: Number(ruleDraft.cooldown_seconds),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Rule could not be created');
      setRuleDraft(emptyRule);
      setFeedback({ ok: true, text: 'Auto-reply rule created' });
      await loadData();
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Rule could not be created',
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRule(ruleId: string) {
    if (!window.confirm('Delete this auto-reply rule? This cannot be undone.')) return;

    const response = await fetch(`/api/dashboard/instances/${instanceId}/rules/${ruleId}`, {
      method: 'DELETE',
    });
    if (response.ok) setRules((current) => current.filter((rule) => rule.id !== ruleId));
  }

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);
    const variables = [...templateDraft.content.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)]
      .map((match) => match[1])
      .filter((value, index, values) => values.indexOf(value) === index);
    try {
      const response = await fetch('/api/dashboard/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: templateDraft.global ? null : instanceId,
          name: templateDraft.name,
          category: templateDraft.category,
          content: templateDraft.content,
          variables,
          active: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Template could not be created');
      setTemplateDraft({ name: '', category: 'general', content: '', global: false });
      setFeedback({ ok: true, text: 'Template created' });
      await loadData();
    } catch (error) {
      setFeedback({
        ok: false,
        text: error instanceof Error ? error.message : 'Template could not be created',
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(templateId: string) {
    if (!window.confirm('Delete this message template? This cannot be undone.')) return;

    const response = await fetch(`/api/dashboard/templates/${templateId}`, {
      method: 'DELETE',
    });
    if (response.ok) setTemplates((current) => current.filter((template) => template.id !== templateId));
  }

  return (
    <div className="page-shell">
      <div className="page-header compact-header">
        <div>
          <p className="page-kicker">Automation</p>
          <h1 className="page-title">Rules & Templates</h1>
          <p className="page-subtitle">Deterministic replies before AI and reusable message content.</p>
        </div>
        <div className="instance-selector">
          <label htmlFor="automation-instance">Instance</label>
          <select
            id="automation-instance"
            value={instanceId}
            onChange={(event) => setInstanceId(event.target.value)}
          >
            {instances.map((instance) => (
              <option value={instance.id} key={instance.id}>
                {instance.name} ({instance.status.replaceAll('_', ' ')})
              </option>
            ))}
          </select>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="surface-panel empty-state">
          <Workflow size={26} />
          <strong>Create an instance first</strong>
        </div>
      ) : (
        <>
          <div className="workspace-tabs">
            <button type="button" className={tab === 'rules' ? 'active' : ''} onClick={() => setTab('rules')}>
              <MessageSquareReply size={17} />
              Auto-reply rules
            </button>
            <button type="button" className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>
              <Braces size={17} />
              Templates
            </button>
            <button type="button" className="icon-btn" onClick={() => void loadData()} title="Refresh">
              <RefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
          </div>

          {feedback && (
            <div className={`inline-feedback page-feedback ${feedback.ok ? 'success' : 'error'}`}>
              {feedback.text}
            </div>
          )}

          {tab === 'rules' ? (
            <div className="automation-layout">
              <section className="surface-panel">
                <div className="panel-heading">
                  <MessageSquareReply size={18} />
                  <div>
                    <h2>{selectedInstance?.name} rules</h2>
                    <p>{rules.length} configured</p>
                  </div>
                </div>
                <div className="automation-list">
                  {rules.length === 0 && (
                    <div className="empty-state">
                      <MessageSquareReply size={24} />
                      <strong>No auto-reply rules</strong>
                    </div>
                  )}
                  {rules.map((rule) => (
                    <div className="automation-row" key={rule.id}>
                      <span className={`rule-state ${rule.enabled ? 'enabled' : ''}`} />
                      <div className="automation-main">
                        <strong>{rule.name}</strong>
                        <p>
                          {rule.match_type.replaceAll('_', ' ')} <code>{rule.match_value}</code>
                        </p>
                      </div>
                      <span className="status-badge connected">{rule.response_type}</span>
                      <span className="rule-priority">P{rule.priority}</span>
                      <button
                        type="button"
                        className="icon-btn icon-btn-quiet"
                        onClick={() => void deleteRule(rule.id)}
                        title="Delete rule"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <aside className="surface-panel automation-form-panel">
                <div className="panel-heading">
                  <Plus size={18} />
                  <div><h2>New Rule</h2></div>
                </div>
                <form onSubmit={createRule}>
                  <div className="form-row">
                    <label htmlFor="rule-name">Name</label>
                    <input
                      id="rule-name"
                      value={ruleDraft.name}
                      onChange={(event) => setRuleDraft({ ...ruleDraft, name: event.target.value })}
                      required
                    />
                  </div>
                  <div className="two-column-form">
                    <div className="form-row">
                      <label htmlFor="match-type">Match</label>
                      <select
                        id="match-type"
                        value={ruleDraft.match_type}
                        onChange={(event) => setRuleDraft({ ...ruleDraft, match_type: event.target.value })}
                      >
                        <option value="contains">Contains</option>
                        <option value="exact">Exact</option>
                        <option value="starts_with">Starts with</option>
                        <option value="regex">Regex</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label htmlFor="rule-priority">Priority</label>
                      <input
                        id="rule-priority"
                        type="number"
                        min="1"
                        max="10000"
                        value={ruleDraft.priority}
                        onChange={(event) => setRuleDraft({ ...ruleDraft, priority: Number(event.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <label htmlFor="match-value">Value</label>
                    <input
                      id="match-value"
                      value={ruleDraft.match_value}
                      onChange={(event) => setRuleDraft({ ...ruleDraft, match_value: event.target.value })}
                      required
                    />
                  </div>
                  <div className="two-column-form">
                    <div className="form-row">
                      <label htmlFor="response-type">Response</label>
                      <select
                        id="response-type"
                        value={ruleDraft.response_type}
                        onChange={(event) => setRuleDraft({ ...ruleDraft, response_type: event.target.value })}
                      >
                        <option value="text">Text</option>
                        <option value="media">Media URL</option>
                        <option value="audio">Audio URL</option>
                      </select>
                    </div>
                    <div className="form-row">
                      <label htmlFor="rule-cooldown">Cooldown (seconds)</label>
                      <input
                        id="rule-cooldown"
                        type="number"
                        min="0"
                        max="604800"
                        value={ruleDraft.cooldown_seconds}
                        onChange={(event) => setRuleDraft({
                          ...ruleDraft,
                          cooldown_seconds: Number(event.target.value),
                        })}
                      />
                    </div>
                  </div>
                  {ruleDraft.response_type === 'media' && (
                    <div className="two-column-form">
                      <div className="form-row">
                        <label htmlFor="media-type">Media type</label>
                        <select
                          id="media-type"
                          value={ruleDraft.media_type}
                          onChange={(event) => setRuleDraft({ ...ruleDraft, media_type: event.target.value })}
                        >
                          <option value="image">Image</option>
                          <option value="video">Video</option>
                          <option value="document">Document</option>
                        </select>
                      </div>
                      <div className="form-row">
                        <label htmlFor="mime-type">MIME type</label>
                        <input
                          id="mime-type"
                          value={ruleDraft.mime_type}
                          onChange={(event) => setRuleDraft({ ...ruleDraft, mime_type: event.target.value })}
                        />
                      </div>
                    </div>
                  )}
                  <div className="form-row">
                    <label htmlFor="rule-response">
                      {ruleDraft.response_type === 'text' ? 'Reply text' : 'Media URL'}
                    </label>
                    <textarea
                      id="rule-response"
                      rows={4}
                      value={ruleDraft.response_text}
                      onChange={(event) => setRuleDraft({ ...ruleDraft, response_text: event.target.value })}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-block" disabled={saving}>
                    <Plus size={16} />
                    {saving ? 'Creating...' : 'Create Rule'}
                  </button>
                </form>
              </aside>
            </div>
          ) : (
            <div className="automation-layout">
              <section className="surface-panel">
                <div className="panel-heading">
                  <Braces size={18} />
                  <div>
                    <h2>Message Templates</h2>
                    <p>{templates.length} available</p>
                  </div>
                </div>
                <div className="template-list">
                  {templates.length === 0 && (
                    <div className="empty-state">
                      <Braces size={24} />
                      <strong>No templates</strong>
                    </div>
                  )}
                  {templates.map((template) => (
                    <article className="template-row" key={template.id}>
                      <div className="template-row-heading">
                        <div>
                          <strong>{template.name}</strong>
                          <span>{template.instance_id ? 'Instance' : 'Organization'} · {template.category}</span>
                        </div>
                        <button
                          type="button"
                          className="icon-btn icon-btn-quiet"
                          onClick={() => void deleteTemplate(template.id)}
                          title="Delete template"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <p>{template.content}</p>
                      {template.variables.length > 0 && (
                        <div className="variable-list">
                          {template.variables.map((variable) => <code key={variable}>{`{{${variable}}}`}</code>)}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>

              <aside className="surface-panel automation-form-panel">
                <div className="panel-heading">
                  <Plus size={18} />
                  <div><h2>New Template</h2></div>
                </div>
                <form onSubmit={createTemplate}>
                  <div className="form-row">
                    <label htmlFor="template-name">Name</label>
                    <input
                      id="template-name"
                      value={templateDraft.name}
                      onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })}
                      required
                    />
                  </div>
                  <div className="form-row">
                    <label htmlFor="template-category">Category</label>
                    <select
                      id="template-category"
                      value={templateDraft.category}
                      onChange={(event) => setTemplateDraft({ ...templateDraft, category: event.target.value })}
                    >
                      <option value="general">General</option>
                      <option value="support">Support</option>
                      <option value="sales">Sales</option>
                      <option value="billing">Billing</option>
                      <option value="opt_out">Consent</option>
                    </select>
                  </div>
                  <div className="form-row">
                    <label htmlFor="template-content">Content</label>
                    <textarea
                      id="template-content"
                      rows={8}
                      value={templateDraft.content}
                      onChange={(event) => setTemplateDraft({ ...templateDraft, content: event.target.value })}
                      placeholder="Hello {{name}}, your order {{order_id}} is ready."
                      required
                    />
                  </div>
                  <label className="settings-check">
                    <input
                      type="checkbox"
                      checked={templateDraft.global}
                      onChange={(event) => setTemplateDraft({
                        ...templateDraft,
                        global: event.target.checked,
                      })}
                    />
                    <span>Available to every instance</span>
                  </label>
                  <button type="submit" className="btn btn-block" disabled={saving}>
                    <Plus size={16} />
                    {saving ? 'Creating...' : 'Create Template'}
                  </button>
                </form>
              </aside>
            </div>
          )}
        </>
      )}
    </div>
  );
}
