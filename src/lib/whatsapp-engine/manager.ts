import makeWASocket, {
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { db } from '../db/sqlite';
import { bindEvents } from './events';
import { clearSqliteAuthState, createSqliteAuthState } from './session-store';
import {
  acquireDistributedLease,
  DistributedLease,
} from '../queue/distributed-lock';
import { errorDetails, logger } from '../observability/logger';

type EngineState = {
  sockets: Map<string, WASocket>;
  starting: Set<string>;
  intentionalSockets: WeakSet<WASocket>;
  reconnectAttempts: Map<string, number>;
  reconnectTimers: Map<string, NodeJS.Timeout>;
  leases: Map<string, DistributedLease>;
};

const globalState = globalThis as typeof globalThis & {
  whatsappEngineState?: EngineState;
};

const engineState: EngineState = globalState.whatsappEngineState || {
  sockets: new Map(),
  starting: new Set(),
  intentionalSockets: new WeakSet(),
  reconnectAttempts: new Map(),
  reconnectTimers: new Map(),
  leases: new Map(),
};

engineState.intentionalSockets ||= new WeakSet();
engineState.leases ||= new Map();
globalState.whatsappEngineState = engineState;

function getDisconnectStatusCode(error: unknown) {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    output?: { statusCode?: number };
    statusCode?: number;
    data?: { statusCode?: number };
  };
  return candidate.output?.statusCode || candidate.statusCode || candidate.data?.statusCode || null;
}

function clearReconnectTimer(instanceId: string) {
  const timer = engineState.reconnectTimers.get(instanceId);
  if (timer) clearTimeout(timer);
  engineState.reconnectTimers.delete(instanceId);
}

function shouldReconnect(statusCode: number | null) {
  return ![
    DisconnectReason.loggedOut,
    DisconnectReason.badSession,
    DisconnectReason.forbidden,
    DisconnectReason.multideviceMismatch,
  ].includes(statusCode as DisconnectReason);
}

function scheduleReconnect(instanceId: string) {
  if (engineState.reconnectTimers.has(instanceId)) {
    return;
  }

  const attempt = (engineState.reconnectAttempts.get(instanceId) || 0) + 1;
  engineState.reconnectAttempts.set(instanceId, attempt);
  const baseDelay = Math.min(60_000, 2 ** Math.min(attempt - 1, 5) * 2_000);
  const delay = baseDelay + Math.floor(Math.random() * 1_000);

  db.updateInstance(instanceId, { status: 'reconnecting' });
  const timer = setTimeout(() => {
    engineState.reconnectTimers.delete(instanceId);
    WhatsAppEngineManager.startInstance(instanceId).catch((error) => {
      logger.error({
        instance_id: instanceId,
        reconnect_attempt: attempt,
        ...errorDetails(error),
      }, 'WhatsApp reconnect attempt failed.');
      scheduleReconnect(instanceId);
    });
  }, delay);

  timer.unref?.();
  engineState.reconnectTimers.set(instanceId, timer);
  logger.info({
    instance_id: instanceId,
    delay_ms: delay,
    reconnect_attempt: attempt,
  }, 'WhatsApp reconnect scheduled.');
}

export class WhatsAppEngineManager {
  static getSocket(instanceId: string) {
    return engineState.sockets.get(instanceId);
  }

  static hasReconnectScheduled(instanceId: string) {
    return engineState.reconnectTimers.has(instanceId);
  }

  static getRuntimeState(instanceId: string) {
    const socket = engineState.sockets.get(instanceId);
    return {
      hasSocket: Boolean(socket),
      socketOpen: Boolean(socket?.ws?.isOpen),
      starting: engineState.starting.has(instanceId),
      reconnectScheduled: engineState.reconnectTimers.has(instanceId),
      reconnectAttempts: engineState.reconnectAttempts.get(instanceId) || 0,
      distributedLease: engineState.leases.get(instanceId)?.distributed || false,
    };
  }

  static async runHealthMonitor() {
    const instances = db.listInstances();
    const staleMs = Number(process.env.ZOMBIE_SOCKET_TIMEOUT_MS || 90_000);
    const nowMs = Date.now();

    for (const instance of instances) {
      const startedAt = Date.now();
      const runtime = this.getRuntimeState(instance.id);
      if (instance.status === 'connected' && runtime.socketOpen) {
        db.addHealthSample({
          instance_id: instance.id,
          status: 'connected',
          latency_ms: Date.now() - startedAt,
          reconnect_attempts: runtime.reconnectAttempts,
        });
        continue;
      }

      const updatedAt = Date.parse(instance.updated_at || instance.last_connection_at || '');
      const stale = Number.isFinite(updatedAt) && nowMs - updatedAt >= staleMs;
      const shouldRecover = (
        instance.status === 'connected'
        || (['connecting', 'reconnecting'].includes(instance.status) && stale)
      ) && !runtime.starting;

      db.addHealthSample({
        instance_id: instance.id,
        status: runtime.socketOpen ? instance.status : 'unhealthy',
        latency_ms: null,
        reconnect_attempts: runtime.reconnectAttempts,
      });

      if (!shouldRecover) continue;
      logger.warn({
        instance_id: instance.id,
        db_status: instance.status,
        runtime,
      }, 'Zombie or missing WhatsApp socket detected; restarting instance.');
      try {
        await this.restartInstance(instance.id);
      } catch (error) {
        logger.error({
          instance_id: instance.id,
          ...errorDetails(error),
        }, 'Health monitor restart failed.');
      }
    }
  }

  static async startInstance(instanceId: string) {
    if (engineState.sockets.has(instanceId) || engineState.starting.has(instanceId)) return;
    if (!db.getInstance(instanceId)) throw new Error(`WhatsApp instance ${instanceId} does not exist`);

    clearReconnectTimer(instanceId);
    engineState.starting.add(instanceId);
    db.updateInstance(instanceId, { status: 'connecting' });

    try {
      const lease = await acquireDistributedLease(`instance:${instanceId}`);
      if (!lease.acquired) {
        db.updateInstance(instanceId, { status: 'standby' });
        db.recordConnectionEvent(instanceId, 'standby', 'Owned by another worker node');
        scheduleReconnect(instanceId);
        return;
      }
      engineState.leases.set(instanceId, lease);

      const { state, saveCreds } = await createSqliteAuthState(instanceId);
      const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: process.env.BAILEYS_LOG_LEVEL || 'warn' }),
        browser: ['WhatsApp Gateway', 'Desktop', '2.0.0'],
        markOnlineOnConnect: false,
        syncFullHistory: false,
      });

      engineState.sockets.set(instanceId, sock);
      sock.ev.on('creds.update', saveCreds);
      bindEvents(instanceId, sock);

      sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr) {
          try {
            const qrBase64 = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
            db.updateInstance(instanceId, {
              status: 'waiting_qr',
              qr_base64: qrBase64,
              qr_updated_at: db.now(),
            });
          } catch (error) {
            logger.error({
              instance_id: instanceId,
              ...errorDetails(error),
            }, 'Failed to encode WhatsApp QR code.');
          }
        }

        if (connection === 'open') {
          engineState.reconnectAttempts.delete(instanceId);
          clearReconnectTimer(instanceId);
          db.updateInstance(instanceId, {
            status: 'connected',
            qr_base64: null,
            qr_updated_at: null,
            last_connection_at: db.now(),
            phone_number: sock.user?.id?.split(':')[0] || null,
            push_name: sock.user?.name || null,
            uptime_started_at: db.now(),
          });
          db.recordConnectionEvent(instanceId, 'connected');
          logger.info({ instance_id: instanceId }, 'WhatsApp instance connected.');
          return;
        }

        if (connection !== 'close') return;

        const isCurrentSocket = engineState.sockets.get(instanceId) === sock;
        if (isCurrentSocket) engineState.sockets.delete(instanceId);
        const statusCode = getDisconnectStatusCode(lastDisconnect?.error);
        const intentional = engineState.intentionalSockets.delete(sock);
        if (engineState.leases.get(instanceId) === lease) {
          engineState.leases.delete(instanceId);
        }
        await lease.release();
        if (!isCurrentSocket && intentional) return;
        const reconnect = !intentional && shouldReconnect(statusCode);

        db.updateInstance(instanceId, {
          status: intentional ? 'stopped' : reconnect ? 'disconnected' : 'logged_out',
          qr_base64: null,
          last_disconnection_at: db.now(),
          logged_out_at: reconnect || intentional ? null : db.now(),
        });
        db.recordConnectionEvent(
          instanceId,
          intentional ? 'stopped' : reconnect ? 'disconnected' : 'logged_out',
          statusCode ? `Disconnect code ${statusCode}` : 'Connection closed',
        );

        if (!reconnect) {
          clearReconnectTimer(instanceId);
          engineState.reconnectAttempts.delete(instanceId);
          if (!intentional) await clearSqliteAuthState(instanceId);
          logger.info({
            instance_id: instanceId,
            disconnect_code: statusCode,
          }, 'WhatsApp connection closed without reconnect.');
          return;
        }

        scheduleReconnect(instanceId);
      });
    } catch (error) {
      const lease = engineState.leases.get(instanceId);
      engineState.leases.delete(instanceId);
      await lease?.release();
      db.updateInstance(instanceId, {
        status: 'failed',
        last_disconnection_at: db.now(),
      });
      throw error;
    } finally {
      engineState.starting.delete(instanceId);
    }
  }

  static async stopInstance(instanceId: string) {
    clearReconnectTimer(instanceId);
    const sock = engineState.sockets.get(instanceId);
    engineState.sockets.delete(instanceId);
    if (sock) engineState.intentionalSockets.add(sock);
    sock?.end?.(new Error('Instance stopped by worker command'));
    const lease = engineState.leases.get(instanceId);
    engineState.leases.delete(instanceId);
    await lease?.release();
    db.updateInstance(instanceId, { status: 'stopped', qr_base64: null });
    db.recordConnectionEvent(instanceId, 'stopped', 'Worker command');
  }

  static async logoutInstance(instanceId: string) {
    clearReconnectTimer(instanceId);
    const sock = engineState.sockets.get(instanceId);
    engineState.sockets.delete(instanceId);
    if (sock) engineState.intentionalSockets.add(sock);

    try {
      await sock?.logout();
    } finally {
      const lease = engineState.leases.get(instanceId);
      engineState.leases.delete(instanceId);
      await lease?.release();
      await clearSqliteAuthState(instanceId);
      engineState.reconnectAttempts.delete(instanceId);
      db.updateInstance(instanceId, {
        status: 'logged_out',
        qr_base64: null,
        logged_out_at: db.now(),
        phone_number: null,
        push_name: null,
      });
      db.recordConnectionEvent(instanceId, 'logged_out', 'User requested logout');
    }
  }

  static async restartInstance(instanceId: string) {
    await this.stopInstance(instanceId);
    await this.startInstance(instanceId);
  }

  static async shutdownAll() {
    await Promise.allSettled(
      [...engineState.sockets.entries()].map(async ([instanceId, sock]) => {
        clearReconnectTimer(instanceId);
        engineState.sockets.delete(instanceId);
        engineState.intentionalSockets.add(sock);
        sock.end?.(new Error('Worker is shutting down'));
        const lease = engineState.leases.get(instanceId);
        engineState.leases.delete(instanceId);
        await lease?.release();
        db.updateInstance(instanceId, {
          status: 'disconnected',
          qr_base64: null,
          last_disconnection_at: db.now(),
        });
      }),
    );
  }
}
