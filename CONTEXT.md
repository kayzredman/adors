# ADORS — Dev Session Context

> Paste this file to GitHub Copilot Chat at the start of any new session to restore full context.

---

## Project

- **Repo**: `E:/Dev/adors`
- **Branch**: `feature/phase2-missing-ui-live-adapters`
- **Stack**: pnpm monorepo — Next.js (`apps/web`), Hono API (`apps/api`), Supabase (auth + Postgres), Redis (job queue), Docker Compose (`infra/compose/`)
- **Start stack**: `docker compose -f infra/compose/docker-compose.dev.yml up -d`
- **Run migrations**: `pnpm db:migrate && pnpm db:seed`
- **Dev API**: `pnpm --filter api dev` → `http://localhost:4000`
- **Dev Web**: `pnpm --filter web dev` → `http://localhost:3002`

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

---

## Next Steps

### Analytics pages (not yet started)

1. **`/analytics`** — Fleet health dashboard
   - Score trends over time
   - Production vs UAT average comparison
   - Worst performers leaderboard
   - API endpoint: `GET /api/analytics/fleet?days=7`

2. **`/connections/:id/analytics`** — Per-connection deep dive
   - 30-day sparklines for all metrics
   - API endpoint: `GET /api/analytics/:id?days=30`

3. Detail pages (`/connections/:id`) stay exactly as-is.
