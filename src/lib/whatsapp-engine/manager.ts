import makeWASocket, { DisconnectReason } from '@whiskeysockets/baileys';
import { useMultiFileAuthState } from './session-store';
import { bindEvents } from './events';
import pino from 'pino';
import QRCode from 'qrcode';
import { db } from '../db/sqlite';

// We store active sockets globally so they persist across Next.js API reloads in dev (somewhat).
// In production, this runs as a single process if not on Vercel.
const globalSockets = (global as any).whatsappSockets || new Map<string, any>();
if (!(global as any).whatsappSockets) {
  (global as any).whatsappSockets = globalSockets;
}

export class WhatsAppEngineManager {
  
  static getSocket(instanceId: string) {
    return globalSockets.get(instanceId);
  }

  static async startInstance(instanceId: string) {
    // Check if already running
    if (globalSockets.has(instanceId)) {
      return;
    }

    const { state, saveCreds } = await useMultiFileAuthState(instanceId);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'info' }),
      browser: ['WhatsApp Gateway', 'Desktop', '1.0.0'],
    });

    globalSockets.set(instanceId, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      console.log(`[Baileys ${instanceId}] Connection Update:`, update);
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`[Baileys ${instanceId}] Received QR Code, saving to DB...`);
        // Save QR code to DB
        const qrBase64 = await QRCode.toDataURL(qr);
        db.updateInstance(instanceId, {
          status: 'waiting_qr',
          qr_base64: qrBase64,
          qr_updated_at: new Date().toISOString()
        });
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        globalSockets.delete(instanceId);
        
        db.updateInstance(instanceId, {
          status: shouldReconnect ? 'disconnected' : 'logged_out',
          last_disconnection_at: new Date().toISOString()
        });

        if (shouldReconnect) {
          // Reconnect automatically
          setTimeout(() => WhatsAppEngineManager.startInstance(instanceId), 5000);
        } else {
          // Logged out - clear session path (user scanned out from phone)
          // Optional: clear folder
        }
      } else if (connection === 'open') {
        db.updateInstance(instanceId, {
          status: 'connected',
          qr_base64: null,
          last_connection_at: new Date().toISOString()
        });
        
        // Retrieve phone number and push name
        const id = sock.user?.id;
        const pushName = sock.user?.name;
        if (id) {
          db.updateInstance(instanceId, {
            phone_number: id.split(':')[0],
            push_name: pushName || null
          });
        }
      }
    });

    // Bind other events (messages, etc)
    bindEvents(instanceId, sock);
  }

  static async stopInstance(instanceId: string) {
    const sock = globalSockets.get(instanceId);
    if (sock) {
      sock.end?.(undefined);
      globalSockets.delete(instanceId);
    }
  }

  static async logoutInstance(instanceId: string) {
    const sock = globalSockets.get(instanceId);
    if (sock) {
      await sock.logout();
      globalSockets.delete(instanceId);
    }

    db.updateInstance(instanceId, {
      status: 'logged_out',
      qr_base64: null,
      logged_out_at: new Date().toISOString()
    });
  }

  static async restartInstance(instanceId: string) {
    await this.stopInstance(instanceId);
    await new Promise(r => setTimeout(r, 2000));
    await this.startInstance(instanceId);
  }
}
