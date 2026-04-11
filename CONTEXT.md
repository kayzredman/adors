# ADORS — Dev Session Context

> Paste this file to GitHub Copilot Chat at the start of any new session to restore full context.

---

## Project

- **Repo**: `E:/Dev/adors`
- **Active branch**: `feature/phase3-analytics` (merge to `dev` after each push)
- **Stack**: pnpm monorepo — Next.js (`apps/web`), Express API (`apps/api`), Supabase (auth + Postgres), Redis (job queue), Docker Compose (`infra/compose/`)
- **Start stack**: `docker compose -f infra/compose/docker-compose.dev.yml up -d`
- **Run migrations**: `pnpm db:migrate && pnpm db:seed`
- **Dev API**: `pnpm --filter api dev` → `http://localhost:4000`  ⚠️ MUST use pnpm dev (loads --env-file)
- **Dev Web**: `pnpm --filter web dev` → `http://localhost:3002`

### ⚠️ API Startup — Critical
Always start the API with `pnpm --filter api dev` or `cd apps/api && pnpm dev`.
**Never** run `tsx watch src/index.ts` directly — that skips `.env` loading, making Supabase fall back
to `http://localhost:54321` (non-existent), which causes 403 "User profile not found" on every request.

---

## Ports

| Service | Port |
|---------|------|
| Web (Next.js) | 3002 |
| API (Express) | 4000 |
| Supabase Kong | 8000 |
| GoTrue (direct, test scripts only) | 9999 |
| PostgREST | 3001 |
| Supabase DB | 5432 |
| Redis | 6379 |

---

## Admin Account

| Field | Value |
|-------|-------|
| Email | `admin@adors.local` |
| Password | `admin1234` |
| Role | `super_admin` |
| `app_metadata.role` | `super_admin` |
| `onboarded` | `true` |

---

## Architecture Rules

| Rule | Detail |
|------|--------|
| Chart data format | `{ t: ISO string, v: number }` — what `MetricChart`/`Sparkline` read via `dataKey="v"` |
| Adapter return shape | All live adapters return **flat** top-level keys matching the mock adapter (no nested objects) |
| ESM interop | All three drivers need `const driver = (mod as any).default ?? mod` after dynamic import |
| `initOracleClient()` | May be called **at most once** per Node process — use `_thickInitDone` guard |
| API client URL | `NEXT_PUBLIC_API_URL` → `http://localhost:4000`. All fetch calls go to `/api/...` on this base |
| Table name | `user_profiles` (NOT `profiles`) |
| API route prefix | All routes are `/api/...` (e.g. `/api/me`, `/api/admin/users`) |

---

## Kong Configuration (`infra/compose/kong.yml`)

**Key rule**: `auth-v1` service has **no `key-auth` plugin** — GoTrue validates its own JWTs.
Removing `key-auth` from auth routes eliminates the class of bug where a mismatched anon key
breaks all browser authentication silently.

PostgREST (`rest-v1`) still requires `key-auth` + `acl`.

`SUPABASE_ANON_KEY` in `apps/api/.env` must exactly match `consumers[anon].keyauth_credentials[0].key` in `kong.yml`.

---

## Auth & User Management System

### Routes (`apps/api/src/routes/`)
| File | Routes |
|------|--------|
| `me.ts` | `GET /api/me`, `PATCH /api/me` |
| `admin.ts` | `GET/POST /api/admin/users`, `POST /api/admin/users/invite`, `POST /api/admin/users/reinvite/:id`, `PATCH /api/admin/users/:id/role`, `PATCH /api/admin/users/:id/name`, `POST /api/admin/users/:id/deactivate`, `POST /api/admin/users/:id/reactivate` |

### `PATCH /api/me`
Sets `onboarded = true` and optionally `full_name` in `user_profiles`. Called at end of onboarding.
This is the **only** place `onboarded` is set — missing this call = user perpetually shows "Invite pending".

### Invite Flow
1. Admin: `POST /api/admin/users/invite` → calls `adminClient.auth.admin.generateLink({type:'invite'})` → link in response
2. Resend email attempted if `RESEND_API_KEY` + `RESEND_FROM` are set
3. If Resend fails (or unconfigured) → catches error, returns `inviteLink` in response body (never throws to client)
4. Frontend shows **CopyLinkModal** when `result.inviteLink` is present
5. User opens link → `localhost:3002/onboarding/profile#access_token=...&type=invite`
6. **`setSession({access_token, refresh_token})`** called directly from hash — no `onAuthStateChange` race
7. User sets password + name → form submits → `PATCH /api/me` → `onboarded=true`
8. Redirect to `/`

### Onboarding Page (`apps/web/src/app/onboarding/profile/page.tsx`)
- Reads `access_token` + `refresh_token` from URL hash
- Calls `supabase.auth.setSession()` directly (not `onAuthStateChange`) — eliminates race condition where `INITIAL_SESSION` fires instead of `SIGNED_IN`
- Clears hash from URL after token exchange so refresh doesn't reuse consumed token
- `tokenTimeout` state: if `setSession` rejects → shows "Invite link expired" error immediately

### Middleware (`apps/web/src/middleware.ts`)
- `getUser()` wrapped in `try/catch` — falls back to `getSession()` cookie if Kong is unreachable
- Prevents authenticated users being bounced to `/login` during Kong cold start

---

## Adapter Files

### `apps/api/src/adapters/oracleAdapter.ts`
- Thin→thick auto-fallback on **NJS-138** (Oracle 11g needs thick mode)
- `findOracleClientDir()` — recursive scan (5 levels) of `ORACLE_LIB_DIR`, `ORACLE_HOME`, `C:\oracle\*`, `C:\app\*`, `C:\Program Files\Oracle` for `oci.dll`
- `ensureThickInit(oracledb)` — once-guard around `initOracleClient()`
- `getOracleConnection(creds)` — thin attempt → NJS-138 catch → thick retry → clear error if no client found
- Privilege support: `creds.options.privilege` → `SYSDBA` / `SYSOPER`

**Oracle version compatibility fixes (all applied):**
| Issue | Fix |
|-------|-----|
| `ORA-00904 VERSION_FULL` | Use `VERSION` column (exists 8i+; `VERSION_FULL` is 18c+ only) |
| `ORA-00933 FETCH FIRST` | Use `SELECT * FROM (... ORDER BY ...) WHERE ROWNUM <= n` (12c+ syntax broken on 11g) |
| `NJS-098 bind placeholders` | Use `:1,:2,...` not `?` for Oracle bind variables |

### `apps/api/src/adapters/mssqlAdapter.ts`
- ESM interop on both `getHealthMetrics` and `testConnection`
- `#queryVersion` split into two separate queries — `(SELECT...) AS col` subquery is invalid T-SQL
- Flat keys: `active_connections`, `buffer_pool_memory_pct`, `cpu_usage_pct`, `uptime_days`, `os`, `cpus`
- All charts: `{ t, v }`

### `apps/api/src/adapters/mariadbAdapter.ts`
- ESM interop on both methods
- Flat keys: `active_connections`, `innodb_buffer_hit_ratio_pct`, `queries_per_sec`, `replication_running`
- All charts: `{ t, v }`

---

## healthScanner (`apps/api/src/services/healthScanner.ts`)

`deriveScore()` reads these flat keys:
- `storage_data_pct`, `sessions_blocked`, `buffer_pool_memory_pct`, `innodb_buffer_hit_ratio_pct`, `replication_lag_sec`

---

## Database

### Migrations Applied
| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Core tables: connections, health_snapshots, alerts, scripts, activity_log |
| `002_user_profile_trigger.sql` | Auto-create user_profiles row on GoTrue user insert |
| `003_credentials_vault.sql` | Encrypted credential storage |
| `004_oracle_privilege.sql` | `ALTER TABLE connections ADD COLUMN oracle_privilege TEXT CHECK IN ('SYSDBA','SYSOPER')` |
| `005_chat_sessions.sql` | Chat session persistence per user + bot |
| `006_user_management.sql` | user_profiles: role, onboarded, deactivated_at columns |

### Real Connections
| Name | Type | Notes |
|------|------|-------|
| UAT_AML_FCC_DB | Oracle | UAT |
| PROD_AML_FCC_DB | Oracle | Production |
| PROD_AML_EDQ_DB | Oracle | Production |
| DB STAGING BOX | MSSQL | UAT |
| REPORTSDB | Oracle 11g | `10.236.200.52:1521` — needs Oracle Instant Client for thick mode |
| FINTRAK_STAGING | Oracle | `10.236.9.170:1521` |
| UAT_MARIADB_DB_STAGING | MariaDB | `10.236.210.160:3306` |

---

## Oracle 11g — Instant Client

REPORTSDB runs Oracle 11g. Thin mode (`oracledb` default) only supports 12.1+.

**Auto-detection**: The adapter will find Instant Client automatically if installed at any standard path. No env vars needed unless it's in a non-standard location.

**If not installed**: Download [Oracle Instant Client Basic Light (WinX64)](https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html), extract to `C:\oracle\instantclient_21_13\`. The API will detect it on next restart.

**Manual override** (optional, in `apps/api/.env`):
```
ORACLE_THICK_CLIENT=true
ORACLE_LIB_DIR=C:\oracle\instantclient_21_13
```

---

## Agent Tool Calling

- `packages/agents/src/index.ts`: 3 tools — `get_fleet_health`, `execute_query`, `get_analytics`
- `streamChat(botId, history, context, onToolCall?)` — 5-round tool-call loop
- Role gate: `execute_query` requires `dba` or above
- All SQL validated: SELECT/WITH/EXPLAIN/DESCRIBE/SHOW only

---

## Next Steps (priority order)

1. **Settings page** — `/settings`: update display name, change password, TOTP enrol/unenrol post-onboarding
2. **API AAL enforcement** — check `aal` claim in `requireAuth`: users with verified TOTP must present `aal2` for sensitive routes
3. **WhatsApp/Teams notifications** — alert webhooks via Baileys / MS Teams connector
4. **Docker prod hardening** — HTTPS, prod compose, security headers audit

---

## Architecture Rules

| Rule | Detail |
|------|--------|
| Chart data format | `{ t: ISO string, v: number }` — what `MetricChart`/`Sparkline` read via `dataKey="v"` |
| Adapter return shape | All live adapters return **flat** top-level keys matching the mock adapter (no nested objects) |
| ESM interop | All three drivers need `const driver = (mod as any).default ?? mod` after dynamic import |
| `initOracleClient()` | May be called **at most once** per Node process — use `_thickInitDone` guard |

---

## Adapter Files

### `apps/api/src/adapters/oracleAdapter.ts`
- Thin→thick auto-fallback on **NJS-138** (Oracle 11g needs thick mode)
- `findOracleClientDir()` — recursive scan (5 levels) of `ORACLE_LIB_DIR`, `ORACLE_HOME`, `C:\oracle\*`, `C:\app\*`, `C:\Program Files\Oracle` for `oci.dll`
- `ensureThickInit(oracledb)` — once-guard around `initOracleClient()`
- `getOracleConnection(creds)` — thin attempt → NJS-138 catch → thick retry → clear error if no client found
- Privilege support: `creds.options.privilege` → `SYSDBA` / `SYSOPER`

**Oracle version compatibility fixes (all applied):**
| Issue | Fix |
|-------|-----|
| `ORA-00904 VERSION_FULL` | Use `VERSION` column (exists 8i+; `VERSION_FULL` is 18c+ only) |
| `ORA-00933 FETCH FIRST` | Use `SELECT * FROM (... ORDER BY ...) WHERE ROWNUM <= n` (12c+ syntax broken on 11g) |
| `NJS-098 bind placeholders` | Use `:1,:2,...` not `?` for Oracle bind variables |

### `apps/api/src/adapters/mssqlAdapter.ts`
- ESM interop on both `getHealthMetrics` and `testConnection`
- `#queryVersion` split into two separate queries — `(SELECT...) AS col` subquery is invalid T-SQL
- Flat keys: `active_connections`, `buffer_pool_memory_pct`, `cpu_usage_pct`, `uptime_days`, `os`, `cpus`
- All charts: `{ t, v }`

### `apps/api/src/adapters/mariadbAdapter.ts`
- ESM interop on both methods
- Flat keys: `active_connections`, `innodb_buffer_hit_ratio_pct`, `queries_per_sec`, `replication_running`
- All charts: `{ t, v }`

---

## healthScanner (`apps/api/src/services/healthScanner.ts`)

`deriveScore()` reads these flat keys:
- `storage_data_pct`, `sessions_blocked`, `buffer_pool_memory_pct`, `innodb_buffer_hit_ratio_pct`, `replication_lag_sec`

---

## Database

### Migration 004 — Oracle Privilege
```sql
ALTER TABLE connections ADD COLUMN oracle_privilege TEXT CHECK (oracle_privilege IN ('SYSDBA', 'SYSOPER'));
```
- Applied. Dropdown in connections form shown only when `db_type === 'oracle'`.

### Real Connections
| Name | Type | Notes |
|------|------|-------|
| UAT_AML_FCC_DB | Oracle | UAT |
| PROD_AML_FCC_DB | Oracle | Production |
| PROD_AML_EDQ_DB | Oracle | Production |
| DB STAGING BOX | MSSQL | UAT |
| REPORTSDB | Oracle 11g | `10.236.200.52:1521` — needs Oracle Instant Client for thick mode |
| FINTRAK_STAGING | Oracle | `10.236.9.170:1521` |
| UAT_MARIADB_DB_STAGING | MariaDB | `10.236.210.160:3306` |

---

## Oracle 11g — Instant Client

REPORTSDB runs Oracle 11g. Thin mode (`oracledb` default) only supports 12.1+.

**Auto-detection**: The adapter will find Instant Client automatically if installed at any standard path. No env vars needed unless it's in a non-standard location.

**If not installed**: Download [Oracle Instant Client Basic Light (WinX64)](https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html), extract to `C:\oracle\instantclient_21_13\`. The API will detect it on next restart.

**Manual override** (optional, in `apps/api/.env`):
```
ORACLE_THICK_CLIENT=true
ORACLE_LIB_DIR=C:\oracle\instantclient_21_13
```

---

## Commits (this phase)

```
78cf456  fix: ROWNUM subquery not FETCH FIRST (ORA-00933, Oracle 11g)
e16265e  fix: VERSION not VERSION_FULL (ORA-00904, Oracle 11g)
2ea3516  fix: deep recursive scan for oci.dll (C:\app\user\product\...\bin)
5ec7e66  feat: auto-detect Oracle Instant Client (findOracleClientDir)
19b68a4  fix: Oracle 11g thick mode + initOracleClient once-guard
864c2ac  fix: MSSQL ESM interop + flat keys + queryVersion SQL
ff8b6ce  fix: MariaDB ESM interop + flat keys
```

## Phase 3 Commits (feature/phase3-analytics)

```
2a3d280  feat: Option B theme — always-dark sidebar, blue-grey light content tokens
0e1a384  fix: HealthGauge clipping — scale font, overflow:hidden, explicit container height
9f3759d  feat: configurable auto-refresh on connection detail page (Off/30s/1m/5m)
fdcbc38  feat: Oracle Data Guard / HA state (v$database, v$archive_dest, v$dataguard_*)
c5ea50a  feat: MSSQL HA state — Always On AG / Log Shipping / Mirroring + HaStateCard UI
d0f8202  feat: backup history + disk utilization panels for Oracle, MSSQL, MariaDB
```

---

## Next Steps

### Remaining Build List (in priority order)

1. **`/alerts`** — Alert management page
   - List all alerts with filter by severity (critical/warning/info) and status (active/acknowledged/resolved)
   - Acknowledge and resolve actions (role-gated: dba+ can acknowledge, dba+ can resolve)
   - API: `GET /api/alerts`, `PATCH /api/alerts/:id`

2. **`/scripts`** — Remediation scripts runner
   - List scripts filtered by db_type and risk_level
   - Risk-gated execution: zero/low needs dba, medium+ needs super_admin confirmation
   - API: `GET /api/scripts`, `POST /api/sandbox` (execute sandboxed)

3. **`/chat`** — AI agent interface
   - Uses `packages/agents` (GitHub Models / OpenAI)
   - Per-connection context injection
   - API: streaming endpoint for agent responses

4. **User management** — invite users, assign roles, profile settings
