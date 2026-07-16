# Relay WhatsApp AI Gateway

Self-hosted WhatsApp middleware for AI agents, n8n, and custom webhooks. It uses Next.js, TypeScript, Baileys, SQLite, optional Redis/BullMQ, and optional S3-compatible storage.

## What Is Included

- Multiple WhatsApp instances with QR pairing and automatic reconnect.
- Baileys credentials and Signal keys encrypted in SQLite with AES-256-GCM.
- Durable outbound, command, and webhook queues. Redis/BullMQ is used when configured; SQLite polling is the fallback.
- Signed webhook delivery history, retries, dead-letter status, and replay.
- OpenAI, Anthropic, and custom webhook AI agents with per-contact memory.
- Voice transcription, image analysis, PDF extraction, Base64, media URLs, local storage, S3, and MinIO.
- LID-aware sender resolution.
- Contacts, tags, assignment, consent/opt-out, templates, and auto-reply rules.
- Organizations, team roles, hashed API keys, scopes, expiry, IP allowlists, rate limits, usage, and audit logs.
- Prometheus metrics, Grafana dashboard, structured logs, and optional Sentry.
- Interactive OpenAPI docs, Postman collection, and Node/Python SDKs.

## Run Without Docker

Requirements: Node.js 20+, npm, and a persistent disk.

```bash
npm ci
copy .env.example .env.local
npm run dev:all
```

Open `http://localhost:3000`.

For a production build:

```bash
npm ci
npm run build
npm run start:all
```

The web process serves the dashboard/API. The worker owns Baileys sockets, queues, webhook delivery, AI processing, and health recovery. Both processes must run.

## Production Environment

At minimum, set:

```env
NODE_ENV=production
SQLITE_DB_PATH=/var/lib/whatsapp-gateway/gateway.db
APP_BASE_URL=https://gateway.example.com
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef
AUTH_SECRET=replace-with-at-least-32-random-characters
DASHBOARD_PASSWORD=replace-with-a-strong-password
GATEWAY_API_KEY=replace-with-a-long-random-api-key
ALLOW_INSECURE_API=false
```

Do not change `ENCRYPTION_KEY` after sessions or provider secrets have been stored. Back it up in a secret manager.

For horizontal worker coordination and shared rate limits:

```env
REDIS_URL=redis://127.0.0.1:6379
REDIS_REQUIRED=true
NODE_ID=worker-1
```

The database remains SQLite in this personal/self-hosted edition. Keep a single shared web host for writes and use Redis to ensure only one worker owns each WhatsApp instance. A managed PostgreSQL adapter is the next step for multi-region deployments.

## Dashboard

- **Instances**: connection state, QR pairing, setup, and per-instance controls.
- **Live**: realtime incoming/outgoing messages, media intelligence, and test sends.
- **Inbox**: recent conversations.
- **Webhooks**: delivery history, retries, dead letters, endpoint testing, and replay.
- **Activity**: WhatsApp event logs and AI run errors/responses.
- **Contacts**: CRM fields, owner assignment, tags, status, notes, and opt-out.
- **Automations**: deterministic reply rules and reusable templates.
- **Team & API Keys**: admin/developer/viewer accounts and scoped API credentials.
- **Usage & Audit**: billing-ready event totals and administrative audit records.
- **Health**: queue, Redis, latency, uptime, and Prometheus status.

## Outbound API

```text
POST /api/whatsapp/send
Authorization: Bearer <global-instance-or-user-api-key>
Content-Type: application/json
```

Text:

```json
{
  "instanceId": "support",
  "phoneNumber": "919876543210",
  "type": "text",
  "text": "Hello"
}
```

Media URL:

```json
{
  "instanceId": "support",
  "remoteJid": "919876543210@s.whatsapp.net",
  "type": "media",
  "mediaUrl": "https://example.com/invoice.pdf",
  "mediaType": "document",
  "mimeType": "application/pdf",
  "fileName": "invoice.pdf",
  "text": "Your invoice"
}
```

`base64` can replace `mediaUrl`. Supported `type` values are `text`, `media`, `audio`, `location`, and `contact`. Accepted messages return HTTP `202` with a durable queue ID.

## Incoming AI Webhooks

Payloads include:

- Instance and sender identity, including resolved phone JID, alternate JID, and LID.
- Normalized text, caption, message type, timestamp, and recent history.
- Media MIME type, URL, optional Base64, transcription, image analysis, or extracted PDF text.

Each request includes:

```text
X-Webhook-Event
X-Webhook-Delivery
X-Webhook-Timestamp
X-Webhook-Signature: sha256=<hmac>
```

Verify the HMAC over `<timestamp>.<exact-raw-request-body>` with the instance signing secret and reject timestamps older than five minutes.

Text reply:

```json
{
  "reply": true,
  "type": "text",
  "text": "Hello!"
}
```

Media, audio, location, and contact replies use the same field names as the outbound API. Replies are queued instead of sent inside the webhook request.

## Developer Resources

- Swagger UI: `/docs`
- OpenAPI JSON: `/api/openapi`
- Prometheus: `/metrics`
- Postman: `docs/postman/whatsapp-gateway.postman_collection.json`
- Node SDK: `sdk/node`
- Python SDK: `sdk/python`
- Grafana dashboard: `deploy/grafana/whatsapp-gateway-dashboard.json`

## Backups and Upgrades

Back up these paths before every deployment:

```text
data/gateway.db
data/gateway.db-wal
data/gateway.db-shm
public/media/
```

Schema upgrades are additive and run at process startup. Legacy plaintext Baileys auth rows are encrypted automatically when read. Legacy filesystem sessions remain import-compatible.

The Nginx and systemd examples are in `deploy/`. Keep the database and media directory on persistent storage.

## Responsible Use

This project connects through WhatsApp Web using Baileys, not Meta's official Cloud API. Respect consent, opt-outs, rate limits, and WhatsApp policies. Use the official API where contractual enterprise compliance is required.
