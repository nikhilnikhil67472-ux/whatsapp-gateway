import makeWASocket, {
  DisconnectReason,
  WASocket,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import { db } from '../db/sqlite';
import { bindEvents } from './events';
import { clearSqliteAuthState, createSqliteAuthState } from './session-store';

type EngineState = {
  sockets: Map<string, WASocket>;
  starting: Set<string>;
  intentionalSockets: WeakSet<WASocket>;
  reconnectAttempts: Map<string, number>;
  reconnectTimers: Map<string, NodeJS.Timeout>;
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
};

engineState.intentionalSockets ||= new WeakSet();
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
      console.error(`[Baileys ${instanceId}] Reconnect attempt failed:`, error);
      scheduleReconnect(instanceId);
    });
  }, delay);

  timer.unref?.();
  engineState.reconnectTimers.set(instanceId, timer);
  console.log(`[Baileys ${instanceId}] Reconnecting in ${delay}ms (attempt ${attempt}).`);
}

export class WhatsAppEngineManager {
  static getSocket(instanceId: string) {
    return engineState.sockets.get(instanceId);
  }

  static hasReconnectScheduled(instanceId: string) {
    return engineState.reconnectTimers.has(instanceId);
  }

  static async startInstance(instanceId: string) {
    if (engineState.sockets.has(instanceId) || engineState.starting.has(instanceId)) return;
    if (!db.getInstance(instanceId)) throw new Error(`WhatsApp instance ${instanceId} does not exist`);

    clearReconnectTimer(instanceId);
    engineState.starting.add(instanceId);
    db.updateInstance(instanceId, { status: 'connecting' });

    try {
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
            console.error(`[Baileys ${instanceId}] Failed to encode QR code:`, error);
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
          });
          console.log(`[Baileys ${instanceId}] Connected.`);
          return;
        }

        if (connection !== 'close') return;

        const isCurrentSocket = engineState.sockets.get(instanceId) === sock;
        if (isCurrentSocket) engineState.sockets.delete(instanceId);
        const statusCode = getDisconnectStatusCode(lastDisconnect?.error);
        const intentional = engineState.intentionalSockets.delete(sock);
        if (!isCurrentSocket && intentional) return;
        const reconnect = !intentional && shouldReconnect(statusCode);

        db.updateInstance(instanceId, {
          status: intentional ? 'stopped' : reconnect ? 'disconnected' : 'logged_out',
          qr_base64: null,
          last_disconnection_at: db.now(),
          logged_out_at: reconnect || intentional ? null : db.now(),
        });

        if (!reconnect) {
          clearReconnectTimer(instanceId);
          engineState.reconnectAttempts.delete(instanceId);
          if (!intentional) await clearSqliteAuthState(instanceId);
          console.log(`[Baileys ${instanceId}] Connection closed without reconnect (code ${statusCode ?? 'unknown'}).`);
          return;
        }

        scheduleReconnect(instanceId);
      });
    } catch (error) {
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
    db.updateInstance(instanceId, { status: 'stopped', qr_base64: null });
  }

  static async logoutInstance(instanceId: string) {
    clearReconnectTimer(instanceId);
    const sock = engineState.sockets.get(instanceId);
    engineState.sockets.delete(instanceId);
    if (sock) engineState.intentionalSockets.add(sock);

    try {
      await sock?.logout();
    } finally {
      await clearSqliteAuthState(instanceId);
      engineState.reconnectAttempts.delete(instanceId);
      db.updateInstance(instanceId, {
        status: 'logged_out',
        qr_base64: null,
        logged_out_at: db.now(),
        phone_number: null,
        push_name: null,
      });
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
        db.updateInstance(instanceId, {
          status: 'disconnected',
          qr_base64: null,
          last_disconnection_at: db.now(),
        });
      }),
    );
  }
}
