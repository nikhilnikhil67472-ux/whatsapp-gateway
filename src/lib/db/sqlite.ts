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
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateWorkerCommand(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
}

function inflateWebhookDelivery(row: any) {
  return row ? { ...row, payload: parseJson(row.payload, null) } : null;
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

    CREATE INDEX IF NOT EXISTS idx_instances_created ON whatsapp_instances(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_instance_last ON conversations(instance_id, last_message_at DESC);
    CREATE INDEX IF NOT EXISTS idx_logs_instance_received ON whatsapp_event_logs(instance_id, received_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_history ON messages(instance_id, remote_jid, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_outbound_status_created ON outbound_messages(status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_auth_keys_instance ON baileys_auth_keys(instance_id);
    CREATE INDEX IF NOT EXISTS idx_worker_commands_pending ON worker_commands(status, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending ON webhook_deliveries(status, next_attempt_at ASC);
  `);

  ensureColumn('whatsapp_instances', 'api_key_hash', 'TEXT');
  ensureColumn('whatsapp_instances', 'api_key_prefix', 'TEXT');
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

  getInstanceByIdentifier(identifier: string) {
    return inflateInstance(sqlite.prepare(`
      SELECT * FROM whatsapp_instances
      WHERE id = ? OR instance_name = ?
      LIMIT 1
    `).get(identifier, identifier));
  },

  createInstance(data: Record<string, any>) {
    const instanceId = data.id || id();
    const ts = now();
    sqlite.prepare(`
      INSERT INTO whatsapp_instances (
        id, client_id, instance_name, provider, status, ai_enabled, agent_mode,
        reject_calls, ignore_groups, allow_groups, msg_call, event_settings,
        webhook_secret, api_key_hash, api_key_prefix, created_at, updated_at
      ) VALUES (
        @id, @client_id, @instance_name, @provider, @status, @ai_enabled, @agent_mode,
        @reject_calls, @ignore_groups, @allow_groups, @msg_call, @event_settings,
        @webhook_secret, @api_key_hash, @api_key_prefix, @created_at, @updated_at
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
      webhook_secret: data.webhook_secret || crypto.randomBytes(32).toString('hex'),
      api_key_hash: data.api_key_hash || null,
      api_key_prefix: data.api_key_prefix || null,
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
      'msg_call', 'event_settings', 'api_key_hash', 'api_key_prefix',
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
        media_url, media_type, mime_type, quoted_message_id, payload, status,
        attempts, max_attempts, next_attempt_at, error_message, sent_at, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

  listExpiredMediaAssets(cutoff: string, limit = 100) {
    return sqlite.prepare(`
      SELECT id, storage_path FROM media_assets
      WHERE created_at < ? AND storage_path IS NOT NULL
      ORDER BY created_at ASC
      LIMIT ?
    `).all(cutoff, limit) as Array<{ id: string; storage_path: string }>;
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
        status, attempts, max_attempts, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)
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

  markWebhookDeliverySending(deliveryId: string) {
    const result = sqlite.prepare(`
      UPDATE webhook_deliveries
      SET status = 'sending', attempts = attempts + 1, updated_at = ?
      WHERE id = ? AND status IN ('pending', 'retry')
    `).run(now(), deliveryId);
    return result.changes === 1;
  },

  markWebhookDeliveryDelivered(deliveryId: string, responseStatus: number) {
    const ts = now();
    sqlite.prepare(`
      UPDATE webhook_deliveries
      SET status = 'delivered', response_status = ?, delivered_at = ?, updated_at = ?, error_message = NULL
      WHERE id = ?
    `).run(responseStatus, ts, ts, deliveryId);
  },

  markWebhookDeliveryFailed(deliveryId: string, errorMessage: string, responseStatus?: number) {
    const row = sqlite.prepare('SELECT attempts, max_attempts FROM webhook_deliveries WHERE id = ?').get(deliveryId) as {
      attempts: number;
      max_attempts: number;
    } | undefined;
    if (!row) return;

    const exhausted = row.attempts >= row.max_attempts;
    const delayMs = Math.min(900_000, 2 ** Math.max(0, row.attempts - 1) * 10_000);
    sqlite.prepare(`
      UPDATE webhook_deliveries
      SET status = ?, next_attempt_at = ?, response_status = ?, error_message = ?, updated_at = ?
      WHERE id = ?
    `).run(
      exhausted ? 'failed' : 'retry',
      new Date(Date.now() + delayMs).toISOString(),
      responseStatus || null,
      errorMessage,
      now(),
      deliveryId,
    );
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
