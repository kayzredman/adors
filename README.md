# ADORS — Agentic Database Observability & Remediation System

> Enterprise-grade AI-powered Database SRE platform. Proactive monitoring, autonomous remediation, and multi-agent intelligence for Oracle, MSSQL, and MariaDB fleets.

---

## What is ADORS?

ADORS is a self-hosted AIOps platform that replaces reactive database monitoring with **autonomous, context-aware agents** that observe, diagnose, and remediate database issues — before they become incidents.

Each database type gets a dedicated AI agent (OraBot, MsBot, MarBot) backed by **GitHub Models API** (Claude / GPT-4o), equipped with database-specific tools and constrained by strict RBAC. Scripts are always tested in UAT sandboxes before production execution.

---

## Core Modules

| Module | Description |
|--------|-------------|
| **Mission Control Dashboard** | Live fleet health overview — arc gauges, blocked sessions, active alerts, real-time activity feed |
| **Bot Chat Hub** | Three parallel agent panels — chat directly with OraBot, MsBot, MarBot for contextual diagnosis |
| **Alerts Center** | Filterable alerts by severity & status with one-click acknowledge/resolve |
| **Script Library** | Remediation script catalog with risk levels, sandbox verification badges, UAT-first execution |
| **UAT Sandbox** | Safe execution environment — test every script before it touches production |
| **Connections Manager** | Register and manage all DB connections, trigger manual health scans |
| **Analytics** | Time-series health trends, tablespace growth projections, anomaly scoring |

---

## Tech Stack

```
Frontend    Next.js 15 + Tailwind CSS + shadcn/ui + Recharts
Backend     Node.js + Express (API server)
Agents      OpenAI SDK + GitHub Models API (Claude 3.7 / GPT-4o)
Queue       BullMQ + Redis 7
App DB      Supabase (self-hosted Postgres + Auth + Realtime)
DB Drivers  oracledb / mssql / mysql2
Messaging   Baileys (WhatsApp) + Teams Adaptive Cards
Infra       Docker Compose (dev / staging / prod)
```

---

## Agent Capabilities

### OraBot — Oracle Expert
**Tools:** `getTablespaceUsage` · `getBlockedSessions` · `getRedoLogSwitches` · `getTopSQLByIO` · `getSGAStats` · `execScript`

### MsBot — SQL Server Expert
**Tools:** `getDeadlocks` · `getExecutionPlans` · `getMemoryPressure` · `getBlockingSPIDs` · `getDMVStats` · `execScript`

### MarBot — MariaDB Expert
**Tools:** `getInnoDBBufferHitRate` · `getSlowQueryLog` · `getReplicationLag` · `getTableLocks` · `getConnectionPool` · `execScript`

---

## RBAC Roles

| Role | Permissions |
|------|-------------|
| `super_admin` | Full access — users, connections, scripts, exec in prod |
| `dba` | Execute scripts, manage alerts, full bot access |
| `analyst` | Read-only dashboard, bot chat (no exec), view alerts |
| `viewer` | Dashboard read-only, no bot access |

---

## Repository Structure

```
adors/
├── apps/
│   ├── web/                  # Next.js 15 frontend
│   │   └── src/
│   │       ├── app/          # App Router pages & layouts
│   │       ├── components/   # UI components
│   │       ├── lib/          # API clients, utils
│   │       └── hooks/        # React hooks
│   └── api/                  # Express API server
│       └── src/
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

- **Phase 1** — Project scaffold, auth, connections manager, health scanner (mock adapters)
- **Phase 2** — Live DB adapters (oracledb / mssql / mysql2), real health metrics
- **Phase 3** — Agent bots with tool-calling via GitHub Models API
- **Phase 4** — Script Library, UAT Sandbox execution engine
- **Phase 5** — Alerts Center, BullMQ cron jobs, Supabase Realtime UI
- **Phase 6** — WhatsApp (Baileys) + Teams notifications, audit log
- **Phase 7** — Analytics module, time-series trends, anomaly scoring
- **Phase 8** — Light theme, Docker prod hardening, security audit

---

## Quick Start (Development)

```bash
# Prerequisites: Docker, Node.js 22+, pnpm

git clone https://github.com/YOUR_ORG/adors.git
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
