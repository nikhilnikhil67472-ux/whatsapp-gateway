# WhatsApp AI Gateway

Self-hosted WhatsApp integration middleware built with Next.js, TypeScript, Baileys, SQLite, and n8n/custom webhooks.

## Core Capabilities

- Multiple concurrent WhatsApp instances with QR pairing.
- Baileys credentials and signal keys stored directly in SQLite.
- Automatic reconnect with exponential backoff.
- Durable worker commands for start, restart, stop, and logout.
- Retry queues for outbound WhatsApp messages and non-message webhooks.
- Text, image, video, document, voice note, audio, location, and contact support.
- Decrypted inbound media as a public URL or optional Base64 payload.
- LID-aware sender identity resolution.
- HMAC-signed webhooks and optional bearer authentication.
- Dashboard login plus global and per-instance outbound API keys.

## Local Setup

```bash
npm ci
copy .env.example .env.local
npm run dev:all
```

Open `http://127.0.0.1:3000`. In development, dashboard and API auth can run without secrets. Production intentionally requires secure environment values.

## Required Production Environment

```env
NODE_ENV=production
SQLITE_DB_PATH=/var/lib/whatsapp-gateway/gateway.db
APP_BASE_URL=https://gateway.example.com
ENCRYPTION_KEY=exactly-32-characters-long-key!!
AUTH_SECRET=replace-with-at-least-32-random-characters
DASHBOARD_PASSWORD=replace-with-a-strong-password
GATEWAY_API_KEY=replace-with-a-long-random-api-key
ALLOW_INSECURE_API=false
```

`APP_BASE_URL` must be reachable by the AI agent if it downloads inbound media. Enable **Include decrypted media as Base64** in instance settings when the agent needs voice/image bytes inside the webhook payload.

## Run Without Docker

```bash
npm ci
npm run build
npm run start:all
```

For AWS EC2, use the two systemd units in `deploy/systemd` and the Nginx config in `deploy/nginx`. Keep the SQLite database and `public/media` on persistent storage. Run one Baileys worker against a SQLite database; horizontal scaling requires moving queues and auth state to PostgreSQL/Redis.

## Outbound API

Endpoint:

```text
POST /api/whatsapp/send
Authorization: Bearer <global-or-instance-api-key>
```

Text:

```json
{
  "instanceId": "instance-name-or-uuid",
  "phoneNumber": "919876543210",
  "type": "text",
  "text": "Hello"
}
```

Media supports either `mediaUrl` or `base64`:

```json
{
  "instanceId": "instance-name-or-uuid",
  "remoteJid": "919876543210@s.whatsapp.net",
  "type": "media",
  "mediaUrl": "https://example.com/invoice.pdf",
  "mediaType": "document",
  "mimeType": "application/pdf",
  "fileName": "invoice.pdf",
  "text": "Your invoice"
}
```

Supported `type` values are `text`, `media`, `audio`, `location`, and `contact`.

## Incoming AI Webhook

Message payloads include:

- Instance and sender identity, including phone number, JID, alternate JID, and LID.
- Normalized message type, text, caption, timestamp, and structured data.
- Media MIME type, file name, size, URL, and optional `base64_data`.
- Recent conversation history.

Webhook verification headers:

```text
X-Webhook-Event
X-Webhook-Delivery
X-Webhook-Timestamp
X-Webhook-Signature: sha256=<hmac>
```

Verify the signature over `<timestamp>.<raw-request-body>` using the instance webhook secret.

Accepted text reply formats:

```json
{ "reply": true, "type": "text", "text": "Hello!" }
```

```json
{ "output": "Hello!" }
```

Media, audio, location, and contact replies use the same outbound field names as the REST API. AI replies are queued and retried instead of being sent inline.

## Persistence and Backups

Back up:

```text
data/gateway.db
public/media/
```

Legacy `data/whatsapp-sessions` files are imported into SQLite automatically on first use and may be retained as a temporary backup.

## n8n Community Node

The package is in `n8n-nodes-whatsapp-gateway`. Its credential requires:

- Gateway Base URL
- Global or instance API key

Build it with:

```bash
cd n8n-nodes-whatsapp-gateway
npm ci
npm run build
```

## Operational Notes

This project uses WhatsApp Web through Baileys, not the official WhatsApp Cloud API. Avoid spam and abusive automation. For strict enterprise compliance, use Meta's official API.
