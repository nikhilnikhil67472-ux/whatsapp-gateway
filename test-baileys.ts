import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys';
import pino from 'pino';

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('./test-session');
  
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'info' }),
    browser: ['WhatsApp Gateway', 'Desktop', '1.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    console.log('Connection update:', update);
  });
}

start();
