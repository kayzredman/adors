# ADORS — Agentic Database Observability & Remediation System

> Self-hosted AIOps platform for Oracle, MSSQL, and MariaDB fleets. Real-time health monitoring, agentic AI chat with live tool calling, UAT-first script execution, full analytics history, and multi-user access control — all under one roof.

---

## What is ADORS?

ADORS replaces reactive database monitoring with **autonomous, context-aware agents** that observe, diagnose, and act — before issues become incidents.

Three specialist AI agents (OraBot, MsBot, MarBot) connect to your live database fleet via the GitHub Models API (GPT-4o-mini). They have access to **real-time health metrics, historical analytics, and tool-calling capability** — meaning they can run read-only diagnostic queries directly against your Oracle, MSSQL, and MariaDB instances mid-conversation, interpret the results, and suggest or execute remediation scripts after UAT sandbox verification.

All health data collected every minute is permanently stored and queryable for trend analysis — including backup history, tablespace growth, replication lag, and performance deltas across all DB types.

---

## Core Modules

| Module | Description |
|--------|-------------|
| **Mission Control** | Fleet health overview — arc gauges, blocked sessions, active alerts, real-time activity feed |
| **Bot Chat Hub** | OraBot / MsBot / MarBot — AI agents with live DB context and tool-calling (run queries, trend charts, diagnostics) |
| **Alerts Center** | Severity-ranked alerts with acknowledge/resolve actions, role-gated |
| **Script Library** | Remediation script catalog with risk labels, sandbox verification badges, UAT-first execution |
| **UAT Sandbox** | Safe execution environment — scripts always tested in UAT before touching production |
| **Connections Manager** | Register and manage all DB connections, trigger manual health scans |
| **Analytics** | Time-series health trends, tablespace growth projections, backup trends, anomaly scoring for every connection |
| **User Management** | Invite-based onboarding, role assignment, account deactivation — `super_admin` only |

---

## Architecture

### Top-Level Overview

```
Browser (Next.js :3002)
  │
  ├─► REST/fetch ──────────────────────────────► Express API (:4000)
  │     Bearer JWT (verified locally via JWT_SECRET)      │
  │                                                        ├─► Supabase Postgres (user_profiles, connections,
  │                                                        │   health_snapshots, alerts, scripts, activity_log,
  │                                                        │   chat_sessions)
  │                                                        ├─► Live DB fleet (Oracle / MSSQL / MariaDB adapters)
  │                                                        ├─► Redis / BullMQ (health scan job queues)
  │                                                        └─► GitHub Models API (GPT-4o-mini, SSE stream)
  │
  └─► Supabase Auth (:8000 via Kong)
        signIn / signOut / invite / token refresh
        GoTrue validates JWTs; Kong routes to GoTrue + PostgREST
```

### Detailed Service Architecture

```
┌─────────────────── apps/web  (Next.js 15, :3002) ───────────────────────┐
│  App Router pages:                                                        │
│    /                  Mission Control dashboard                           │
│    /chat              Bot Chat Hub (SSE streaming)                        │
│    /alerts            Alerts Center                                       │
│    /scripts           Script Library                                      │
│    /sandbox           UAT Sandbox + connection CRUD                       │
│    /analytics         Fleet + per-connection time-series                  │
│    /connections       Connection manager + detail panels                  │
│    /admin/users       User management (super_admin only)                  │
│    /login             Email/password + optional TOTP MFA challenge        │
│    /onboarding/profile  Invite token → set password + display name       │
│    /onboarding/mfa    Enrol TOTP (for roles with MFA required)            │
│    /setup             First-run admin account creation                    │
│                                                                           │
│  Key client libraries:                                                    │
│    @supabase/ssr (browser + server clients)                               │
│    Recharts (time-series charts)                                          │
│    shadcn/ui + Tailwind CSS                                               │
│    Lucide icons                                                           │
│                                                                           │
│  middleware.ts — JWT refresh + route guard:                               │
│    • Calls getUser() with try/catch — falls back to cookie session        │
│      if Kong/GoTrue is temporarily unreachable                            │
│    • Redirects unauthenticated → /login                                   │
│    • Redirects authenticated + /login → /                                 │
│    • /api/* and /onboarding/* routes are exempt                           │
└──────────────────────────┬──────────────────────────────────────────────┘
                           │ REST + SSE  (Bearer JWT)
┌──────────────────── apps/api  (Express 5, :4000) ───────────────────────┐
│  Auth middleware   → local JWT verify (SUPABASE_JWT_SECRET — no network) │
│  RBAC middleware   → role read from user_profiles cache (6-min TTL)      │
│  Rate limiter      → express-rate-limit per IP                           │
│                                                                           │
│  Routes:                                                                  │
│    GET    /api/me                    — own profile                        │
│    PATCH  /api/me                    — set onboarded=true + full_name     │
│    GET    /api/connections           — fleet list + latest health         │
│    GET    /api/connections/:id       — single connection detail           │
│    POST   /api/connections           — add connection                     │
│    PATCH  /api/connections/:id       — update connection                  │
│    DELETE /api/connections/:id       — remove connection                  │
│    POST   /api/connections/:id/scan  — trigger manual health scan         │
│    GET    /api/alerts                — alert list with filters            │
│    PATCH  /api/alerts/:id            — acknowledge / resolve              │
│    GET    /api/activity              — activity feed                      │
│    GET    /api/analytics/fleet       — fleet health trends                │
│    GET    /api/analytics/:id         — per-connection 30-day series       │
│    POST   /api/agents/chat           — SSE: agent chat + tool calling     │
│    POST   /api/sandbox               — sandboxed script execution         │
│    GET    /api/scripts               — remediation script catalog         │
│    GET    /api/admin/users           — list all users (super_admin)       │
│    POST   /api/admin/users/invite    — invite user via GoTrue + Resend    │
│    POST   /api/admin/users/reinvite/:id — resend invite link              │
│    PATCH  /api/admin/users/:id/role  — change user role                   │
│    PATCH  /api/admin/users/:id/name  — update display name               │
│    POST   /api/admin/users/:id/deactivate   — soft-deactivate             │
│    POST   /api/admin/users/:id/reactivate   — restore access             │
│                                                                           │
│  Workers (BullMQ):                                                        │
│    priority-scan  (every 1 min)   — critical + warning connections        │
│    routine-scan   (every 3 min)   — healthy connections                   │
│    → distributed lock via Redis SET NX (one leader across instances)     │
│    → batched (3 concurrent) to protect PostgREST connection pool         │
└──────────┬────────────────────────────────┬─────────────────────────────┘
           │                                │
┌──────────▼──────────┐      ┌─────────────▼────────────────────────────┐
│  Supabase (:8000)   │      │  DB Fleet (live adapters)                 │
│  – Postgres 15      │      │  oracleAdapter  → Oracle 11g–23c          │
│  – GoTrue auth      │      │    thin→thick auto-fallback (NJS-138)     │
│    (:9999 internal) │      │    SYSDBA/SYSOPER privilege support       │
│  – PostgREST API    │      │  mssqlAdapter   → SQL Server 2012–2022    │
│  – Kong gateway     │      │    DMV-backed metrics, wait stats         │
│    (auth routes:    │      │  mariadbAdapter → MariaDB 10.4+           │
│     no key-auth —  │      │    InnoDB, replication, slow query        │
│     GoTrue self-    │      │                                           │
│     validates JWTs) │      │  executeQuery() on all three              │
│                     │      │  → read-only SELECT only                  │
│  tables:            │      │  → 10s timeout                            │
│  connections        │      │  → audit logged to activity_log           │
│  health_snapshots   │      └───────────────────────────────────────────┘
│  alerts             │
│  scripts            │      ┌─────────────────────────────────────────┐
│  activity_log       │      │  packages/agents                         │
│  user_profiles      │      │  streamChat() — async generator          │
│  chat_sessions      │      │  Tool definitions (OpenAI function spec) │
└─────────────────────┘      │  buildContextBlock() — live fleet summary│
                             │  GitHub Models API (GPT-4o-mini)         │
┌─────────────────────┐      │    → tool_call loop (max 5 rounds)       │
│  Redis (:6379)      │      │    → execute_query / get_fleet_health    │
│  BullMQ job queues  │      │    → trend_chart / get_analytics         │
│  Scheduler lock     │      └─────────────────────────────────────────┘
└─────────────────────┘
```

---

## Agent Tool Calling

Each bot can invoke database tools mid-conversation. The API executes them via the real adapter and feeds results back to the model — the bot never has raw credentials.

### Available Tools (all bots)
| Tool | What it does |
|------|--------------|
| `get_fleet_health` | Returns live health scores, alerts, blocked sessions for all connections this bot monitors |
| `execute_query` | Runs a read-only SELECT on a specific connection (10s timeout, audit logged) |
| `get_analytics` | Returns time-series health score trend for a connection over N days |

### OraBot — Oracle Expert
**Specialist queries:** tablespace usage · blocked sessions · redo log switches · top SQL by I/O · SGA/PGA stats · Data Guard lag · backup history (`v$backup_set`, `v$backup_piece`) · active waits (`v$session_wait`)

### MsBot — SQL Server Expert
**Specialist queries:** DMV wait stats · blocking SPIDs · buffer pool pressure · plan cache · AG sync state · log space usage · index fragmentation · backup history (`msdb..backupset`)

### MarBot — MariaDB Expert
**Specialist queries:** InnoDB buffer hit ratio · replication lag (`SHOW SLAVE STATUS`) · slow query log · long-running transactions · Galera state · connection pool saturation · backup history

### Safety model
- SQL validated at API layer: `SELECT` / `WITH` / `EXPLAIN` only — any DML/DDL rejected before execution
- Credentials resolve through vault — bot never sees host/user/password
- Every tool call written to `activity_log` with user ID, connection, query text, timing
- Role gate: `analyst` cannot trigger `execute_query` — requires `dba` or above

---

## Data Retention & Analytics

Every health scan is permanently stored in `health_snapshots`. This builds a time-series corpus for:
- Health score trends (fleet-wide and per connection)
- Tablespace growth projections
- Replication lag history
- Backup frequency and size trends (once backup metrics are collected)
- Anomaly detection — score drops, session spikes, alert frequency

All analytics data is queryable via `/api/analytics` and surfaced in the Analytics page with Recharts time-series panels.

---

## Tech Stack

```
Frontend    Next.js 15 · App Router · Tailwind CSS · shadcn/ui · Recharts · @supabase/ssr
Backend     Node.js 22 · Express 5 · TypeScript (ESM)
Auth        Supabase GoTrue (self-hosted) · invite-based signup · optional TOTP MFA
Agents      OpenAI SDK · GitHub Models API (GPT-4o-mini) · tool calling loop
Queue       BullMQ · Redis 7 · distributed leader election via SET NX
App DB      Supabase (self-hosted Postgres 15 · GoTrue · PostgREST · Kong)
              Kong: auth routes have no key-auth — GoTrue validates its own JWTs
DB Drivers  oracledb v6 (thin + thick) · mssql · mysql2
Infra       Docker Compose (dev / prod) · pnpm monorepo · Turborepo
```

---

## RBAC

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access — user management, connections, scripts, production execution, all analytics |
| `dba` | Execute scripts, manage alerts, tool calling in bot, full analytics, connection management |
| `analyst` | Read dashboard + analytics, bot chat read-only (no tool execution), acknowledge alerts |
| `viewer` | Dashboard read-only, no bot access, no alert actions |

> Role is stored in `user_profiles.role` and cached in the API auth middleware (6-min TTL).
> `super_admin` role is also written to GoTrue `app_metadata.role` for JWT-level verification.

---

## Repository Structure

```
adors/
├── apps/
│   ├── web/                        # Next.js 15 frontend  (:3002)
│   │   └── src/
│   │       ├── app/                # App Router pages
│   │       │   ├── page.tsx        # Mission Control dashboard
│   │       │   ├── chat/           # Bot Chat Hub (SSE)
│   │       │   ├── alerts/         # Alerts Center
│   │       │   ├── scripts/        # Script Library
│   │       │   ├── sandbox/        # UAT Sandbox + connection CRUD
│   │       │   ├── analytics/      # Analytics (fleet + per-connection)
│   │       │   ├── connections/    # Connections manager + detail panels
│   │       │   ├── admin/users/    # User management (super_admin only)
│   │       │   ├── login/          # Login + TOTP MFA challenge
│   │       │   ├── onboarding/     # profile/ (invite accept) + mfa/ (TOTP setup)
│   │       │   └── setup/          # First-run admin bootstrap
│   │       ├── components/
│   │       │   ├── dashboard/      # Health cards, gauges, activity feed
│   │       │   ├── connections/    # Shared ConnectionPanel component
│   │       │   ├── layout/         # Sidebar, nav, RoleGuard
│   │       │   └── ui/             # shadcn base components
│   │       ├── lib/
│   │       │   ├── api.ts          # Typed API client (all endpoints)
│   │       │   └── supabase/       # browser.ts + server.ts clients
│   │       └── middleware.ts       # JWT refresh + route guard (Kong-resilient)
│   │
│   └── api/                        # Express API server  (:4000)
│       └── src/
│           ├── index.ts            # App bootstrap, graceful shutdown
│           ├── routes/
│           │   ├── me.ts           # GET + PATCH /api/me
│           │   ├── connections.ts  # Connection CRUD + scan trigger
│           │   ├── alerts.ts       # Alert list + ack/resolve
│           │   ├── activity.ts     # Activity feed
│           │   ├── analytics.ts    # Fleet + per-connection trends
│           │   ├── agents.ts       # SSE chat + tool calling
│           │   ├── sandbox.ts      # Script execution engine
│           │   ├── scripts.ts      # Script catalog
│           │   └── admin.ts        # User management (invite, roles, deactivate)
│           ├── services/
│           │   ├── healthScanner.ts  # Scan orchestration, batching
│           │   ├── connectionService.ts
│           │   └── activityService.ts
│           ├── adapters/
│           │   ├── oracleAdapter.ts  # thin→thick, 11g compat, executeQuery
│           │   ├── mssqlAdapter.ts   # DMV metrics, executeQuery
│           │   ├── mariadbAdapter.ts # InnoDB/replication, executeQuery
│           │   ├── credentialResolver.ts  # Vault / env credential fetch
│           │   └── types.ts          # DbAdapter interface (incl. executeQuery)
│           ├── workers/
│           │   ├── healthScanWorker.ts  # BullMQ worker + leader election
│           │   └── index.ts
│           ├── middleware/
│           │   ├── auth.ts           # JWT verify + role cache
│           │   └── rateLimit.ts
│           └── config/
│               ├── supabase.ts
│               └── redis.ts
│
├── packages/
│   ├── agents/                     # Shared agent library
│   │   └── src/index.ts            # streamChat(), tool definitions,
│   │                               # buildContextBlock(), fleet context
│   ├── db/
│   │   ├── migrations/             # SQL schema migrations (001–006)
│   │   └── seeds/                  # Dev seed data
│   └── shared/                     # Shared TypeScript types
│       └── src/index.ts            # DbConnection, HealthSnapshot, Alert, etc.
│
├── infra/
│   ├── docker/                     # Per-service Dockerfiles
│   ├── compose/                    # docker-compose.dev.yml / prod.yml + kong.yml
│   └── nginx/                      # Reverse proxy (dev.conf)
│
└── CONTEXT.md                      # Dev session context (paste to restore state)
```

---

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ | Scaffold, auth, connections manager, health scanner (mock) |
| **Phase 2** | ✅ | Live DB adapters — Oracle (11g+), MSSQL, MariaDB |
| **Phase 3** | ✅ | Analytics, activity feed, alerts, scripts, sandbox (shell pages) |
| **Phase 4** | ✅ | Bot Chat Hub — SSE streaming, live fleet context injection, worker flood prevention |
| **Phase 5** | ✅ | Agentic tool calling — bots run queries, return charts, diagnose live data |
| **Phase 6** | ✅ | Script execution engine — sandbox verify → prod exec, audit trail |
| **Phase 7** | ✅ | User management — invite flow, role assignment, admin page, onboarding |
| **Phase 8** | Next | Settings page — user profile, password change, TOTP enrol/unenrol |
| **Phase 9** | Next | WhatsApp (Baileys) + Teams notifications, alert webhooks |
| **Phase 10** | Planned | Docker prod hardening, security audit, AAL2 enforcement |

---

## Quick Start (Development)

```bash
# Prerequisites: Docker, Node.js 22+, pnpm

git clone https://github.com/kayzredman/adors.git
cd adors
pnpm install

# Copy and configure environment
cp apps/api/.env.example apps/api/.env   # add GITHUB_TOKEN, DB creds
# (apps/web reads NEXT_PUBLIC_API_URL from next.config.ts — no .env needed for dev)

# Start the full stack
docker compose -f infra/compose/docker-compose.dev.yml up -d

# Run migrations + seed
pnpm db:migrate && pnpm db:seed

# Start dev servers (each in its own terminal — do NOT use & background)
pnpm --filter api dev    # → http://localhost:4000
pnpm --filter web dev    # → http://localhost:3002
```

> ⚠️  Always start the API with `pnpm --filter api dev` — bare `tsx watch src/index.ts` skips `.env` loading, causing Supabase to fall back to `:54321` and every auth request to return 403.

---

## Key Environment Variables (`apps/api/.env`)

```bash
GITHUB_TOKEN=           # Classic PAT — no scopes needed for GitHub Models
SUPABASE_URL=           # http://localhost:8000 (Kong gateway)
SUPABASE_SERVICE_KEY=   # Supabase service role JWT
SUPABASE_JWT_SECRET=    # Must match GoTrue GOTRUE_JWT_SECRET
SUPABASE_ANON_KEY=      # Supabase anon JWT (must match kong.yml consumer key exactly)
REDIS_URL=              # redis://localhost:6379
DATABASE_URL=           # postgresql://postgres:...@localhost:5432/postgres
WEB_URL=                # http://localhost:3002 (used in invite email links)
RESEND_API_KEY=         # Optional — Resend email delivery
RESEND_FROM=            # Optional — verified sender domain (e.g. noreply@yourdomain.com)
                        # If not set, invite flow returns a copy-link modal instead of email
```

> ⚠️ `SUPABASE_ANON_KEY` in `apps/api/.env` must exactly match the key in `infra/compose/kong.yml`
> under `consumers[anon].keyauth_credentials[0].key` — any mismatch causes 401 on all browser auth calls.

---

## First-Run Setup

1. Start the stack and run migrations (`pnpm db:migrate && pnpm db:seed`)
2. Navigate to `http://localhost:3002/setup`
3. Create the first `super_admin` account
4. Log in, go to **Admin → User Management**, invite team members
5. Share the invite link (shown in copy-link modal if Resend is not configured)
6. Invited users open the link → set password → land on dashboard

DB credentials are stored per-connection via `credentials_ref` and resolved at scan time — never in top-level env vars in production.

---

## Security

- DB credentials stored encrypted — resolved by `credentialResolver.ts` at scan time, never logged
- All `execute_query` tool calls: SELECT-only validation, 10s timeout, full audit log
- RBAC enforced at API middleware — role checked against `user_profiles` with 5-minute cache
- Rate limiting on all endpoints (`express-rate-limit`)
- JWT verified locally (no GoTrue network round-trip per request)
- Scripts require UAT sandbox approval before any production execution

---

*ADORS — Built for DBA teams who need more than dashboards.*
│           ├── routes/       # REST endpoints
│           ├── services/     # Business logic
│           ├── agents/       # OraBot, MsBot, MarBot
│           ├── workers/      # BullMQ health scanner jobs
│           ├── middleware/   # Auth, RBAC, rate limiting
│           └── config/       # DB connections, env
├── packages/
│   ├── agents/               # Shared agent tool definitions
│   ├── db/                   # Supabase schema & migrations
│   └── shared/               # Shared TypeScript types
├── infra/
│   ├── docker/               # Per-service Dockerfiles
│   ├── compose/              # docker-compose per environment
│   └── nginx/                # Reverse proxy config
└── scripts/                  # DB seed scripts, setup utilities
```

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Stable, release-ready code. Protected — PR required. |
| `dev` | Active development integration branch |
| `prod` | Production deployment — mirrors last release tag |

**Flow:** `feature/* → dev → main (PR + review) → prod (tag + deploy)`

---

## Build Phases

| Phase | Status | Description |
|-------|--------|-------------|
| **Phase 1** | ✅ Complete | Project scaffold, auth, connections manager, health scanner (mock adapters) |
| **Phase 2** | ✅ Complete | Live DB adapters — oracledb / mssql / mysql2, real health metrics, detail panels |
| **Phase 3** | 🔨 Next | Analytics module — fleet health trends, per-connection 30-day deep dive |
| **Phase 4** | Planned | Agent bots with tool-calling via GitHub Models API (OraBot, MsBot, MarBot) |
| **Phase 5** | Planned | Script Library, UAT Sandbox execution engine |
| **Phase 6** | Planned | Alerts Center, BullMQ cron jobs, Supabase Realtime UI |
| **Phase 7** | Planned | WhatsApp (Baileys) + Teams notifications, audit log |
| **Phase 8** | Planned | Light theme, Docker prod hardening, security audit |

### Phase 2 — Live Adapters (Completed)
- **Oracle** (`oracledb` v6): thin/thick auto-detection, Oracle 11g support via Instant Client probe, SYSDBA/SYSOPER privilege, 11g SQL compatibility (`ROWNUM` instead of `FETCH FIRST`, `VERSION` instead of `VERSION_FULL`)
- **MSSQL** (`mssql`): DMV-backed metrics — wait types, blocking SPIDs, buffer pool, CPU, I/O
- **MariaDB** (`mysql2`): InnoDB buffer hit ratio, replication lag, query throughput
- All adapters: ESM interop, flat metric keys, `{t, v}` chart format
- Oracle thick mode: auto-scans `ORACLE_HOME`, `C:\oracle\*`, `C:\app\*` for `oci.dll` at startup (no manual config needed if Instant Client is at a standard path)

### Phase 3 — Analytics (Next)
- `/analytics` — Fleet health dashboard: score trends over time, prod vs UAT avg, worst performers
- `/connections/:id/analytics` — Per-connection 30-day metric sparklines and deep dive
- API: `GET /api/analytics/fleet?days=7` and `GET /api/analytics/:id?days=30`

---

## Quick Start (Development)

```bash
# Prerequisites: Docker, Node.js 22+, pnpm

git clone https://github.com/kayzredman/adors.git
cd adors
pnpm install

# Copy and configure environment files
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Start the full stack (Supabase + Redis + API + Web)
docker compose -f infra/compose/docker-compose.dev.yml up -d

# Run migrations
pnpm db:migrate

# Start dev servers (hot reload)
pnpm dev
```

---

## Environment Variables

See `apps/api/.env.example` and `apps/web/.env.example` for the full list.

Key variables:
```
GITHUB_TOKEN=          # GitHub Models API access
SUPABASE_URL=          # Self-hosted Supabase URL
SUPABASE_SERVICE_KEY=  # Supabase service role key
REDIS_URL=             # Redis connection string
ORACLE_UAT_DSN=        # Oracle UAT connection string
MSSQL_UAT_HOST=        # MSSQL UAT host
MARIADB_UAT_HOST=      # MariaDB UAT host
```

---

## Security

- All DB credentials stored encrypted — never in plain env files in production
- Scripts require UAT sandbox approval before production execution
- RBAC enforced at API middleware layer
- Rate limiting on all bot endpoints
- Audit log for every script execution and alert action

---

*ADORS — Built for Database Teams who demand more than dashboards.*
