import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dbPath = process.env.SQLITE_DB_PATH
  ? path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.SQLITE_DB_PATH)
  : path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'gateway.db');
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
sqlite.pragma('busy_timeout = 5000');

function now() {
  return new Date().toISOString();
}

function id() {
  return crypto.randomUUID();
}

function json(value: unknown) {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function inflateInstance(row: any) {
  if (!row) return null;
  return {
    ...row,
    ai_enabled: Boolean(row.ai_enabled),
    ai_auto_reply: Boolean(row.ai_auto_reply),
    reject_calls: Boolean(row.reject_calls),
    ignore_groups: Boolean(row.ignore_groups),
    allow_groups: Boolean(row.allow_groups),
    media_transcription_enabled: Boolean(row.media_transcription_enabled),
    media_vision_enabled: Boolean(row.media_vision_enabled),
    document_extraction_enabled: Boolean(row.document_extraction_enabled),
    sandbox_mode: Boolean(row.sandbox_mode),
    event_settings: parseJson(row.event_settings, null),
    opt_out_keywords: parseJson(row.opt_out_keywords, ['stop', 'unsubscribe']),
  };
}

function inflateLog(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateMessage(row: any) {
  if (!row) return null;
  const message = {
    ...row,
    from_me: Boolean(row.from_me),
    raw_payload: parseJson(row.raw_payload, null),
    metadata: parseJson(row.metadata, null),
  } as any;
  if (row.media_asset_id || row.media_public_url || row.media_storage_key) {
    message.media = {
      id: row.media_asset_id,
      media_type: row.media_asset_type || null,
      mime_type: row.media_mime_type || null,
      file_name: row.media_file_name || null,
      public_url: row.media_public_url || null,
      storage_provider: row.media_storage_provider || null,
      storage_key: row.media_storage_key || null,
      transcription: row.media_transcription || null,
      analysis: row.media_analysis || null,
      extracted_text: row.media_extracted_text || null,
      metadata: parseJson(row.media_metadata, null),
    };
  }
  delete message.media_asset_type;
  delete message.media_mime_type;
  delete message.media_file_name;
  delete message.media_public_url;
  delete message.media_storage_provider;
  delete message.media_storage_key;
  delete message.media_transcription;
  delete message.media_analysis;
  delete message.media_extracted_text;
  delete message.media_metadata;
  return message;
}

function inflateAiRun(row: any) {
  return row ? { ...row, response_payload: parseJson(row.response_payload, null) } : null;
}

function inflateOutbound(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateWorkerCommand(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateWebhookDelivery(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateContact(row: any) {
  return row ? {
    ...row,
    opted_out: Boolean(row.opted_out),
    metadata: parseJson(row.metadata, null),
    tags: parseJson(row.tags, []),
  } : null;
}

function inflateTemplate(row: any) {
  return row ? {
    ...row,
    active: Boolean(row.active),
    variables: parseJson(row.variables, []),
  } : null;
}

function inflateAutoReplyRule(row: any) {
  return row ? {
    ...row,
    enabled: Boolean(row.enabled),
    response_payload: parseJson(row.response_payload, {}),
  } : null;
}

function inflateApiKey(row: any) {
  return row ? {
    ...row,
    scopes: parseJson(row.scopes, []),
    ip_allowlist: parseJson(row.ip_allowlist, []),
  } : null;
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === columnName)) return;
  try {
    sqlite.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
  } catch (err: any) {
    if (!String(err.message || '').includes('duplicate column name')) {
      throw err;
    }
  }
}

export function initDb() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_instances (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      instance_name TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local_baileys',
      status TEXT NOT NULL DEFAULT 'created',
      phone_number TEXT,
      push_name TEXT,
      qr_base64 TEXT,
      qr_updated_at TEXT,
      last_connection_at TEXT,
      last_disconnection_at TEXT,
      logged_out_at TEXT,
      ai_enabled INTEGER NOT NULL DEFAULT 1,
      n8n_webhook_url TEXT,
      n8n_secret_encrypted TEXT,
      webhook_secret TEXT,
      agent_mode TEXT NOT NULL DEFAULT 'text_only',
      reject_calls INTEGER NOT NULL DEFAULT 1,
      ignore_groups INTEGER NOT NULL DEFAULT 1,
      allow_groups INTEGER NOT NULL DEFAULT 0,
      msg_call TEXT,
      event_settings TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      remote_jid TEXT NOT NULL,
      is_group INTEGER NOT NULL DEFAULT 0,
      display_name TEXT,
      last_message_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      remote_jid TEXT NOT NULL,
      whatsapp_message_id TEXT NOT NULL,
      from_me INTEGER NOT NULL DEFAULT 0,
      direction TEXT NOT NULL,
      message_type TEXT,
      text_content TEXT,
      caption TEXT,
      raw_payload TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(instance_id, whatsapp_message_id)
    );

    CREATE TABLE IF NOT EXISTS whatsapp_event_logs (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT,
      received_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbound_messages (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      conversation_id TEXT,
      remote_jid TEXT NOT NULL,
      reply_type TEXT,
      text_content TEXT,
      media_url TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_runs (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      message_id TEXT,
      n8n_url TEXT,
      status TEXT NOT NULL,
      response_payload TEXT,
      error_message TEXT,
      duration_ms INTEGER,
      started_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS media_assets (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      message_id TEXT,
      media_type TEXT,
      mime_type TEXT,
      file_name TEXT,
      storage_path TEXT,
      public_url TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS baileys_auth_creds (
      instance_id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS baileys_auth_keys (
      instance_id TEXT NOT NULL,
      key_type TEXT NOT NULL,
      key_id TEXT NOT NULL,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (instance_id, key_type, key_id)
    );

    CREATE TABLE IF NOT EXISTS worker_commands (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      command TEXT NOT NULL,
      payload TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      target_url TEXT NOT NULL,
      payload TEXT NOT NULL,
      authorization TEXT,
      signature_secret TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 8,
      next_attempt_at TEXT NOT NULL,
      response_status INTEGER,
      error_message TEXT,
      delivered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      plan TEXT NOT NULL DEFAULT 'self_hosted',
      monthly_message_limit INTEGER,
      rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
      ip_allowlist TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(organization_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS user_api_keys (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT,
      instance_id TEXT,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      key_prefix TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'developer',
      scopes TEXT,
      ip_allowlist TEXT,
      last_used_at TEXT,
      expires_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS usage_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      user_id TEXT,
      instance_id TEXT,
      api_key_id TEXT,
      event_type TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      organization_id TEXT,
      user_id TEXT,
      instance_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      remote_jid TEXT NOT NULL,
      phone_number TEXT,
      display_name TEXT,
      email TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_user_id TEXT,
      opted_out INTEGER NOT NULL DEFAULT 0,
      opted_out_at TEXT,
      notes TEXT,
      metadata TEXT,
      last_message_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(instance_id, remote_jid)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#2563eb',
      created_at TEXT NOT NULL,
      UNIQUE(organization_id, name)
    );

    CREATE TABLE IF NOT EXISTS contact_tags (
      contact_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (contact_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS message_templates (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      instance_id TEXT,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      content TEXT NOT NULL,
      variables TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auto_reply_rules (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      name TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 100,
      match_type TEXT NOT NULL DEFAULT 'contains',
      match_value TEXT NOT NULL,
      response_type TEXT NOT NULL DEFAULT 'text',
      response_payload TEXT NOT NULL,
      cooldown_seconds INTEGER NOT NULL DEFAULT 0,
      last_triggered_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_memories (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      contact_key TEXT NOT NULL,
      summary TEXT,
      facts TEXT,
      messages TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(instance_id, contact_key)
    );

    CREATE TABLE IF NOT EXISTS instance_health_samples (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      reconnect_attempts INTEGER NOT NULL DEFAULT 0,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS connection_events (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_instances_created ON whatsapp_instances(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_instance_last ON conversations(instance_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_instance_received ON whatsapp_event_logs(instance_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_history ON messages(instance_id, remote_jid, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_outbound_status_created ON outbound_messages(status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_auth_keys_instance ON baileys_auth_keys(instance_id);
    CREATE INDEX IF NOT EXISTS idx_worker_commands_pending ON worker_commands(status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(status, next_attempt_at ASC);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_instance_created ON webhook_deliveries(instance_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_usage_org_created ON usage_events(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_logs(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contacts_instance_activity ON contacts(instance_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_templates_org_instance ON message_templates(organization_id, instance_id);
    CREATE INDEX IF NOT EXISTS idx_rules_instance_priority ON auto_reply_rules(instance_id, enabled, priority ASC);
    CREATE INDEX IF NOT EXISTS idx_health_instance_recorded ON instance_health_samples(instance_id, recorded_at DESC);
  `);

  ensureColumn('whatsapp_instances', 'organization_id', "TEXT NOT NULL DEFAULT 'org_default'");
  ensureColumn('whatsapp_instances', 'api_key_hash', 'TEXT');
  ensureColumn('whatsapp_instances', 'api_key_prefix', 'TEXT');
  ensureColumn('whatsapp_instances', 'ai_provider', "TEXT NOT NULL DEFAULT 'webhook'");
  ensureColumn('whatsapp_instances', 'ai_model', 'TEXT');
  ensureColumn('whatsapp_instances', 'ai_api_key_encrypted', 'TEXT');
  ensureColumn('whatsapp_instances', 'ai_system_prompt', 'TEXT');
  ensureColumn('whatsapp_instances', 'ai_auto_reply', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('whatsapp_instances', 'ai_memory_messages', 'INTEGER NOT NULL DEFAULT 20');
  ensureColumn('whatsapp_instances', 'media_transcription_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('whatsapp_instances', 'media_vision_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('whatsapp_instances', 'document_extraction_enabled', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('whatsapp_instances', 'storage_provider', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn('whatsapp_instances', 'sandbox_mode', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('whatsapp_instances', 'outbound_per_minute', 'INTEGER NOT NULL DEFAULT 30');
  ensureColumn('whatsapp_instances', 'opt_out_keywords', 'TEXT');
  ensureColumn('whatsapp_instances', 'last_health_at', 'TEXT');
  ensureColumn('whatsapp_instances', 'last_health_latency_ms', 'INTEGER');
  ensureColumn('whatsapp_instances', 'uptime_started_at', 'TEXT');
  ensureColumn('users', 'password_hash', 'TEXT');
  ensureColumn('outbound_messages', 'media_type', 'TEXT');
  ensureColumn('outbound_messages', 'mime_type', 'TEXT');
  ensureColumn('outbound_messages', 'quoted_message_id', 'TEXT');
  ensureColumn('outbound_messages', 'payload', 'TEXT');
  ensureColumn('outbound_messages', 'attempts', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('outbound_messages', 'max_attempts', 'INTEGER NOT NULL DEFAULT 5');
  ensureColumn('outbound_messages', 'next_attempt_at', 'TEXT');
  ensureColumn('outbound_messages', 'error_message', 'TEXT');
  ensureColumn('outbound_messages', 'sent_at', 'TEXT');
  ensureColumn('outbound_messages', 'updated_at', 'TEXT');
  ensureColumn('outbound_messages', 'api_key_id', 'TEXT');
  ensureColumn('outbound_messages', 'organization_id', 'TEXT');
  ensureColumn('outbound_messages', 'simulated', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('conversations', 'contact_id', 'TEXT');
  ensureColumn('conversations', 'assigned_user_id', 'TEXT');
  ensureColumn('conversations', 'status', "TEXT NOT NULL DEFAULT 'open'");
  ensureColumn('conversations', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
  ensureColumn('conversations', 'unread_count', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('conversations', 'last_inbound_at', 'TEXT');
  ensureColumn('conversations', 'last_outbound_at', 'TEXT');
  ensureColumn('messages', 'media_asset_id', 'TEXT');
  ensureColumn('messages', 'metadata', 'TEXT');
  ensureColumn('ai_runs', 'provider', 'TEXT');
  ensureColumn('ai_runs', 'model', 'TEXT');
  ensureColumn('ai_runs', 'prompt_tokens', 'INTEGER');
  ensureColumn('ai_runs', 'completion_tokens', 'INTEGER');
  ensureColumn('ai_runs', 'cost_micros', 'INTEGER');
  ensureColumn('media_assets', 'storage_provider', "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn('media_assets', 'storage_key', 'TEXT');
  ensureColumn('media_assets', 'transcription', 'TEXT');
  ensureColumn('media_assets', 'analysis', 'TEXT');
  ensureColumn('media_assets', 'extracted_text', 'TEXT');
  ensureColumn('media_assets', 'metadata', 'TEXT');
  ensureColumn('webhook_deliveries', 'response_body', 'TEXT');
  ensureColumn('webhook_deliveries', 'latency_ms', 'INTEGER');
  ensureColumn('webhook_deliveries', 'last_attempt_at', 'TEXT');
  ensureColumn('webhook_deliveries', 'dead_letter_at', 'TEXT');
  ensureColumn('webhook_deliveries', 'replayed_from_id', 'TEXT');

  const bootstrapTs = now();
  sqlite.prepare(`
    INSERT OR IGNORE INTO organizations (
      id, name, slug, plan, rate_limit_per_minute, created_at, updated_at
    ) VALUES ('org_default', ?, 'default', 'self_hosted', 120, ?, ?)
  `).run(process.env.DEFAULT_ORGANIZATION_NAME || 'Default Organization', bootstrapTs, bootstrapTs);
  sqlite.prepare(`
    INSERT OR IGNORE INTO users (id, email, name, status, created_at, updated_at)
    VALUES ('user_admin', ?, ?, 'active', ?, ?)
  `).run(
    process.env.ADMIN_EMAIL || 'admin@localhost',
    process.env.ADMIN_NAME || 'Administrator',
    bootstrapTs,
    bootstrapTs,
  );
  sqlite.prepare(`
    INSERT OR IGNORE INTO organization_members (
      id, organization_id, user_id, role, created_at, updated_at
    ) VALUES ('membership_admin', 'org_default', 'user_admin', 'admin', ?, ?)
  `).run(bootstrapTs, bootstrapTs);
  sqlite.prepare(`
    UPDATE whatsapp_instances
    SET organization_id = COALESCE(NULLIF(organization_id, ''), 'org_default')
  `).run();

  const ts = now();
  sqlite.prepare(`
    UPDATE outbound_messages
    SET status = 'pending', next_attempt_at = ?, error_message = COALESCE(error_message, 'Recovered after worker restart')
    WHERE status = 'sending'
  `).run(ts);
  sqlite.prepare(`
    UPDATE outbound_messages
    SET next_attempt_at = COALESCE(next_attempt_at, created_at, ?), updated_at = COALESCE(updated_at, created_at, ?)
  `).run(ts, ts);
  sqlite.prepare(`
    UPDATE worker_commands
    SET status = 'pending', error_message = COALESCE(error_message, 'Recovered after worker restart'), updated_at = ?
    WHERE status = 'processing'
  `).run(ts);
  sqlite.prepare(`
    UPDATE webhook_deliveries
    SET status = 'retry', next_attempt_at = ?, error_message = COALESCE(error_message, 'Recovered after worker restart'), updated_at = ?
    WHERE status = 'sending'
  `).run(ts, ts);
}

initDb();

export const sqliteAdapter = {
  getOrganization(organizationId = 'org_default') {
    const row = sqlite.prepare('SELECT * FROM organizations WHERE id = ?').get(organizationId) as any;
    return row ? {
      ...row,
      ip_allowlist: parseJson(row.ip_allowlist, []),
    } : null;
  },

  now,

  listInstances(organizationId?: string) {
    const rows = organizationId
      ? sqlite.prepare(`
          SELECT * FROM whatsapp_instances
          WHERE organization_id = ?
          ORDER BY created_at DESC
        `).all(organizationId)
      : sqlite.prepare('SELECT * FROM whatsapp_instances ORDER BY created_at DESC').all();
    return rows.map(inflateInstance);
  },

  listStartableInstances(statuses: string[]) {
    const placeholders = statuses.map(() => '?').join(', ');
    return sqlite.prepare(`SELECT * FROM whatsapp_instances WHERE status IN (${placeholders})`).all(...statuses).map(inflateInstance);
  },

  getInstance(instanceId: string, organizationId?: string) {
    return inflateInstance(
      organizationId
        ? sqlite.prepare(`
            SELECT * FROM whatsapp_instances WHERE id = ? AND organization_id = ?
          `).get(instanceId, organizationId)
        : sqlite.prepare('SELECT * FROM whatsapp_instances WHERE id = ?').get(instanceId),
    );
  },

  getInstanceByIdentifier(identifier: string, organizationId?: string) {
    return inflateInstance(
      organizationId
        ? sqlite.prepare(`
            SELECT * FROM whatsapp_instances
            WHERE organization_id = ? AND (id = ? OR instance_name = ?)
            LIMIT 1
          `).get(organizationId, identifier, identifier)
        : sqlite.prepare(`
            SELECT * FROM whatsapp_instances
            WHERE id = ? OR instance_name = ?
            LIMIT 1
          `).get(identifier, identifier),
    );
  },

  createInstance(data: Record<string, any>) {
    const instanceId = data.id || id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO whatsapp_instances (
        id, organization_id, client_id, instance_name, provider, status, ai_enabled, agent_mode,
        reject_calls, ignore_groups, allow_groups, msg_call, event_settings,
        webhook_secret, api_key_hash, api_key_prefix, ai_provider, ai_model,
        ai_system_prompt, ai_auto_reply, ai_memory_messages, media_transcription_enabled,
        media_vision_enabled, document_extraction_enabled, storage_provider, sandbox_mode,
        outbound_per_minute, opt_out_keywords, created_at, updated_at
      ) VALUES (
        @id, @organization_id, @client_id, @instance_name, @provider, @status, @ai_enabled, @agent_mode,
        @reject_calls, @ignore_groups, @allow_groups, @msg_call, @event_settings,
        @webhook_secret, @api_key_hash, @api_key_prefix, @ai_provider, @ai_model,
        @ai_system_prompt, @ai_auto_reply, @ai_memory_messages, @media_transcription_enabled,
        @media_vision_enabled, @document_extraction_enabled, @storage_provider, @sandbox_mode,
        @outbound_per_minute, @opt_out_keywords, @created_at, @updated_at
      )
    `).run({
      id: instanceId,
      organization_id: data.organization_id || 'org_default',
      client_id: data.client_id || null,
      instance_name: data.instance_name,
      provider: data.provider || 'local_baileys',
      status: data.status || 'created',
      ai_enabled: data.ai_enabled === false ? 0 : 1,
      agent_mode: data.agent_mode || 'text_only',
      reject_calls: data.reject_calls === false ? 0 : 1,
      ignore_groups: data.ignore_groups === false ? 0 : 1,
      allow_groups: data.allow_groups ? 1 : 0,
      msg_call: data.msg_call || null,
      event_settings: json(data.event_settings),
      webhook_secret: data.webhook_secret || crypto.randomBytes(32).toString('hex'),
      api_key_hash: data.api_key_hash || null,
      api_key_prefix: data.api_key_prefix || null,
      ai_provider: data.ai_provider || 'webhook',
      ai_model: data.ai_model || null,
      ai_system_prompt: data.ai_system_prompt || null,
      ai_auto_reply: data.ai_auto_reply === false ? 0 : 1,
      ai_memory_messages: Number(data.ai_memory_messages || 20),
      media_transcription_enabled: data.media_transcription_enabled ? 1 : 0,
      media_vision_enabled: data.media_vision_enabled ? 1 : 0,
      document_extraction_enabled: data.document_extraction_enabled ? 1 : 0,
      storage_provider: data.storage_provider || 'local',
      sandbox_mode: data.sandbox_mode ? 1 : 0,
      outbound_per_minute: Number(data.outbound_per_minute || 30),
      opt_out_keywords: json(data.opt_out_keywords || ['stop', 'unsubscribe']),
      created_at: data.created_at || ts,
      updated_at: data.updated_at || ts,
    });
    return instanceId;
  },

  updateInstance(instanceId: string, patch: Record<string, any>) {
    const allowed = [
      'organization_id', 'client_id', 'instance_name', 'provider', 'status', 'phone_number', 'push_name',
      'qr_base64', 'qr_updated_at', 'last_connection_at', 'last_disconnection_at',
      'logged_out_at', 'ai_enabled', 'n8n_webhook_url', 'n8n_secret_encrypted',
      'webhook_secret', 'agent_mode', 'reject_calls', 'ignore_groups', 'allow_groups',
      'msg_call', 'event_settings', 'api_key_hash', 'api_key_prefix',
      'ai_provider', 'ai_model', 'ai_api_key_encrypted', 'ai_system_prompt',
      'ai_auto_reply', 'ai_memory_messages', 'media_transcription_enabled',
      'media_vision_enabled', 'document_extraction_enabled', 'storage_provider',
      'sandbox_mode', 'outbound_per_minute', 'opt_out_keywords', 'last_health_at',
      'last_health_latency_ms', 'uptime_started_at',
    ];
    const normalized: Record<string, any> = {};
    for (const key of allowed) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if ([
        'ai_enabled', 'ai_auto_reply', 'reject_calls', 'ignore_groups', 'allow_groups',
        'media_transcription_enabled', 'media_vision_enabled',
        'document_extraction_enabled', 'sandbox_mode',
      ].includes(key)) {
        normalized[key] = value ? 1 : 0;
      } else if (key === 'event_settings' || key === 'opt_out_keywords') {
        normalized[key] = json(value);
      } else {
        normalized[key] = value ?? null;
      }
    }
    normalized.updated_at = now();
    const keys = Object.keys(normalized);
    if (!keys.length) return;
    sqlite.prepare(`UPDATE whatsapp_instances SET ${keys.map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`).run({
      ...normalized,
      id: instanceId,
    });
  },

  deleteInstance(instanceId: string, organizationId?: string) {
    return sqlite.transaction(() => {
      const owned = organizationId
        ? sqlite.prepare(`
            SELECT id FROM whatsapp_instances WHERE id = ? AND organization_id = ?
          `).get(instanceId, organizationId)
        : sqlite.prepare('SELECT id FROM whatsapp_instances WHERE id = ?').get(instanceId);
      if (!owned) return false;

      sqlite.prepare(`
        DELETE FROM contact_tags
        WHERE contact_id IN (SELECT id FROM contacts WHERE instance_id = ?)
      `).run(instanceId);

      const instanceTables = [
        'messages',
        'conversations',
        'whatsapp_event_logs',
        'outbound_messages',
        'ai_runs',
        'media_assets',
        'baileys_auth_creds',
        'baileys_auth_keys',
        'worker_commands',
        'webhook_deliveries',
        'user_api_keys',
        'usage_events',
        'audit_logs',
        'contacts',
        'message_templates',
        'auto_reply_rules',
        'agent_memories',
        'instance_health_samples',
        'connection_events',
      ];
      for (const table of instanceTables) {
        sqlite.prepare(`DELETE FROM ${table} WHERE instance_id = ?`).run(instanceId);
      }
      sqlite.prepare('DELETE FROM whatsapp_instances WHERE id = ?').run(instanceId);
      return true;
    })();
  },

  addEventLog(instanceId: string, eventType: string, payload: unknown) {
    sqlite.prepare('INSERT INTO whatsapp_event_logs (id, instance_id, event_type, payload, received_at) VALUES (?, ?, ?, ?, ?)')
      .run(id(), instanceId, eventType, json(payload), now());
  },

  listEventLogs(instanceId: string, limit = 50) {
    return sqlite.prepare('SELECT * FROM whatsapp_event_logs WHERE instance_id = ? ORDER BY received_at DESC LIMIT ?')
      .all(instanceId, limit)
      .map(inflateLog);
  },

  listAiRuns(instanceId: string, limit = 25) {
    return sqlite.prepare('SELECT * FROM ai_runs WHERE instance_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(instanceId, limit)
      .map(inflateAiRun);
  },

  upsertConversation(data: Record<string, any>) {
    const ts = now();
    const direction = data.direction || 'inbound';
    sqlite.prepare(`
      INSERT INTO conversations (
        id, instance_id, remote_jid, is_group, display_name, last_message_at,
        last_inbound_at, last_outbound_at, unread_count, created_at, updated_at
      )
      VALUES (
        @id, @instance_id, @remote_jid, @is_group, @display_name, @last_message_at,
        @last_inbound_at, @last_outbound_at, @unread_count, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        is_group = excluded.is_group,
        last_message_at = excluded.last_message_at,
        last_inbound_at = CASE
          WHEN @direction = 'inbound' THEN excluded.last_message_at
          ELSE conversations.last_inbound_at
        END,
        last_outbound_at = CASE
          WHEN @direction = 'outbound' THEN excluded.last_message_at
          ELSE conversations.last_outbound_at
        END,
        unread_count = CASE
          WHEN @direction = 'inbound' THEN conversations.unread_count + 1
          ELSE conversations.unread_count
        END,
        updated_at = excluded.updated_at
    `).run({
      id: data.id,
      instance_id: data.instance_id,
      remote_jid: data.remote_jid,
      is_group: data.is_group ? 1 : 0,
      display_name: data.display_name || null,
      last_message_at: data.last_message_at || ts,
      direction,
      last_inbound_at: direction === 'inbound' ? (data.last_message_at || ts) : null,
      last_outbound_at: direction === 'outbound' ? (data.last_message_at || ts) : null,
      unread_count: direction === 'inbound' ? 1 : 0,
      created_at: data.created_at || ts,
      updated_at: ts,
    });
  },

  listConversations(instanceId: string, limit = 50) {
    return sqlite.prepare('SELECT * FROM conversations WHERE instance_id = ? ORDER BY last_message_at DESC LIMIT ?')
      .all(instanceId, limit)
      .map((row: any) => ({ ...row, is_group: Boolean(row.is_group) }));
  },

  getInstanceStats(instanceId: string) {
    const conversations = sqlite.prepare('SELECT COUNT(*) as count FROM conversations WHERE instance_id = ?').get(instanceId) as any;
    const messages = sqlite.prepare('SELECT COUNT(*) as count FROM messages WHERE instance_id = ?').get(instanceId) as any;
    const failedAi = sqlite.prepare("SELECT COUNT(*) as count FROM ai_runs WHERE instance_id = ? AND status = 'error'").get(instanceId) as any;
    const latestMessage = sqlite.prepare('SELECT * FROM messages WHERE instance_id = ? ORDER BY created_at DESC LIMIT 1').get(instanceId);
    const latestLog = sqlite.prepare('SELECT * FROM whatsapp_event_logs WHERE instance_id = ? ORDER BY received_at DESC LIMIT 1').get(instanceId);

    return {
      conversations: conversations?.count || 0,
      messages: messages?.count || 0,
      failed_ai_runs: failedAi?.count || 0,
      latest_message: inflateMessage(latestMessage),
      latest_log: inflateLog(latestLog),
    };
  },

  messageExists(instanceId: string, whatsappMessageId: string) {
    const row = sqlite.prepare('SELECT id FROM messages WHERE instance_id = ? AND whatsapp_message_id = ? LIMIT 1').get(instanceId, whatsappMessageId);
    return Boolean(row);
  },

  addMessage(data: Record<string, any>) {
    const messageId = data.id || id();
    sqlite.prepare(`
      INSERT OR IGNORE INTO messages (
        id, instance_id, conversation_id, remote_jid, whatsapp_message_id, from_me,
        direction, message_type, text_content, caption, raw_payload, metadata, created_at
      ) VALUES (
        @id, @instance_id, @conversation_id, @remote_jid, @whatsapp_message_id, @from_me,
        @direction, @message_type, @text_content, @caption, @raw_payload, @metadata, @created_at
      )
    `).run({
      id: messageId,
      instance_id: data.instance_id,
      conversation_id: data.conversation_id,
      remote_jid: data.remote_jid,
      whatsapp_message_id: data.whatsapp_message_id,
      from_me: data.from_me ? 1 : 0,
      direction: data.direction,
      message_type: data.message_type || null,
      text_content: data.text_content || null,
      caption: data.caption || null,
      raw_payload: json(data.raw_payload),
      metadata: json(data.metadata),
      created_at: data.created_at || now(),
    });
    return messageId;
  },

  getRecentMessages(instanceId: string, remoteJid: string, limit = 10) {
    return sqlite.prepare('SELECT * FROM messages WHERE instance_id = ? AND remote_jid = ? ORDER BY created_at DESC LIMIT ?')
      .all(instanceId, remoteJid, limit)
      .map(inflateMessage);
  },

  addMediaAsset(data: Record<string, any>) {
    const assetId = data.id || id();
    sqlite.prepare(`
      INSERT INTO media_assets (
        id, instance_id, message_id, media_type, mime_type, file_name, storage_path,
        public_url, storage_provider, storage_key, transcription, analysis,
        extracted_text, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      assetId,
      data.instance_id,
      data.message_id || null,
      data.media_type || null,
      data.mime_type || null,
      data.file_name || null,
      data.storage_path || null,
      data.public_url || null,
      data.storage_provider || 'local',
      data.storage_key || null,
      data.transcription || null,
      data.analysis || null,
      data.extracted_text || null,
      json(data.metadata),
      now(),
    );
    return assetId;
  },

  updateMediaAsset(assetId: string, patch: Record<string, any>) {
    const allowed = [
      'storage_path', 'public_url', 'storage_provider', 'storage_key',
      'transcription', 'analysis', 'extracted_text', 'metadata',
    ];
    const normalized: Record<string, any> = {};
    for (const key of allowed) {
      if (!(key in patch)) continue;
      normalized[key] = key === 'metadata' ? json(patch[key]) : patch[key];
    }
    const keys = Object.keys(normalized);
    if (!keys.length) return;
    sqlite.prepare(`UPDATE media_assets SET ${keys.map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`)
      .run({ ...normalized, id: assetId });
  },

  linkMessageMediaAsset(messageId: string, assetId: string) {
    sqlite.prepare('UPDATE messages SET media_asset_id = ? WHERE id = ?').run(assetId, messageId);
  },

  addOutboundMessage(data: Record<string, any>) {
    const ts = now();
    sqlite.prepare(`
      INSERT INTO outbound_messages (
        id, instance_id, conversation_id, remote_jid, reply_type, text_content,
        media_url, media_type, mime_type, quoted_message_id, payload, status,
        attempts, max_attempts, next_attempt_at, error_message, sent_at, created_at,
        updated_at, api_key_id, organization_id, simulated
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.id || id(),
      data.instance_id,
      data.conversation_id || null,
      data.remote_jid,
      data.reply_type || data.type || null,
      data.text_content || data.text || null,
      data.media_url || data.mediaUrl || null,
      data.media_type || data.mediaType || null,
      data.mime_type || data.mimeType || null,
      data.quoted_message_id || data.quotedMessageId || null,
      json(data.payload),
      data.status || 'sent',
      data.attempts || 0,
      data.max_attempts || 5,
      data.next_attempt_at || ts,
      data.error_message || null,
      data.sent_at || ((data.status || 'sent') === 'sent' ? ts : null),
      data.created_at || ts,
      ts,
      data.api_key_id || null,
      data.organization_id || null,
      data.simulated ? 1 : 0,
    );
  },

  enqueueOutboundMessage(data: Record<string, any>) {
    const outboundId = data.id || id();
    this.addOutboundMessage({
      ...data,
      id: outboundId,
      status: 'pending',
      sent_at: null,
    });
    return outboundId;
  },

  listPendingOutboundMessages(limit = 20) {
    return sqlite.prepare(`
      SELECT * FROM outbound_messages
      WHERE status IN ('pending', 'retry')
        AND COALESCE(next_attempt_at, created_at) <= ?
      ORDER BY COALESCE(next_attempt_at, created_at) ASC
      LIMIT ?
    `).all(now(), limit).map(inflateOutbound);
  },

  getOutboundMessage(outboundId: string) {
    return inflateOutbound(sqlite.prepare('SELECT * FROM outbound_messages WHERE id = ?').get(outboundId));
  },

  listOutboundMessages(instanceId: string, limit = 100) {
    return sqlite.prepare(`
      SELECT * FROM outbound_messages
      WHERE instance_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(instanceId, limit).map(inflateOutbound);
  },

  countRecentOutbound(instanceId: string, remoteJid: string, since: string) {
    const row = sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM outbound_messages
      WHERE instance_id = ? AND remote_jid = ? AND created_at >= ?
        AND status IN ('pending', 'retry', 'sending', 'sent')
    `).get(instanceId, remoteJid, since) as { count: number };
    return row.count;
  },

  listExpiredMediaAssets(cutoff: string, limit = 100) {
    return sqlite.prepare(`
      SELECT id, storage_path, storage_provider, storage_key FROM media_assets
      WHERE created_at < ? AND (storage_path IS NOT NULL OR storage_key IS NOT NULL)
      ORDER BY created_at ASC
      LIMIT ?
    `).all(cutoff, limit) as Array<{
      id: string;
      storage_path: string | null;
      storage_provider: string;
      storage_key: string | null;
    }>;
  },

  listInstanceMediaAssets(instanceId: string) {
    return sqlite.prepare(`
      SELECT id, storage_path, storage_provider, storage_key
      FROM media_assets
      WHERE instance_id = ? AND (storage_path IS NOT NULL OR storage_key IS NOT NULL)
      ORDER BY created_at ASC
    `).all(instanceId) as Array<{
      id: string;
      storage_path: string | null;
      storage_provider: string;
      storage_key: string | null;
    }>;
  },

  deleteMediaAssets(assetIds: string[]) {
    if (!assetIds.length) return;
    const placeholders = assetIds.map(() => '?').join(', ');
    sqlite.prepare(`DELETE FROM media_assets WHERE id IN (${placeholders})`).run(...assetIds);
  },

  purgeOperationalRecords(cutoff: string) {
    sqlite.transaction(() => {
      sqlite.prepare("DELETE FROM webhook_deliveries WHERE status IN ('delivered', 'failed') AND updated_at < ?").run(cutoff);
      sqlite.prepare("DELETE FROM worker_commands WHERE status IN ('completed', 'failed') AND updated_at < ?").run(cutoff);
      sqlite.prepare("DELETE FROM outbound_messages WHERE status IN ('sent', 'failed') AND updated_at < ?").run(cutoff);
      sqlite.prepare('DELETE FROM whatsapp_event_logs WHERE received_at < ?').run(cutoff);
      sqlite.prepare('DELETE FROM ai_runs WHERE started_at < ?').run(cutoff);
    })();
  },

  getQueueStats() {
    const outbound = sqlite.prepare(`
      SELECT status, COUNT(*) AS count FROM outbound_messages GROUP BY status
    `).all() as Array<{ status: string; count: number }>;
    const webhooks = sqlite.prepare(`
      SELECT status, COUNT(*) AS count FROM webhook_deliveries GROUP BY status
    `).all() as Array<{ status: string; count: number }>;
    const commands = sqlite.prepare(`
      SELECT status, COUNT(*) AS count FROM worker_commands GROUP BY status
    `).all() as Array<{ status: string; count: number }>;

    return {
      outbound: Object.fromEntries(outbound.map((row) => [row.status, row.count])),
      webhooks: Object.fromEntries(webhooks.map((row) => [row.status, row.count])),
      commands: Object.fromEntries(commands.map((row) => [row.status, row.count])),
    };
  },

  getOperationalStats() {
    const messages24h = sqlite.prepare(`
      SELECT COUNT(*) AS count FROM messages WHERE created_at >= ?
    `).get(new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()) as { count: number };
    const webhookLatency = sqlite.prepare(`
      SELECT AVG(latency_ms) AS average, MAX(latency_ms) AS maximum
      FROM webhook_deliveries
      WHERE latency_ms IS NOT NULL AND created_at >= ?
    `).get(new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()) as {
      average: number | null;
      maximum: number | null;
    };
    const aiLatency = sqlite.prepare(`
      SELECT AVG(duration_ms) AS average, MAX(duration_ms) AS maximum
      FROM ai_runs
      WHERE duration_ms IS NOT NULL AND started_at >= ?
    `).get(new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()) as {
      average: number | null;
      maximum: number | null;
    };
    return {
      messages_24h: messages24h.count,
      webhook_latency_average_ms: Math.round(webhookLatency.average || 0),
      webhook_latency_max_ms: webhookLatency.maximum || 0,
      ai_latency_average_ms: Math.round(aiLatency.average || 0),
      ai_latency_max_ms: aiLatency.maximum || 0,
    };
  },

  markOutboundMessageSending(outboundId: string) {
    const result = sqlite.prepare(`
      UPDATE outbound_messages
      SET status = 'sending', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'retry')
    `).run(now(), outboundId);
    return result.changes === 1;
  },

  markOutboundMessageSent(outboundId: string) {
    const ts = now();
    sqlite.prepare(`
      UPDATE outbound_messages
      SET status = 'sent', sent_at = ?, updated_at = ?, error_message = NULL
      WHERE id = ?
    `).run(ts, ts, outboundId);
  },

  markOutboundMessageSimulated(outboundId: string) {
    const ts = now();
    sqlite.prepare(`
      UPDATE outbound_messages
      SET status = 'sent', simulated = 1, sent_at = ?, updated_at = ?,
          error_message = NULL
      WHERE id = ?
    `).run(ts, ts, outboundId);
  },

  markOutboundMessageFailed(outboundId: string, errorMessage: string) {
    const row = sqlite.prepare('SELECT attempts, max_attempts FROM outbound_messages WHERE id = ?').get(outboundId) as {
      attempts: number;
      max_attempts: number;
    } | undefined;
    if (!row) return;

    const exhausted = row.attempts >= row.max_attempts;
    const delayMs = Math.min(300_000, 2 ** Math.max(0, row.attempts - 1) * 5_000);
    const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

    sqlite.prepare(`
      UPDATE outbound_messages
      SET status = ?, next_attempt_at = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(exhausted ? 'failed' : 'retry', nextAttemptAt, errorMessage, now(), outboundId);
  },

  getAuthCreds(instanceId: string) {
    const row = sqlite.prepare('SELECT data FROM baileys_auth_creds WHERE instance_id = ?').get(instanceId) as { data: string } | undefined;
    return row?.data || null;
  },

  saveAuthCreds(instanceId: string, data: string) {
    sqlite.prepare(`
      INSERT INTO baileys_auth_creds (instance_id, data, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(instance_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(instanceId, data, now());
  },

  getAuthKeys(instanceId: string, keyType: string, keyIds: string[]) {
    if (!keyIds.length) return new Map<string, string>();
    const placeholders = keyIds.map(() => '?').join(', ');
    const rows = sqlite.prepare(`
      SELECT key_id, data FROM baileys_auth_keys
      WHERE instance_id = ? AND key_type = ? AND key_id IN (${placeholders})
    `).all(instanceId, keyType, ...keyIds) as Array<{ key_id: string; data: string }>;
    return new Map(rows.map((row) => [row.key_id, row.data]));
  },

  listAuthKeys(instanceId: string) {
    return sqlite.prepare(`
      SELECT key_type, key_id, data
      FROM baileys_auth_keys
      WHERE instance_id = ?
    `).all(instanceId) as Array<{
      key_type: string;
      key_id: string;
      data: string;
    }>;
  },

  saveAuthKey(instanceId: string, keyType: string, keyId: string, data: string | null) {
    if (data === null) {
      sqlite.prepare('DELETE FROM baileys_auth_keys WHERE instance_id = ? AND key_type = ? AND key_id = ?')
        .run(instanceId, keyType, keyId);
      return;
    }
    sqlite.prepare(`
      INSERT INTO baileys_auth_keys (instance_id, key_type, key_id, data, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(instance_id, key_type, key_id)
      DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `).run(instanceId, keyType, keyId, data, now());
  },

  saveAuthKeys(instanceId: string, entries: Array<{ keyType: string; keyId: string; data: string | null }>) {
    const upsert = sqlite.prepare(`
      INSERT INTO baileys_auth_keys (instance_id, key_type, key_id, data, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(instance_id, key_type, key_id)
      DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
    `);
    const remove = sqlite.prepare(
      'DELETE FROM baileys_auth_keys WHERE instance_id = ? AND key_type = ? AND key_id = ?',
    );

    sqlite.transaction(() => {
      const ts = now();
      for (const entry of entries) {
        if (entry.data === null) remove.run(instanceId, entry.keyType, entry.keyId);
        else upsert.run(instanceId, entry.keyType, entry.keyId, entry.data, ts);
      }
    })();
  },

  clearAuthState(instanceId: string) {
    sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM baileys_auth_keys WHERE instance_id = ?').run(instanceId);
      sqlite.prepare('DELETE FROM baileys_auth_creds WHERE instance_id = ?').run(instanceId);
    })();
  },

  enqueueWorkerCommand(instanceId: string, command: string, payload: unknown = null) {
    const existing = sqlite.prepare(`
      SELECT id FROM worker_commands
      WHERE instance_id = ? AND command = ? AND status IN ('pending', 'processing')
      ORDER BY created_at DESC LIMIT 1
    `).get(instanceId, command) as { id: string } | undefined;
    if (existing) return existing.id;

    const commandId = id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO worker_commands (
        id, instance_id, command, payload, status, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'pending', 0, ?, ?)
    `).run(commandId, instanceId, command, json(payload), ts, ts);
    return commandId;
  },

  listPendingWorkerCommands(limit = 20) {
    return sqlite.prepare(`
      SELECT * FROM worker_commands
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit).map(inflateWorkerCommand);
  },

  getWorkerCommand(commandId: string) {
    return inflateWorkerCommand(sqlite.prepare('SELECT * FROM worker_commands WHERE id = ?').get(commandId));
  },

  markWorkerCommandProcessing(commandId: string) {
    const result = sqlite.prepare(`
      UPDATE worker_commands
      SET status = 'processing', attempts = attempts + 1, started_at = ?, updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(now(), now(), commandId);
    return result.changes === 1;
  },

  completeWorkerCommand(commandId: string) {
    const ts = now();
    sqlite.prepare(`
      UPDATE worker_commands
      SET status = 'completed', completed_at = ?, updated_at = ?, error_message = NULL
      WHERE id = ?
    `).run(ts, ts, commandId);
  },

  failWorkerCommand(commandId: string, errorMessage: string) {
    sqlite.prepare(`
      UPDATE worker_commands
      SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'pending' END,
          error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(errorMessage, now(), commandId);
  },

  enqueueWebhookDelivery(data: Record<string, any>) {
    const deliveryId = data.id || id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO webhook_deliveries (
        id, instance_id, event_type, target_url, payload, authorization, signature_secret,
        status, attempts, max_attempts, next_attempt_at, replayed_from_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?)
    `).run(
      deliveryId,
      data.instance_id,
      data.event_type,
      data.target_url,
      json(data.payload),
      data.authorization || null,
      data.signature_secret || null,
      data.max_attempts || 8,
      data.next_attempt_at || ts,
      data.replayed_from_id || null,
      ts,
      ts,
    );
    return deliveryId;
  },

  listPendingWebhookDeliveries(limit = 20) {
    return sqlite.prepare(`
      SELECT * FROM webhook_deliveries
      WHERE status IN ('pending', 'retry') AND next_attempt_at <= ?
      ORDER BY next_attempt_at ASC
      LIMIT ?
    `).all(now(), limit).map(inflateWebhookDelivery);
  },

  getWebhookDelivery(deliveryId: string) {
    return inflateWebhookDelivery(sqlite.prepare('SELECT * FROM webhook_deliveries WHERE id = ?').get(deliveryId));
  },

  listWebhookDeliveries(instanceId?: string, limit = 100) {
    const rows = instanceId
      ? sqlite.prepare(`
          SELECT * FROM webhook_deliveries
          WHERE instance_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `).all(instanceId, limit)
      : sqlite.prepare(`
          SELECT * FROM webhook_deliveries
          ORDER BY created_at DESC
          LIMIT ?
        `).all(limit);
    return rows.map(inflateWebhookDelivery);
  },

  markWebhookDeliverySending(deliveryId: string) {
    const result = sqlite.prepare(`
      UPDATE webhook_deliveries
      SET status = 'sending', attempts = attempts + 1, last_attempt_at = ?, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'retry')
    `).run(now(), now(), deliveryId);
    return result.changes === 1;
  },

  markWebhookDeliveryDelivered(
    deliveryId: string,
    responseStatus: number,
    responseBody: string | null = null,
    latencyMs: number | null = null,
  ) {
    const ts = now();
    sqlite.prepare(`
      UPDATE webhook_deliveries
      SET status = 'delivered', response_status = ?, response_body = ?, latency_ms = ?,
          delivered_at = ?, updated_at = ?, error_message = NULL, dead_letter_at = NULL
      WHERE id = ?
    `).run(responseStatus, responseBody, latencyMs, ts, ts, deliveryId);
  },

  markWebhookDeliveryFailed(
    deliveryId: string,
    errorMessage: string,
    responseStatus?: number,
    responseBody: string | null = null,
    latencyMs: number | null = null,
  ) {
    const row = sqlite.prepare('SELECT attempts, max_attempts FROM webhook_deliveries WHERE id = ?').get(deliveryId) as {
      attempts: number;
      max_attempts: number;
    } | undefined;
    if (!row) return;

    const exhausted = row.attempts >= row.max_attempts;
    const delayMs = Math.min(900_000, 2 ** Math.max(0, row.attempts - 1) * 10_000);
    sqlite.prepare(`
      UPDATE webhook_deliveries
      SET status = ?, next_attempt_at = ?, response_status = ?, response_body = ?,
          latency_ms = ?, error_message = ?, dead_letter_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      exhausted ? 'failed' : 'retry',
      new Date(Date.now() + delayMs).toISOString(),
      responseStatus || null,
      responseBody,
      latencyMs,
      errorMessage,
      exhausted ? now() : null,
      now(),
      deliveryId,
    );
  },

  replayWebhookDelivery(deliveryId: string) {
    const source = this.getWebhookDelivery(deliveryId);
    if (!source) throw new Error('Webhook delivery not found');
    return this.enqueueWebhookDelivery({
      instance_id: source.instance_id,
      event_type: source.event_type,
      target_url: source.target_url,
      payload: source.payload,
      authorization: source.authorization,
      signature_secret: source.signature_secret,
      max_attempts: source.max_attempts,
      replayed_from_id: source.id,
    });
  },

  createAiRun(data: Record<string, any>) {
    const runId = id();
    sqlite.prepare(`
      INSERT INTO ai_runs (
        id, instance_id, message_id, n8n_url, provider, model, status, started_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      runId,
      data.instance_id,
      data.message_id || null,
      data.n8n_url || null,
      data.provider || null,
      data.model || null,
      data.status || 'processing',
      now(),
    );
    return runId;
  },

  updateAiRun(runId: string, patch: Record<string, any>) {
    const normalized: Record<string, any> = {};
    for (const [key, value] of Object.entries(patch)) {
      normalized[key] = key === 'response_payload' ? json(value) : value;
    }
    const keys = Object.keys(normalized);
    if (!keys.length) return;
    sqlite.prepare(`UPDATE ai_runs SET ${keys.map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`).run({
      ...normalized,
      id: runId,
    });
  },

  listMessages(instanceId: string, limit = 100, after?: string | null) {
    const rows = after
      ? sqlite.prepare(`
          SELECT
            m.*,
            ma.media_type AS media_asset_type,
            ma.mime_type AS media_mime_type,
            ma.file_name AS media_file_name,
            ma.public_url AS media_public_url,
            ma.storage_provider AS media_storage_provider,
            ma.storage_key AS media_storage_key,
            ma.transcription AS media_transcription,
            ma.analysis AS media_analysis,
            ma.extracted_text AS media_extracted_text,
            ma.metadata AS media_metadata
          FROM messages m
          LEFT JOIN media_assets ma ON ma.id = m.media_asset_id
          WHERE m.instance_id = ? AND m.created_at > ?
          ORDER BY m.created_at ASC
          LIMIT ?
        `).all(instanceId, after, limit)
      : sqlite.prepare(`
          SELECT
            m.*,
            ma.media_type AS media_asset_type,
            ma.mime_type AS media_mime_type,
            ma.file_name AS media_file_name,
            ma.public_url AS media_public_url,
            ma.storage_provider AS media_storage_provider,
            ma.storage_key AS media_storage_key,
            ma.transcription AS media_transcription,
            ma.analysis AS media_analysis,
            ma.extracted_text AS media_extracted_text,
            ma.metadata AS media_metadata
          FROM messages m
          LEFT JOIN media_assets ma ON ma.id = m.media_asset_id
          WHERE m.instance_id = ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `).all(instanceId, limit).reverse();
    return rows.map(inflateMessage);
  },

  upsertContact(data: Record<string, any>) {
    const contactId = data.id || id();
    const ts = data.last_message_at || now();
    sqlite.prepare(`
      INSERT INTO contacts (
        id, organization_id, instance_id, remote_jid, phone_number, display_name,
        status, metadata, last_message_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)
      ON CONFLICT(instance_id, remote_jid) DO UPDATE SET
        phone_number = COALESCE(excluded.phone_number, contacts.phone_number),
        display_name = COALESCE(excluded.display_name, contacts.display_name),
        metadata = COALESCE(excluded.metadata, contacts.metadata),
        last_message_at = excluded.last_message_at,
        updated_at = excluded.updated_at
    `).run(
      contactId,
      data.organization_id || 'org_default',
      data.instance_id,
      data.remote_jid,
      data.phone_number || null,
      data.display_name || null,
      json(data.metadata),
      ts,
      ts,
      ts,
    );
    const contact = sqlite.prepare(`
      SELECT * FROM contacts WHERE instance_id = ? AND remote_jid = ?
    `).get(data.instance_id, data.remote_jid) as { id: string };
    sqlite.prepare(`
      UPDATE conversations SET contact_id = ? WHERE instance_id = ? AND remote_jid = ?
    `).run(contact.id, data.instance_id, data.remote_jid);
    return contact.id;
  },

  getContactByRemoteJid(instanceId: string, remoteJid: string) {
    return inflateContact(sqlite.prepare(`
      SELECT * FROM contacts WHERE instance_id = ? AND remote_jid = ?
    `).get(instanceId, remoteJid));
  },

  listContacts(instanceId?: string, limit = 200, organizationId?: string) {
    const rows = instanceId
      ? sqlite.prepare(`
          SELECT * FROM contacts
          WHERE instance_id = ?
            AND (? IS NULL OR organization_id = ?)
          ORDER BY last_message_at DESC LIMIT ?
        `).all(instanceId, organizationId || null, organizationId || null, limit)
      : sqlite.prepare(`
          SELECT * FROM contacts
          WHERE (? IS NULL OR organization_id = ?)
          ORDER BY last_message_at DESC LIMIT ?
        `).all(organizationId || null, organizationId || null, limit);
    return rows.map((row: any) => {
      const tags = sqlite.prepare(`
        SELECT t.id, t.name, t.color
        FROM tags t
        INNER JOIN contact_tags ct ON ct.tag_id = t.id
        WHERE ct.contact_id = ?
        ORDER BY t.name
      `).all(row.id);
      return inflateContact({ ...row, tags: json(tags) });
    });
  },

  updateContact(contactId: string, patch: Record<string, any>) {
    const allowed = [
      'display_name', 'email', 'status', 'assigned_user_id', 'opted_out',
      'opted_out_at', 'notes', 'metadata',
    ];
    const normalized: Record<string, any> = {};
    for (const key of allowed) {
      if (!(key in patch)) continue;
      if (key === 'opted_out') normalized[key] = patch[key] ? 1 : 0;
      else if (key === 'metadata') normalized[key] = json(patch[key]);
      else normalized[key] = patch[key] ?? null;
    }
    if ('opted_out' in patch && !('opted_out_at' in patch)) {
      normalized.opted_out_at = patch.opted_out ? now() : null;
    }
    normalized.updated_at = now();
    const keys = Object.keys(normalized);
    sqlite.prepare(`UPDATE contacts SET ${keys.map((key) => `${key} = @${key}`).join(', ')} WHERE id = @id`)
      .run({ ...normalized, id: contactId });
    if ('assigned_user_id' in normalized || 'status' in normalized) {
      const contact = sqlite.prepare('SELECT instance_id, remote_jid FROM contacts WHERE id = ?')
        .get(contactId) as { instance_id: string; remote_jid: string } | undefined;
      if (contact) {
        const conversationPatch: Record<string, any> = {};
        if ('assigned_user_id' in normalized) {
          conversationPatch.assigned_user_id = normalized.assigned_user_id;
        }
        if ('status' in normalized) conversationPatch.status = normalized.status;
        const patchKeys = Object.keys(conversationPatch);
        if (patchKeys.length) {
          sqlite.prepare(`
            UPDATE conversations
            SET ${patchKeys.map((key) => `${key} = @${key}`).join(', ')}, updated_at = @updated_at
            WHERE instance_id = @instance_id AND remote_jid = @remote_jid
          `).run({
            ...conversationPatch,
            updated_at: now(),
            instance_id: contact.instance_id,
            remote_jid: contact.remote_jid,
          });
        }
      }
    }
    return inflateContact(sqlite.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId));
  },

  getContact(contactId: string) {
    return inflateContact(sqlite.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId));
  },

  listTags(organizationId = 'org_default') {
    return sqlite.prepare(`
      SELECT * FROM tags WHERE organization_id = ? ORDER BY name
    `).all(organizationId);
  },

  createTag(data: Record<string, any>) {
    const tagId = id();
    sqlite.prepare(`
      INSERT INTO tags (id, organization_id, name, color, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(tagId, data.organization_id || 'org_default', data.name, data.color || '#2563eb', now());
    return tagId;
  },

  deleteTag(tagId: string, organizationId: string) {
    return sqlite.transaction(() => {
      const owned = sqlite.prepare(`
        SELECT id FROM tags WHERE id = ? AND organization_id = ?
      `).get(tagId, organizationId);
      if (!owned) return false;
      sqlite.prepare('DELETE FROM contact_tags WHERE tag_id = ?').run(tagId);
      sqlite.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
      return true;
    })();
  },

  setContactTags(contactId: string, tagIds: string[]) {
    sqlite.transaction(() => {
      sqlite.prepare('DELETE FROM contact_tags WHERE contact_id = ?').run(contactId);
      const insert = sqlite.prepare(`
        INSERT OR IGNORE INTO contact_tags (contact_id, tag_id, created_at)
        VALUES (?, ?, ?)
      `);
      for (const tagId of tagIds) insert.run(contactId, tagId, now());
    })();
  },

  listUsers(organizationId = 'org_default') {
    return sqlite.prepare(`
      SELECT u.*, om.role
      FROM users u
      INNER JOIN organization_members om ON om.user_id = u.id
      WHERE om.organization_id = ?
      ORDER BY u.created_at ASC
    `).all(organizationId);
  },

  getUser(userId: string) {
    return sqlite.prepare('SELECT * FROM users WHERE id = ?').get(userId) as any;
  },

  createUser(data: Record<string, any>) {
    const userId = id();
    const ts = now();
    sqlite.transaction(() => {
      sqlite.prepare(`
        INSERT INTO users (
          id, email, name, password_hash, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'active', ?, ?)
      `).run(userId, data.email, data.name, data.password_hash || null, ts, ts);
      sqlite.prepare(`
        INSERT INTO organization_members (
          id, organization_id, user_id, role, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(id(), data.organization_id || 'org_default', userId, data.role || 'viewer', ts, ts);
    })();
    return userId;
  },

  getUserByEmail(email: string) {
    return sqlite.prepare(`
      SELECT * FROM users WHERE lower(email) = lower(?) AND status = 'active'
      LIMIT 1
    `).get(email) as any;
  },

  getUserMembership(userId: string, organizationId?: string | null) {
    return organizationId
      ? sqlite.prepare(`
          SELECT * FROM organization_members
          WHERE user_id = ? AND organization_id = ?
          LIMIT 1
        `).get(userId, organizationId) as any
      : sqlite.prepare(`
          SELECT * FROM organization_members
          WHERE user_id = ?
          ORDER BY created_at ASC
          LIMIT 1
        `).get(userId) as any;
  },

  updateUserRole(userId: string, organizationId: string, role: string) {
    sqlite.prepare(`
      UPDATE organization_members
      SET role = ?, updated_at = ?
      WHERE user_id = ? AND organization_id = ?
    `).run(role, now(), userId, organizationId);
  },

  createUserApiKey(data: Record<string, any>) {
    const apiKeyId = id();
    sqlite.prepare(`
      INSERT INTO user_api_keys (
        id, organization_id, user_id, instance_id, name, key_hash, key_prefix,
        role, scopes, ip_allowlist, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      apiKeyId,
      data.organization_id || 'org_default',
      data.user_id || null,
      data.instance_id || null,
      data.name,
      data.key_hash,
      data.key_prefix,
      data.role || 'developer',
      json(data.scopes || ['messages:send']),
      json(data.ip_allowlist || []),
      data.expires_at || null,
      now(),
    );
    return apiKeyId;
  },

  findUserApiKeyByHash(keyHash: string) {
    return inflateApiKey(sqlite.prepare(`
      SELECT * FROM user_api_keys
      WHERE key_hash = ? AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > ?)
      LIMIT 1
    `).get(keyHash, now()));
  },

  touchUserApiKey(apiKeyId: string) {
    sqlite.prepare('UPDATE user_api_keys SET last_used_at = ? WHERE id = ?').run(now(), apiKeyId);
  },

  listUserApiKeys(organizationId = 'org_default') {
    return sqlite.prepare(`
      SELECT id, organization_id, user_id, instance_id, name, key_prefix, role,
             scopes, ip_allowlist, last_used_at, expires_at, revoked_at, created_at
      FROM user_api_keys
      WHERE organization_id = ?
      ORDER BY created_at DESC
    `).all(organizationId).map(inflateApiKey);
  },

  revokeUserApiKey(apiKeyId: string) {
    sqlite.prepare('UPDATE user_api_keys SET revoked_at = ? WHERE id = ?').run(now(), apiKeyId);
  },

  addUsageEvent(data: Record<string, any>) {
    sqlite.prepare(`
      INSERT INTO usage_events (
        id, organization_id, user_id, instance_id, api_key_id,
        event_type, quantity, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      data.organization_id || null,
      data.user_id || null,
      data.instance_id || null,
      data.api_key_id || null,
      data.event_type,
      Number(data.quantity || 1),
      json(data.metadata),
      now(),
    );
  },

  getUsageSummary(organizationId = 'org_default', since?: string) {
    const start = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    return sqlite.prepare(`
      SELECT event_type, SUM(quantity) AS quantity
      FROM usage_events
      WHERE organization_id = ? AND created_at >= ?
      GROUP BY event_type
      ORDER BY quantity DESC
    `).all(organizationId, start);
  },

  getUsageTimeline(organizationId = 'org_default', since?: string) {
    const start = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    return sqlite.prepare(`
      SELECT substr(created_at, 1, 10) AS day, event_type, SUM(quantity) AS quantity
      FROM usage_events
      WHERE organization_id = ? AND created_at >= ?
      GROUP BY substr(created_at, 1, 10), event_type
      ORDER BY day ASC, event_type ASC
    `).all(organizationId, start);
  },

  getUsageByInstance(organizationId = 'org_default', since?: string) {
    const start = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString();
    return sqlite.prepare(`
      SELECT
        ue.instance_id,
        wi.instance_name,
        SUM(ue.quantity) AS quantity
      FROM usage_events ue
      LEFT JOIN whatsapp_instances wi ON wi.id = ue.instance_id
      WHERE ue.organization_id = ? AND ue.created_at >= ?
      GROUP BY ue.instance_id, wi.instance_name
      ORDER BY quantity DESC
    `).all(organizationId, start);
  },

  addAuditLog(data: Record<string, any>) {
    sqlite.prepare(`
      INSERT INTO audit_logs (
        id, organization_id, user_id, instance_id, action, target_type,
        target_id, ip_address, user_agent, metadata, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      data.organization_id || null,
      data.user_id || null,
      data.instance_id || null,
      data.action,
      data.target_type || null,
      data.target_id || null,
      data.ip_address || null,
      data.user_agent || null,
      json(data.metadata),
      now(),
    );
  },

  listAuditLogs(organizationId = 'org_default', limit = 100) {
    return sqlite.prepare(`
      SELECT * FROM audit_logs
      WHERE organization_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(organizationId, limit).map((row: any) => ({
      ...row,
      metadata: parseJson(row.metadata, null),
    }));
  },

  listTemplates(organizationId = 'org_default', instanceId?: string | null) {
    const rows = instanceId
      ? sqlite.prepare(`
          SELECT * FROM message_templates
          WHERE organization_id = ? AND (instance_id IS NULL OR instance_id = ?)
          ORDER BY name
        `).all(organizationId, instanceId)
      : sqlite.prepare(`
          SELECT * FROM message_templates
          WHERE organization_id = ?
          ORDER BY name
        `).all(organizationId);
    return rows.map(inflateTemplate);
  },

  createTemplate(data: Record<string, any>) {
    const templateId = id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO message_templates (
        id, organization_id, instance_id, name, category, content,
        variables, active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      templateId,
      data.organization_id || 'org_default',
      data.instance_id || null,
      data.name,
      data.category || 'general',
      data.content,
      json(data.variables || []),
      data.active === false ? 0 : 1,
      ts,
      ts,
    );
    return templateId;
  },

  deleteTemplate(templateId: string, organizationId: string) {
    return sqlite.prepare(`
      DELETE FROM message_templates WHERE id = ? AND organization_id = ?
    `).run(templateId, organizationId).changes === 1;
  },

  listAutoReplyRules(instanceId: string) {
    return sqlite.prepare(`
      SELECT * FROM auto_reply_rules
      WHERE instance_id = ?
      ORDER BY priority ASC, created_at ASC
    `).all(instanceId).map(inflateAutoReplyRule);
  },

  createAutoReplyRule(data: Record<string, any>) {
    const ruleId = id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO auto_reply_rules (
        id, organization_id, instance_id, name, enabled, priority, match_type,
        match_value, response_type, response_payload, cooldown_seconds,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      ruleId,
      data.organization_id || 'org_default',
      data.instance_id,
      data.name,
      data.enabled === false ? 0 : 1,
      Number(data.priority || 100),
      data.match_type || 'contains',
      data.match_value,
      data.response_type || 'text',
      json(data.response_payload || {}),
      Number(data.cooldown_seconds || 0),
      ts,
      ts,
    );
    return ruleId;
  },

  deleteAutoReplyRule(ruleId: string, organizationId: string) {
    return sqlite.prepare(`
      DELETE FROM auto_reply_rules WHERE id = ? AND organization_id = ?
    `).run(ruleId, organizationId).changes === 1;
  },

  findMatchingAutoReplyRule(instanceId: string, text: string) {
    const normalizedText = text.trim().toLowerCase();
    const rules = this.listAutoReplyRules(instanceId).filter((rule: any) => rule.enabled);
    return rules.find((rule: any) => {
      if (
        rule.cooldown_seconds > 0
        && rule.last_triggered_at
        && Date.parse(rule.last_triggered_at) + rule.cooldown_seconds * 1_000 > Date.now()
      ) {
        return false;
      }
      const value = String(rule.match_value || '').trim().toLowerCase();
      if (!value) return false;
      if (rule.match_type === 'exact') return normalizedText === value;
      if (rule.match_type === 'starts_with') return normalizedText.startsWith(value);
      if (rule.match_type === 'regex') {
        try {
          return new RegExp(rule.match_value, 'i').test(text);
        } catch {
          return false;
        }
      }
      return normalizedText.includes(value);
    }) || null;
  },

  markAutoReplyRuleTriggered(ruleId: string) {
    sqlite.prepare('UPDATE auto_reply_rules SET last_triggered_at = ?, updated_at = ? WHERE id = ?')
      .run(now(), now(), ruleId);
  },

  getAgentMemory(instanceId: string, contactKey: string) {
    const row = sqlite.prepare(`
      SELECT * FROM agent_memories WHERE instance_id = ? AND contact_key = ?
    `).get(instanceId, contactKey) as any;
    return row ? {
      ...row,
      facts: parseJson(row.facts, []),
      messages: parseJson(row.messages, []),
    } : null;
  },

  upsertAgentMemory(data: Record<string, any>) {
    const memoryId = data.id || id();
    sqlite.prepare(`
      INSERT INTO agent_memories (
        id, instance_id, contact_key, summary, facts, messages, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(instance_id, contact_key) DO UPDATE SET
        summary = excluded.summary,
        facts = excluded.facts,
        messages = excluded.messages,
        updated_at = excluded.updated_at
    `).run(
      memoryId,
      data.instance_id,
      data.contact_key,
      data.summary || null,
      json(data.facts || []),
      json(data.messages || []),
      now(),
    );
  },

  addHealthSample(data: Record<string, any>) {
    sqlite.prepare(`
      INSERT INTO instance_health_samples (
        id, instance_id, status, latency_ms, reconnect_attempts, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id(),
      data.instance_id,
      data.status,
      data.latency_ms ?? null,
      Number(data.reconnect_attempts || 0),
      now(),
    );
    this.updateInstance(data.instance_id, {
      last_health_at: now(),
      last_health_latency_ms: data.latency_ms ?? null,
    });
  },

  getInstanceHealth(instanceId: string, limit = 120) {
    return sqlite.prepare(`
      SELECT * FROM instance_health_samples
      WHERE instance_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `).all(instanceId, limit);
  },

  recordConnectionEvent(instanceId: string, status: string, reason?: string | null, durationMs?: number | null) {
    sqlite.prepare(`
      INSERT INTO connection_events (id, instance_id, status, reason, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id(), instanceId, status, reason || null, durationMs ?? null, now());
  },

  getInstanceReliability(instanceId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString();
    const samples = sqlite.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'connected' THEN 1 ELSE 0 END) AS healthy,
        AVG(latency_ms) AS average_latency
      FROM instance_health_samples
      WHERE instance_id = ? AND recorded_at >= ?
    `).get(instanceId, since) as {
      total: number;
      healthy: number;
      average_latency: number | null;
    };
    return {
      uptime_percent: samples.total ? Math.round((samples.healthy / samples.total) * 10_000) / 100 : null,
      average_latency_ms: Math.round(samples.average_latency || 0),
      samples: samples.total,
    };
  },
};

export default sqliteAdapter;
