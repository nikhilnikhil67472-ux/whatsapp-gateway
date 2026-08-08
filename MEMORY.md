# Relay WhatsApp AI Gateway - Comprehensive Project Memory

This file serves as the definitive context and architectural memory for **Claude Code** and AI assistants working on this repository.

---

## 1. Project Overview & Identity

- **Product Name**: Relay WhatsApp AI Gateway
- **Repository**: `nikhilnikhil67472-ux/whatsapp-gateway`
- **Purpose**: Production-grade, self-hosted middleware connecting WhatsApp Web (via `@whiskeysockets/baileys`) to external AI models (OpenAI, Anthropic), n8n automation workflows, and custom webhooks.
- **Tech Stack**:
  - **Framework**: Next.js 15 (App Router, Server Components, Route Handlers)
  - **Language**: TypeScript (Strict mode)
  - **Database**: SQLite via `better-sqlite3` (located at `data/gateway.db` or configurable via `SQLITE_DB_PATH`)
  - **Worker / Background Queue**: Node.js process (`src/worker/index.ts`) with SQLite polling or optional Redis + BullMQ
  - **Media Storage**: Local disk (`public/media/` or `data/media/`) or S3 / MinIO
  - **Observability**: Pino logging, Prometheus metrics (`/metrics`), Sentry integration
  - **Deployment**: Node.js 20+ on Linux (EC2 / Ubuntu), managed via PM2 or systemd (no Docker required)

---

## 2. Architecture & Process Model

The gateway operates on a dual-process architecture:

1. **Web Server Process** (`npm run start` or `npm run dev`):
   - Serves Next.js Dashboard UI and REST API.
   - Handles authentication, dashboard sessions, user management, and API key verification.
   - Enqueues background tasks (e.g. restart instance, send outbound message) into SQLite (`worker_commands`, `outbound_messages`).

2. **Background Worker Process** (`npm run worker`):
   - Single-instance (or lease-coordinated) background daemon (`src/worker/index.ts`).
   - Owns Baileys WhatsApp WebSocket connections.
   - Listens to connection updates, generates base64 QR codes, saves auth credentials.
   - Processes outbound message queues, delivers webhooks with HMAC signatures, and runs AI agent completions.

> ⚠️ **CRITICAL RULE**: Both processes MUST run simultaneously in production.
> - Dev mode: `npm run dev:all` (runs dev server + worker concurrently).
> - Production mode: `npm run start:all` or PM2 with `gateway-web` and `gateway-worker` in `ecosystem.config.cjs`.

---

## 3. Database & Data Access Patterns

- **DB Entrypoint**: `src/lib/db/index.ts`
- **Adapter Interface**: `src/lib/db/types.ts` (`SqliteAdapterContract`)
- **Active Adapter**: `src/lib/db/adapters/sqlite-adapter.ts`
- **Persistence Location**: `data/gateway.db` (along with `-wal` and `-shm` files).

### Identifier Lookup Pattern (`getInstanceByIdentifier`)
- `db.getInstance(id, orgId)`: Requires exact UUID match.
- `db.getInstanceByIdentifier(identifier, orgId)`: Supports looking up instances by **UUID OR `instance_name`**.
- **Rule**: ALL UI pages (`/dashboard/instances/[id]`) and API routes (`/api/instances/[id]`, `/status`, `/restart`) **MUST** use `db.getInstanceByIdentifier(id)` to prevent 404 errors when users navigate using instance names.

---

## 4. WhatsApp Engine & Baileys Lifecycle

- **Engine Code**: `src/lib/whatsapp-engine/`
  - `manager.ts`: Manages socket connections, QR generation, reconnect loops, and lifecycle state.
  - `session-store.ts`: Encrypts/decrypts Baileys auth credentials stored in `data/whatsapp-sessions/<instanceId>/`.
  - `events.ts`: Handles incoming messages, status updates, and auto-replies.
  - `send.ts`: Outbound text, media, location, voice note, and contact card dispatching.

### Status State Machine
- `created` ➡️ `connecting` ➡️ `waiting_qr` ➡️ `connected`
- Disconnections transition to `reconnecting` or `disconnected`.

### Troubleshooting Reconnect Loops / Stale Sessions
If an instance gets stuck in `reconnecting` status or fails to generate a QR code:
1. The Baileys session folder `data/whatsapp-sessions/<instanceId>/` contains invalid or expired credentials.
2. The worker needs to be stopped, the session folder deleted, and the DB status reset to `disconnected`.

---

## 5. Security & Authentication

- **Dashboard Auth**: Cookie-based session (`DASHBOARD_PASSWORD`, `AUTH_SECRET`).
- **API Key Auth**: Header `x-api-key` or `Authorization: Bearer <key>`. Keys are hashed in SQLite.
- **Hackathon / Public Demo Mode**:
  - Gated by `HACKATHON_PUBLIC_MODE=true` and `HACKATHON_PUBLIC_HOST`.
  - Defined in `src/lib/security/hackathon-public-mode.ts`.
  - **Rule**: Do not delete production authorization logic. Ensure production security remains strictly enforced when hackathon mode is disabled.

---

## 6. Key Routes & API Endpoints

- `/dashboard`: Redirects to `/dashboard/instances`.
- `/dashboard/instances`: List of all WhatsApp instances.
- `/dashboard/instances/[id]`: Instance control panel & setup status.
- `/dashboard/instances/[id]/qr`: QR code pairing interface.
- `/api/instances/create` (`POST`): Create a new instance.
- `/api/instances/[id]` (`GET`, `PATCH`, `DELETE`): Manage instance settings.
- `/api/instances/[id]/status` (`GET`): Poll connection status and base64 QR code.
- `/api/instances/[id]/restart` (`POST`): Trigger instance reconnection / fresh QR code.
- `/api/whatsapp/send` (`POST`): Dispatch text, media, or audio messages.
- `/docs`: Interactive Swagger OpenAPI documentation.

---

## 7. AWS Deployment & Operations Playbook

### PM2 Configuration (`ecosystem.config.cjs`)
- Process 1: `gateway-web` (`npm run start -- -H 127.0.0.1 -p 3000`)
- Process 2: `gateway-worker` (`npm run worker`)

### Deployment Procedure (AWS EC2 / Ubuntu)
```bash
cd ~/whatsapp-gateway
git pull origin main
npm install
npm run build
pm2 restart all
```

### Resetting Stuck Instance / QR Generation Fix on AWS
If QR code does not generate on AWS:
```bash
# 1. Install sqlite3 if missing
sudo apt update && sudo apt install -y sqlite3

# 2. Stop the worker process
pm2 stop gateway-worker

# 3. Delete stale session files for the instance
rm -rf data/whatsapp-sessions/<INSTANCE_ID>/

# 4. Reset DB status to disconnected
sqlite3 data/gateway.db "UPDATE whatsapp_instances SET status='disconnected', qr_base64=NULL WHERE id='<INSTANCE_ID>'"

# 5. Clear stuck worker commands
sqlite3 data/gateway.db "UPDATE worker_commands SET status='completed' WHERE instance_id='<INSTANCE_ID>'"

# 6. Restart worker & inspect logs
pm2 restart gateway-worker
pm2 logs gateway-worker --lines 30
```

---

## 8. Coding Guidelines for AI Agents (Claude Code / Cursor / Copilot)

1. **Always inspect before modifying**: Never guess API shapes, DB methods, or file paths.
2. **Preserve existing contracts**: Update invocations if function signatures are modified.
3. **Use `getInstanceByIdentifier`**: For all routes handling dynamic `[id]` parameters.
4. **Never commit secrets**: Do not track `.env`, `data/*.db`, `data/whatsapp-sessions/`, or logs.
5. **Run Verification**:
   - `npm run lint`
   - `npm run test`
   - `npm run build`
