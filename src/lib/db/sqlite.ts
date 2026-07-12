import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = process.env.SQLITE_DB_PATH || path.join(dataDir, 'gateway.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqlite = new Database(dbPath);
sqlite.pragma('journal_mode = WAL');

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
    reject_calls: Boolean(row.reject_calls),
    ignore_groups: Boolean(row.ignore_groups),
    allow_groups: Boolean(row.allow_groups),
    event_settings: parseJson(row.event_settings, null),
  };
}

function inflateLog(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateMessage(row: any) {
  return row ? { ...row, from_me: Boolean(row.from_me), raw_payload: parseJson(row.raw_payload, null) } : null;
}

function inflateAiRun(row: any) {
  return row ? { ...row, response_payload: parseJson(row.response_payload, null) } : null;
}

function inflateOutbound(row: any) {
  return row || null;
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

    CREATE INDEX IF NOT EXISTS idx_instances_created ON whatsapp_instances(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_instance_last ON conversations(instance_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_instance_received ON whatsapp_event_logs(instance_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_history ON messages(instance_id, remote_jid, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_outbound_status_created ON outbound_messages(status, created_at ASC);
  `);

  ensureColumn('outbound_messages', 'media_type', 'TEXT');
  ensureColumn('outbound_messages', 'mime_type', 'TEXT');
  ensureColumn('outbound_messages', 'quoted_message_id', 'TEXT');
  ensureColumn('outbound_messages', 'error_message', 'TEXT');
  ensureColumn('outbound_messages', 'sent_at', 'TEXT');
  ensureColumn('outbound_messages', 'updated_at', 'TEXT');
}

initDb();

export const db = {
  now,

  listInstances() {
    return sqlite.prepare('SELECT * FROM whatsapp_instances ORDER BY created_at DESC').all().map(inflateInstance);
  },

  listStartableInstances(statuses: string[]) {
    const placeholders = statuses.map(() => '?').join(', ');
    return sqlite.prepare(`SELECT * FROM whatsapp_instances WHERE status IN (${placeholders})`).all(...statuses).map(inflateInstance);
  },

  getInstance(instanceId: string) {
    return inflateInstance(sqlite.prepare('SELECT * FROM whatsapp_instances WHERE id = ?').get(instanceId));
  },

  createInstance(data: Record<string, any>) {
    const instanceId = data.id || id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO whatsapp_instances (
        id, client_id, instance_name, provider, status, ai_enabled, agent_mode,
        reject_calls, ignore_groups, allow_groups, msg_call, event_settings,
        created_at, updated_at
      ) VALUES (
        @id, @client_id, @instance_name, @provider, @status, @ai_enabled, @agent_mode,
        @reject_calls, @ignore_groups, @allow_groups, @msg_call, @event_settings,
        @created_at, @updated_at
      )
    `).run({
      id: instanceId,
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
      created_at: data.created_at || ts,
      updated_at: data.updated_at || ts,
    });
    return instanceId;
  },

  updateInstance(instanceId: string, patch: Record<string, any>) {
    const allowed = [
      'client_id', 'instance_name', 'provider', 'status', 'phone_number', 'push_name',
      'qr_base64', 'qr_updated_at', 'last_connection_at', 'last_disconnection_at',
      'logged_out_at', 'ai_enabled', 'n8n_webhook_url', 'n8n_secret_encrypted',
      'webhook_secret', 'agent_mode', 'reject_calls', 'ignore_groups', 'allow_groups',
      'msg_call', 'event_settings',
    ];
    const normalized: Record<string, any> = {};
    for (const key of allowed) {
      if (!(key in patch)) continue;
      const value = patch[key];
      if (['ai_enabled', 'reject_calls', 'ignore_groups', 'allow_groups'].includes(key)) {
        normalized[key] = value ? 1 : 0;
      } else if (key === 'event_settings') {
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
    sqlite.prepare(`
      INSERT INTO conversations (id, instance_id, remote_jid, is_group, display_name, last_message_at, created_at, updated_at)
      VALUES (@id, @instance_id, @remote_jid, @is_group, @display_name, @last_message_at, @created_at, @updated_at)
      ON CONFLICT(id) DO UPDATE SET
        display_name = excluded.display_name,
        is_group = excluded.is_group,
        last_message_at = excluded.last_message_at,
        updated_at = excluded.updated_at
    `).run({
      id: data.id,
      instance_id: data.instance_id,
      remote_jid: data.remote_jid,
      is_group: data.is_group ? 1 : 0,
      display_name: data.display_name || null,
      last_message_at: data.last_message_at || ts,
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
        direction, message_type, text_content, caption, raw_payload, created_at
      ) VALUES (
        @id, @instance_id, @conversation_id, @remote_jid, @whatsapp_message_id, @from_me,
        @direction, @message_type, @text_content, @caption, @raw_payload, @created_at
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
    sqlite.prepare(`
      INSERT INTO media_assets (id, instance_id, message_id, media_type, mime_type, file_name, storage_path, public_url, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id(), data.instance_id, data.message_id || null, data.media_type || null, data.mime_type || null, data.file_name || null, data.storage_path || null, data.public_url || null, now());
  },

  addOutboundMessage(data: Record<string, any>) {
    const ts = now();
    sqlite.prepare(`
      INSERT INTO outbound_messages (
        id, instance_id, conversation_id, remote_jid, reply_type, text_content,
        media_url, media_type, mime_type, quoted_message_id, status,
        error_message, sent_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.status || 'sent',
      data.error_message || null,
      data.sent_at || ((data.status || 'sent') === 'sent' ? ts : null),
      data.created_at || ts,
      ts,
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
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT ?
    `).all(limit).map(inflateOutbound);
  },

  markOutboundMessageSending(outboundId: string) {
    sqlite.prepare(`
      UPDATE outbound_messages
      SET status = 'sending', updated_at = ?
      WHERE id = ? AND status = 'pending'
    `).run(now(), outboundId);
  },

  markOutboundMessageSent(outboundId: string) {
    const ts = now();
    sqlite.prepare(`
      UPDATE outbound_messages
      SET status = 'sent', sent_at = ?, updated_at = ?, error_message = NULL
      WHERE id = ?
    `).run(ts, ts, outboundId);
  },

  markOutboundMessageFailed(outboundId: string, errorMessage: string) {
    sqlite.prepare(`
      UPDATE outbound_messages
      SET status = 'failed', error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(errorMessage, now(), outboundId);
  },

  createAiRun(data: Record<string, any>) {
    const runId = id();
    sqlite.prepare(`
      INSERT INTO ai_runs (id, instance_id, message_id, n8n_url, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(runId, data.instance_id, data.message_id || null, data.n8n_url || null, data.status || 'processing', now());
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
};

export default db;
