/**
 * Oracle live adapter using the `oracledb` driver.
 *
 * Thin mode (default): no Instant Client needed, requires Oracle DB 12.1+.
 * Thick mode: auto-detected when thin fails with NJS-138 (Oracle 11g/older).
 *   Searches common Oracle Client / Instant Client install paths on Windows.
 *   Override with ORACLE_THICK_CLIENT=true and optional ORACLE_LIB_DIR.
 */

import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import type { DbAdapter, DbCredentials } from './types.js'

/** Reject anything that isn't a read-only statement. */
function validateReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/\/\*[\s\S]*?\*\//g, '').trim()
  const keyword = trimmed.split(/\s+/)[0]?.toUpperCase() ?? ''
  const allowed = new Set(['SELECT', 'WITH', 'EXPLAIN', 'DESCRIBE', 'SHOW'])
  if (!allowed.has(keyword)) {
    throw new Error(`Only read-only queries are allowed. Got: ${keyword}`)
  }
}

// initOracleClient() may only be called once per Node process.
let _thickInitDone  = false
let _thickAvailable: boolean | null = null   // null = not yet probed

/** Recursively scan `dir` up to `depth` levels for oci.dll / libclntsh.so */
function scanForOciDll(dir: string, depth: number): string | undefined {
  if (depth < 0) return undefined
  try {
    if (existsSync(join(dir, 'oci.dll')) || existsSync(join(dir, 'libclntsh.so'))) return dir
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const found = scanForOciDll(join(dir, entry.name), depth - 1)
      if (found) return found
    }
  } catch { /* skip unreadable */ }
  return undefined
}

function findOracleClientDir(): string | undefined {
  // Explicit override wins
  if (process.env.ORACLE_LIB_DIR) return process.env.ORACLE_LIB_DIR

  // ORACLE_HOME env (traditional full client / Oracle DB on the server itself)
  if (process.env.ORACLE_HOME) {
    const bin = join(process.env.ORACLE_HOME, 'bin')
    if (existsSync(join(bin, 'oci.dll'))) return bin
    if (existsSync(join(process.env.ORACLE_HOME, 'oci.dll'))) return process.env.ORACLE_HOME
  }

  // Common Windows roots — recurse up to 5 levels to handle
  //   C:\oracle\instantclient_21_13\oci.dll
  //   C:\app\user\product\19.0.0\client_1\bin\oci.dll
  for (const root of ['C:\\oracle', 'C:\\Oracle', 'C:\\app', 'C:\\Program Files\\Oracle']) {
    const found = scanForOciDll(root, 5)
    if (found) return found
  }
  return undefined
}

function ensureThickInit(oracledb: typeof import('oracledb')): boolean {
  if (_thickInitDone) return true
  const libDir = findOracleClientDir()
  try {
    oracledb.initOracleClient(libDir ? { libDir } : undefined)
    _thickInitDone  = true
    _thickAvailable = true
    console.log(`[oracleAdapter] Thick mode enabled${libDir ? ` (${libDir})` : ' (PATH)'}`)
    return true
  } catch (e: any) {
    _thickAvailable = false
    console.warn(`[oracleAdapter] Thick mode init failed: ${e.message}`)
    return false
  }
}

async function loadOracledb(): Promise<typeof import('oracledb')> {
  const mod = await import('oracledb').catch(() => {
    throw new Error('oracledb package not installed. Run: pnpm add oracledb')
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const oracledb: typeof import('oracledb') = (mod as any).default ?? mod

  // Eagerly probe for an Oracle Client on first load.
  // This ensures ALL connections use the same mode from the start — avoiding
  // NJS-106 race conditions when initOracleClient() is called mid-flight while
  // other connections are already open in thin mode.
  if (_thickAvailable === null) {
    ensureThickInit(oracledb)   // sets _thickAvailable to true|false (never null after this)
  }
  return oracledb
}

/** Connect — thick mode is already decided by loadOracledb() at first call. */
async function getOracleConnection(creds: DbCredentials): Promise<any> {
  const oracledb = await loadOracledb()
  const connParams = {
    user:          creds.username,
    password:      creds.password,
    connectString: `${creds.host}:${creds.port}/${creds.database}`,
    ...(creds.options?.['privilege'] === 'SYSDBA'  ? { privilege: oracledb.SYSDBA  } : {}),
    ...(creds.options?.['privilege'] === 'SYSOPER' ? { privilege: oracledb.SYSOPER } : {}),
  }

  try {
    return await oracledb.getConnection(connParams)
  } catch (err: any) {
    // NJS-138 = server version requires thick mode but no Oracle Client was found at startup
    if (err.message?.includes('NJS-138') || err.errorNum === 138) {
      throw new Error(
        'Oracle 11g requires Oracle Instant Client (thick mode). ' +
        'Install Instant Client from https://www.oracle.com/database/technologies/instant-client/winx64-64-downloads.html ' +
        'then set ORACLE_LIB_DIR=<install path> in apps/api/.env and restart the API.'
      )
    }
    throw err
  }
}

export class OracleAdapter implements DbAdapter {
  async getHealthMetrics(creds: DbCredentials): Promise<Record<string, unknown>> {
    const conn = await getOracleConnection(creds)

    try {
      const [
        dbProps, sessions, processes, waits, sga, tablespaces, redoLog, sysstat, backups, diskMounts, haState, osStats, pga,
      ] = await Promise.all([
        this.#queryDbProps(conn),
        this.#querySessions(conn),
        this.#queryProcesses(conn),
        this.#queryWaits(conn),
        this.#querySga(conn),
        this.#queryTablespaces(conn),
        this.#queryRedoLog(conn),
        this.#querySysstat(conn),
        this.#queryBackups(conn).catch(() => []),
        this.#queryDiskMounts(conn).catch(() => []),
        this.#queryHaState(conn).catch(() => ({ type: 'none', details: [] })),
        this.#queryOsStats(conn).catch(() => ({ physical_memory_gb: 0, free_memory_gb: 0, cpu_count: 0, cpu_idle_pct: 0, cpu_user_pct: 0, cpu_sys_pct: 0, cpu_busy_pct: 0 })),
        this.#queryPga(conn).catch(() => ({ target_gb: 0, allocated_gb: 0, freeable_gb: 0, max_gb: 0, cache_hit_pct: 0 })),
      ])

      return {
        adapter: 'live',
        // Server Info
        db_version:  dbProps.version,
        uptime_days: dbProps.uptime_days,
        os:          osStats.cpu_count > 0 ? `${osStats.cpu_count} CPUs` : 'Linux x86_64',
        cpus:        osStats.cpu_count,
        // Clients
        num_clients:     sessions.active,
        avg_response_ms: sysstat.avg_response_ms,
        network_in_kbs:  sysstat.net_in,
        network_out_kbs: sysstat.net_out,
        // Sessions (flat keys matching mock)
        sessions_active:   sessions.active,
        sessions_inactive: sessions.inactive,
        sessions_blocked:  sessions.blocked,
        sessions_total:    sessions.current,
        sessions_chart:    sessions.chart,
        // Processes (flat keys from processes array)
        num_dispatchers:       processes.find((p: any) => p.name?.includes('D0'))?.count ?? 1,
        num_shared_servers:    processes.find((p: any) => p.name?.includes('S0'))?.count ?? 0,
        num_dedicated_servers: sessions.current,
        num_parallel_servers:  0,
        num_busy_parallel:     0,
        num_job_servers:       0,
        // Execution rates (single-point charts)
        execution_rate_chart:  sysstat.execution_rate,
        parse_rate_chart:      sysstat.parse_rate,
        open_cursors_chart:    sysstat.open_cursors,
        commit_rate_chart:     sysstat.commit_rate,
        // Waits
        waits_chart:    waits.chart,
        wait_breakdown: waits.breakdown,
        // DB CPU
        db_cpu_ratio_pct: 0,
        db_cpu_chart:     [{ t: new Date().toISOString(), v: 0 }],
        // Memory
        db_block_rate_chart:   sysstat.db_block_rate_chart,
        logical_reads_chart:   sysstat.logical_reads_chart,
        redo_generated_chart:  sysstat.redo_generated_chart,
        sga_currently_used_gb: (sga.total_mb / 1024).toFixed(1),
        sga_maximum_size_gb:   (sga.total_mb / 1024).toFixed(1),
        buffer_cache_size_gb:  (sga.buffer_cache_mb / 1024).toFixed(1),
        redo_log_buffers_mb:   sga.redo_buffer_mb,
        shared_pool_size_gb:   (sga.shared_pool_mb / 1024).toFixed(1),
        large_pool_size_mb:    sga.large_pool_mb,
        // Storage
        storage_data_pct:  tablespaces.data?.used_pct ?? 0,
        storage_data_tb:   ((tablespaces.data?.used_gb ?? 0) / 1024).toFixed(1),
        storage_temp_pct:  tablespaces.temp?.used_pct ?? 0,
        storage_temp_gb:   tablespaces.temp?.used_gb ?? 0,
        storage_undo_pct:  tablespaces.undo?.used_pct ?? 0,
        storage_undo_gb:   tablespaces.undo?.used_gb ?? 0,
        storage_io_chart:  tablespaces.io_chart,
        tablespace_usage_pct: tablespaces.data?.used_pct ?? 0,
        // Redo Log
        redo_log_group:       redoLog.current_group ? `#${redoLog.current_group}` : null,
        redo_log_used_pct:    redoLog.used_pct,
        redo_log_size_gb:     0,
        redo_log_fill_chart:  redoLog.fill_chart,
        redo_log_sequence:    0,
        log_count_current:    redoLog.log_counts['CURRENT']  ?? 0,
        log_count_active:     redoLog.log_counts['ACTIVE']   ?? 0,
        log_count_inactive:   redoLog.log_counts['INACTIVE'] ?? 0,
        log_count_cleaning:   redoLog.log_counts['CLEARING'] ?? 0,
        log_count_unused:     redoLog.log_counts['UNUSED']   ?? 0,
        redo_log_switches_hr: 0,
        sga_hit_ratio_pct:    0,
        // Backup history (RMAN)
        backup_history: backups,
        // Blocking & I/O
        blocking_spids:       sessions.blocked,
        deadlocks_total:      sysstat.enqueue_deadlocks,
        disk_reads_per_sec:   sysstat.physical_reads,
        disk_writes_per_sec:  sysstat.physical_writes,
        io_chart:             [{ t: new Date().toISOString(), v: sysstat.physical_reads + sysstat.physical_writes }],
        // Disk / tablespace utilization
        disk_mounts:    diskMounts,
        // HA / Data Guard state
        ha_state:       haState,
        // OS-level metrics (from V$OSSTAT)
        os_physical_memory_gb: osStats.physical_memory_gb,
        os_free_memory_gb:     osStats.free_memory_gb,
        os_memory_usage_pct:   osStats.physical_memory_gb > 0
          ? Math.round((1 - osStats.free_memory_gb / osStats.physical_memory_gb) * 100)
          : 0,
        os_cpu_count:    osStats.cpu_count,
        os_cpu_idle_pct: osStats.cpu_idle_pct,
        os_cpu_user_pct: osStats.cpu_user_pct,
        os_cpu_sys_pct:  osStats.cpu_sys_pct,
        os_cpu_busy_pct: osStats.cpu_busy_pct,
        // PGA metrics (from V$PGASTAT)
        pga_target_gb:    pga.target_gb,
        pga_allocated_gb: pga.allocated_gb,
        pga_freeable_gb:  pga.freeable_gb,
        pga_max_gb:       pga.max_gb,
        pga_cache_hit_pct: pga.cache_hit_pct,
      }
    } finally {
      await conn.close()
    }
  }

  async testConnection(creds: DbCredentials): Promise<{ ok: boolean; latency_ms: number }> {
    const start = Date.now()
    try {
      const conn = await getOracleConnection(creds)
      await conn.execute('SELECT 1 FROM DUAL')
      await conn.close()
      return { ok: true, latency_ms: Date.now() - start }
    } catch {
      return { ok: false, latency_ms: Date.now() - start }
    }
  }

  async executeQuery(creds: DbCredentials, sql: string, timeoutMs = 10_000): Promise<import('./types.js').QueryResult> {
    validateReadOnlySql(sql)
    const conn = await getOracleConnection(creds)
    const start = Date.now()
    try {
      const timeoutHandle = setTimeout(() => { conn.close().catch(() => {}) }, timeoutMs)
      const result = await conn.execute(sql, [], { outFormat: 4002, maxRows: 500 })
      clearTimeout(timeoutHandle)
      const rawRows = (result.rows as Record<string, unknown>[]) ?? []
      const columns = result.metaData?.map((m: any) => String(m.name ?? '')) ?? Object.keys(rawRows[0] ?? {})
      const rows = rawRows.map(r => {
        const out: Record<string, unknown> = {}
        for (const col of columns) out[col] = r[col] ?? null
        return out
      })
      return { columns, rows, rowCount: rows.length, executionMs: Date.now() - start }
    } finally {
      await conn.close().catch(() => {})
    }
  }

  // ─── Private query helpers ─────────────────────────────────────────────────

  async #queryDbProps(conn: any) {
    // VERSION_FULL only exists on Oracle 18c+; VERSION exists on all versions (11g+)
    const { rows } = await conn.execute(
      `SELECT version, (SYSDATE - startup_time) * 24 AS uptime_h FROM v$instance`,
      [], { outFormat: 4002 },  // OBJECT format
    )
    const r = (rows as any[])[0] ?? {}
    return {
      version:     r.VERSION ?? 'unknown',
      uptime_days: Math.round((r.UPTIME_H ?? 0) / 24),
    }
  }

  async #querySessions(conn: any) {
    const { rows } = await conn.execute(
      `SELECT status, COUNT(*) AS cnt FROM v$session WHERE type = 'USER' GROUP BY status`,
      [], { outFormat: 4002 },
    )
    const byStatus: Record<string, number> = {}
    for (const row of (rows as any[])) byStatus[row.STATUS] = Number(row.CNT)

    const { rows: blockedRows } = await conn.execute(
      `SELECT COUNT(*) AS cnt FROM v$session WHERE blocking_session IS NOT NULL AND type = 'USER'`,
      [], { outFormat: 4002 },
    )
    const blocked = Number((blockedRows as any[])[0]?.CNT ?? 0)
    const active  = byStatus['ACTIVE'] ?? 0
    const inactive = byStatus['INACTIVE'] ?? 0
    const current = active + inactive

    return {
      current, active, inactive, blocked,
      chart: [{ t: new Date().toISOString(), v: current }],
    }
  }

  async #queryProcesses(conn: any) {
    const { rows } = await conn.execute(
      `SELECT * FROM (
         SELECT program, COUNT(*) AS cnt FROM v$process GROUP BY program ORDER BY cnt DESC
       ) WHERE ROWNUM <= 10`,
      [], { outFormat: 4002 },
    )
    return (rows as any[]).map(r => ({ name: r.PROGRAM ?? 'unknown', count: Number(r.CNT) }))
  }

  async #queryWaits(conn: any) {
    const { rows } = await conn.execute(
      `SELECT * FROM (
         SELECT event, time_waited, wait_class
         FROM v$system_event
         WHERE wait_class NOT IN ('Idle','Other')
         ORDER BY time_waited DESC
       ) WHERE ROWNUM <= 8`,
      [], { outFormat: 4002 },
    )
    const breakdown: Record<string, number> = {}
    const chart: { t: string; v: number }[] = []
    for (const r of (rows as any[])) {
      breakdown[r.EVENT] = Number(r.TIME_WAITED)
      chart.push({ t: new Date().toISOString(), v: Number(r.TIME_WAITED) })
    }
    return { breakdown, chart }
  }

  async #querySga(conn: any) {
    const { rows } = await conn.execute(
      `SELECT name, value FROM v$sga`,
      [], { outFormat: 4002 },
    )
    let total = 0, buffer_cache = 0, shared_pool = 0, large_pool = 0, redo_buffer = 0
    for (const r of (rows as any[])) {
      const mb = Number(r.VALUE) / 1024 / 1024
      total += mb
      if (r.NAME.includes('Buffer Cache'))  buffer_cache  = mb
      if (r.NAME.includes('Shared Pool'))   shared_pool   = mb
      if (r.NAME.includes('Large Pool'))    large_pool    = mb
      if (r.NAME.includes('Redo Buffers'))  redo_buffer   = mb
    }
    return { total_mb: Math.round(total), buffer_cache_mb: Math.round(buffer_cache), shared_pool_mb: Math.round(shared_pool), large_pool_mb: Math.round(large_pool), redo_buffer_mb: Math.round(redo_buffer) }
  }

  async #queryTablespaces(conn: any) {
    const { rows } = await conn.execute(
      `SELECT tablespace_name, used_percent, used_space * 8 / 1024 AS used_mb, tablespace_size * 8 / 1024 AS total_mb
       FROM dba_tablespace_usage_metrics
       WHERE tablespace_name IN ('USERS','TEMP','UNDOTBS1') OR tablespace_name = (SELECT default_tablespace FROM dba_users WHERE username = USER)
       ORDER BY 1`,
      [], { outFormat: 4002 },
    )

    const find = (name: string) => (rows as any[]).find(r => r.TABLESPACE_NAME?.includes(name))
    const toTs  = (r: any, type: string) => ({ type, name: r?.TABLESPACE_NAME ?? type.toUpperCase(), used_pct: Math.round(r?.USED_PERCENT ?? 0), used_gb: ((r?.USED_MB ?? 0) / 1024).toFixed(1), total_gb: ((r?.TOTAL_MB ?? 0) / 1024).toFixed(1) })

    return {
      data:     toTs(find('USER'), 'data'),
      temp:     toTs(find('TEMP'), 'temp'),
      undo:     toTs(find('UNDO'), 'undo'),
      io_chart: [{ t: new Date().toISOString(), v: 0 }],
    }
  }

  async #queryRedoLog(conn: any) {
    const { rows } = await conn.execute(
      `SELECT l.group#, l.status, l.bytes / 1024 / 1024 AS size_mb, l.members
       FROM v$log l ORDER BY l.group#`,
      [], { outFormat: 4002 },
    )

    const current = (rows as any[]).find(r => r.STATUS === 'CURRENT')
    const logCounts: Record<string, number> = {}
    for (const r of (rows as any[])) {
      logCounts[r.STATUS] = (logCounts[r.STATUS] ?? 0) + 1
    }

    return {
      current_group: current?.['GROUP#'] ?? null,
      used_pct:      0,
      fill_chart:    [{ t: new Date().toISOString(), v: 0 }],
      log_counts:    logCounts,
    }
  }

  async #querySysstat(conn: any) {
    const STATS = [
      'execute count', 'parse count (total)', 'opened cursors current',
      'user commits', 'db block gets', 'logical reads', 'redo size',
      'bytes sent via SQL*Net to client', 'bytes received via SQL*Net from client',
      'physical reads', 'physical writes', 'enqueue deadlocks',
    ]
    const binds = STATS.map((_, i) => `:${i + 1}`)
    const { rows } = await conn.execute(
      `SELECT name, value FROM v$sysstat WHERE name IN (${binds.join(',')})`,
      STATS, { outFormat: 4002 },
    )

    const now = new Date().toISOString()
    const get = (name: string) => Number((rows as any[]).find((r: any) => r.NAME === name)?.VALUE ?? 0)
    return {
      execution_rate:       [{ t: now, v: get('execute count') }],
      parse_rate:           [{ t: now, v: get('parse count (total)') }],
      open_cursors:         [{ t: now, v: get('opened cursors current') }],
      commit_rate:          [{ t: now, v: get('user commits') }],
      db_block_rate_chart:  [{ t: now, v: get('db block gets') }],
      logical_reads_chart:  [{ t: now, v: get('logical reads') }],
      redo_generated_chart: [{ t: now, v: get('redo size') / 1024 }],
      net_in:               Math.round(get('bytes received via SQL*Net from client') / 1024),
      net_out:              Math.round(get('bytes sent via SQL*Net to client') / 1024),
      avg_response_ms:      0,
      db_cpu_ratio:         0,
      physical_reads:       get('physical reads'),
      physical_writes:      get('physical writes'),
      enqueue_deadlocks:    get('enqueue deadlocks'),
    }
  }

  async #queryBackups(conn: any) {
    // v$rman_backup_job_details available Oracle 10g+
    const { rows } = await conn.execute(
      `SELECT * FROM (
         SELECT status, start_time, end_time,
           ROUND((end_time - start_time) * 24 * 60, 1) AS duration_min,
           ROUND(output_bytes / 1024 / 1024 / 1024, 2) AS size_gb,
           input_type
         FROM v$rman_backup_job_details
         ORDER BY start_time DESC
       ) WHERE ROWNUM <= 10`,
      [], { outFormat: 4002 },
    )
    return (rows as any[]).map(r => ({
      type:         r.INPUT_TYPE ?? 'RMAN',
      status:       r.STATUS ?? 'UNKNOWN',
      started_at:   r.START_TIME ? new Date(r.START_TIME).toISOString() : null,
      finished_at:  r.END_TIME   ? new Date(r.END_TIME).toISOString()   : null,
      duration_min: Number(r.DURATION_MIN ?? 0),
      size_gb:      Number(r.SIZE_GB ?? 0),
    }))
  }

  async #queryHaState(conn: any) {
    // ── 1. Data Guard (v$dataguard_status available 10g+) ──────────────────────
    // First determine DB role — works on all versions via v$database
    const roleRes = await conn.execute(
      `SELECT db_unique_name, database_role, protection_mode, protection_level,
              open_mode, log_mode
       FROM v$database`,
      [], { outFormat: 4002 },
    ).catch(() => null)

    const dbRow = roleRes?.rows?.[0]
    if (!dbRow) return { type: 'none' as const, details: [] }

    const role = String(dbRow.DATABASE_ROLE ?? '').trim()   // PRIMARY / PHYSICAL STANDBY / LOGICAL STANDBY / SNAPSHOT STANDBY
    const mode = String(dbRow.PROTECTION_MODE ?? '').trim() // MAXIMUM PROTECTION / AVAILABILITY / PERFORMANCE

    // Check archive destinations to detect if DG is configured
    const destRes = await conn.execute(
      `SELECT dest_name, target, archiver, schedule, destination,
              status, applied_scn, error
       FROM v$archive_dest
       WHERE target = 'STANDBY' AND status <> 'INACTIVE'`,
      [], { outFormat: 4002 },
    ).catch(() => ({ rows: [] }))

    const standbyDests = (destRes?.rows ?? []) as any[]

    // v$dataguard_status messages (10g+)
    const dgMsgRes = await conn.execute(
      `SELECT * FROM (
         SELECT message, timestamp, severity
         FROM v$dataguard_status
         ORDER BY timestamp DESC
       ) WHERE ROWNUM <= 5`,
      [], { outFormat: 4002 },
    ).catch(() => ({ rows: [] }))
    const dgMessages = ((dgMsgRes?.rows ?? []) as any[]).map(r => ({
      message:   String(r.MESSAGE ?? ''),
      timestamp: r.TIMESTAMP ? new Date(r.TIMESTAMP).toISOString() : null,
      severity:  String(r.SEVERITY ?? ''),
    }))

    // v$managed_standby — apply/redo state (standby side)
    const msRes = await conn.execute(
      `SELECT process, status, thread#, sequence#, block#, blocks
       FROM v$managed_standby
       WHERE process <> 'RFS' OR status <> 'IDLE'`,
      [], { outFormat: 4002 },
    ).catch(() => ({ rows: [] }))
    const managedProcs = ((msRes?.rows ?? []) as any[]).map(r => ({
      process:   String(r.PROCESS  ?? ''),
      status:    String(r.STATUS   ?? ''),
      thread:    Number(r['THREAD#'] ?? 0),
      sequence:  Number(r['SEQUENCE#'] ?? 0),
    }))

    // Lag from v$dataguard_stats (11g+) — graceful fallback
    const lagRes = await conn.execute(
      `SELECT name, value, time_computed
       FROM v$dataguard_stats
       WHERE name IN ('apply lag','transport lag','estimated startup time')`,
      [], { outFormat: 4002 },
    ).catch(() => ({ rows: [] }))
    const dgStats: Record<string, string> = {}
    for (const r of (lagRes?.rows ?? []) as any[]) {
      dgStats[String(r.NAME)] = String(r.VALUE ?? '')
    }

    // Only surface as 'dataguard' if either role is standby OR active dests exist
    const isDg = role !== 'PRIMARY' || standbyDests.length > 0
    if (isDg) {
      return {
        type:             'dataguard' as const,
        db_unique_name:   String(dbRow.DB_UNIQUE_NAME ?? ''),
        local_role:       role,
        protection_mode:  mode,
        open_mode:        String(dbRow.OPEN_MODE  ?? ''),
        log_mode:         String(dbRow.LOG_MODE   ?? ''),
        apply_lag:        dgStats['apply lag']     ?? null,
        transport_lag:    dgStats['transport lag'] ?? null,
        managed_procs:    managedProcs,
        recent_messages:  dgMessages,
        standby_dests:    standbyDests.map(r => ({
          dest_name:   String(r.DEST_NAME   ?? ''),
          destination: String(r.DESTINATION ?? ''),
          status:      String(r.STATUS      ?? ''),
          archiver:    String(r.ARCHIVER    ?? ''),
          error:       r.ERROR ? String(r.ERROR) : null,
        })),
        details: standbyDests.map(r => ({
          dest_name:   String(r.DEST_NAME   ?? ''),
          destination: String(r.DESTINATION ?? ''),
          status:      String(r.STATUS      ?? ''),
          error:       r.ERROR ? String(r.ERROR) : null,
        })),
      }
    }

    // ── 2. Streams / GoldenGate (best-effort) ─────────────────────────────────
    const ggRes = await conn.execute(
      `SELECT capture_name, status, error_number, error_message
       FROM dba_capture`,
      [], { outFormat: 4002 },
    ).catch(() => null)
    if (ggRes?.rows?.length) {
      return {
        type:       'streams' as const,
        local_role: 'SOURCE',
        details:    (ggRes.rows as any[]).map(r => ({
          capture_name:  String(r.CAPTURE_NAME   ?? ''),
          status:        String(r.STATUS         ?? ''),
          error_number:  r.ERROR_NUMBER  ? Number(r.ERROR_NUMBER) : null,
          error_message: r.ERROR_MESSAGE ? String(r.ERROR_MESSAGE) : null,
        })),
      }
    }

    return { type: 'none' as const, details: [] }
  }

  async #queryDiskMounts(conn: any) {
    // All tablespaces with used/free from dba_data_files + dba_free_space (11g+)
    const { rows } = await conn.execute(
      `SELECT df.tablespace_name,
              ROUND(df.total_gb, 2)                                  AS total_gb,
              ROUND(df.total_gb - NVL(fs.free_gb, 0), 2)            AS used_gb,
              ROUND(NVL(fs.free_gb, 0), 2)                           AS free_gb,
              CASE WHEN df.total_gb > 0
                   THEN ROUND((1 - NVL(fs.free_gb, 0) / df.total_gb) * 100, 1)
                   ELSE 0 END                                        AS used_pct
       FROM (SELECT tablespace_name, SUM(bytes)/1073741824 AS total_gb
             FROM dba_data_files GROUP BY tablespace_name) df
       LEFT JOIN (SELECT tablespace_name, SUM(bytes)/1073741824 AS free_gb
                  FROM dba_free_space GROUP BY tablespace_name) fs
              ON df.tablespace_name = fs.tablespace_name
       ORDER BY used_pct DESC`,
      [], { outFormat: 4002 },
    )
    return (rows as any[]).map(r => ({
      mount:    r.TABLESPACE_NAME,
      total_gb: Number(r.TOTAL_GB ?? 0),
      used_gb:  Number(r.USED_GB  ?? 0),
      free_gb:  Number(r.FREE_GB  ?? 0),
      used_pct: Number(r.USED_PCT ?? 0),
    }))
  }

  async #queryOsStats(conn: any) {
    // V$OSSTAT provides OS-level counters — available Oracle 10g+
    const { rows } = await conn.execute(
      `SELECT stat_name, value FROM v$osstat
       WHERE stat_name IN (
         'PHYSICAL_MEMORY_BYTES','FREE_MEMORY_BYTES',
         'NUM_CPUS','NUM_CPU_CORES',
         'IDLE_TIME','BUSY_TIME','USER_TIME','SYS_TIME'
       )`,
      [], { outFormat: 4002 },
    )
    const get = (name: string) => Number((rows as any[]).find((r: any) => r.STAT_NAME === name)?.VALUE ?? 0)
    const physBytes = get('PHYSICAL_MEMORY_BYTES')
    const freeBytes = get('FREE_MEMORY_BYTES')
    const idleTime  = get('IDLE_TIME')   // centiseconds
    const busyTime  = get('BUSY_TIME')
    const userTime  = get('USER_TIME')
    const sysTime   = get('SYS_TIME')
    const totalTime = idleTime + busyTime || 1 // avoid div-by-zero

    return {
      physical_memory_gb: Math.round(physBytes / 1073741824 * 10) / 10,
      free_memory_gb:     Math.round(freeBytes / 1073741824 * 10) / 10,
      cpu_count:          get('NUM_CPUS') || get('NUM_CPU_CORES'),
      cpu_idle_pct:       Math.round(idleTime / totalTime * 100),
      cpu_user_pct:       Math.round(userTime / totalTime * 100),
      cpu_sys_pct:        Math.round(sysTime  / totalTime * 100),
      cpu_busy_pct:       Math.round(busyTime / totalTime * 100),
    }
  }

  async #queryPga(conn: any) {
    // V$PGASTAT — PGA memory advisory and utilization
    const { rows } = await conn.execute(
      `SELECT name, value FROM v$pgastat
       WHERE name IN (
         'aggregate PGA target parameter',
         'aggregate PGA auto target',
         'total PGA allocated',
         'total freeable PGA memory',
         'maximum PGA allocated',
         'cache hit percentage'
       )`,
      [], { outFormat: 4002 },
    )
    const get = (name: string) => Number((rows as any[]).find((r: any) => r.NAME === name)?.VALUE ?? 0)
    const toGb = (v: number) => Math.round(v / 1073741824 * 10) / 10

    return {
      target_gb:     toGb(get('aggregate PGA target parameter')),
      allocated_gb:  toGb(get('total PGA allocated')),
      freeable_gb:   toGb(get('total freeable PGA memory')),
      max_gb:        toGb(get('maximum PGA allocated')),
      cache_hit_pct: Math.round(get('cache hit percentage') * 10) / 10,
    }
  }
}
