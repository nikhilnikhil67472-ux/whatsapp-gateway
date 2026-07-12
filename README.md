# WhatsApp AI Gateway

Simple self-hosted WhatsApp AI gateway using Baileys, Next.js, local SQLite, and n8n webhooks.

## What It Does

- Create multiple WhatsApp instances from the dashboard.
- Scan QR and connect WhatsApp through Baileys.
- Store instances, logs, messages, and conversations in local SQLite.
- Receive WhatsApp messages and send them to an n8n webhook.
- Send AI replies back to WhatsApp.
- Configure message, group, call, contact, and webhook event settings per instance.

## Quick Setup

No Firebase setup is required.

1. Install dependencies:

```bash
npm install
```

2. Optional environment file:

```bash
cp .env.example .env.local
```

If your n8n or AI agent runs outside this machine, set `APP_BASE_URL` to a public URL so media files can be downloaded:

```env
APP_BASE_URL=https://your-domain.com
```

For local testing with cloud n8n, use a tunnel such as ngrok or Cloudflare Tunnel and put that HTTPS URL in `APP_BASE_URL`.

3. Build and run:

```bash
npm run build
npm run start:all
```

4. Open:

```text
http://127.0.0.1:3000/dashboard/instances
```

5. Create an instance, scan QR, add your n8n webhook URL, and enable AI.

## Local Data

The app creates local files automatically:

```text
data/gateway.db
data/whatsapp-sessions/
public/media/
```

Incoming WhatsApp media is saved under `public/media` and sent to n8n as `media.url`. Cloud agents can only open that URL when `APP_BASE_URL` is publicly reachable.

Back up the `data` folder if you want to keep instances, chat logs, and WhatsApp sessions.

## Useful Commands

Development:

```bash
npm run dev:all
```

Production:

```bash
npm run build
npm run start:all
```

Run dashboard and worker separately:

```bash
npm run start
npm run worker
```

## Instance Event Settings

Each instance has simple controls under Settings:

- Message events: private messages, AI routing, reactions, deleted messages, receipts, media.
- Group events: ignore groups by default, send groups to AI only when enabled, log participant changes.
- Call settings: detect calls, auto reject, send call auto reply.
- Contacts and chats: contact sync, chat updates, presence, blocklist.
- Webhook event forwarding: send non-message events to the same n8n webhook.

## n8n Webhook Reply Formats

Strict format:

```json
{ "reply": true, "type": "text", "text": "Hello!" }
```

Loose AI output:

```json
{ "output": "Hello!" }
```

Array format:

```json
[{ "reply": true, "type": "text", "text": "Hello!" }]
```

## Troubleshooting

- QR not showing: make sure `npm run worker` is running.
- Webhook not replying: verify the URL in Instance Settings and check Logs.
- Group messages ignored: disable "Ignore group messages" and enable "Send group messages to AI".
- Calls not auto-replying: enable "Detect incoming calls" and "Send auto reply after call".
- Need to move the app: copy the project folder plus the `data` folder.

## Important

This project uses Baileys/WhatsApp Web. It does not use WhatsApp Cloud API. Keep message volume reasonable and avoid spam automation.
