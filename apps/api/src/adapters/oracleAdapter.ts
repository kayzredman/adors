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
        dbProps, sessions, processes, waits, sga, tablespaces, redoLog, sysstat, backups, diskMounts,
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
      ])

      return {
        adapter: 'live',
        // Server Info
        db_version:  dbProps.version,
        uptime_days: dbProps.uptime_days,
        os:          'Linux x86_64',
        cpus:        0,
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
        // Disk / tablespace utilization
        disk_mounts:    diskMounts,
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
}
