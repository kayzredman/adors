/**
 * Oracle live adapter using the `oracledb` driver.
 *
 * Queries the same V$ / DBA views that the mock adapter simulates.
 * Returns metrics in the exact shape OracleDetailPanel expects.
 *
 * Oracle Instant Client must be installed and ORACLE_LIB_DIR must be set,
 * OR the thin client mode can be used (oracledb 6+, no native libs).
 * Set ORACLE_THIN_CLIENT=true in env to force thin mode.
 */

import type { DbAdapter, DbCredentials } from './types.js'

export class OracleAdapter implements DbAdapter {
  async getHealthMetrics(creds: DbCredentials): Promise<Record<string, unknown>> {
    // Lazy import — only installed if Oracle features are enabled
    // CJS interop: dynamic ESM import wraps CJS module in .default
    const oracledbMod = await import('oracledb').catch(() => {
      throw new Error('oracledb package not installed. Run: pnpm add oracledb')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oracledb: typeof import('oracledb') = (oracledbMod as any).default ?? oracledbMod

    // oracledb v6+ defaults to thin mode (no Instant Client required).
    // Only call initOracleClient() when thick mode is explicitly requested.
    if (process.env.ORACLE_THICK_CLIENT === 'true') {
      const libDir = process.env.ORACLE_LIB_DIR
      oracledb.initOracleClient(libDir ? { libDir } : undefined)
    }

    const conn = await oracledb.getConnection({
      user:          creds.username,
      password:      creds.password,
      connectString: `${creds.host}:${creds.port}/${creds.database}`,
      ...(creds.options?.['privilege'] === 'SYSDBA'  ? { privilege: oracledb.SYSDBA  } : {}),
      ...(creds.options?.['privilege'] === 'SYSOPER' ? { privilege: oracledb.SYSOPER } : {}),
    })

    try {
      const [
        dbProps, sessions, processes, waits, sga, tablespaces, redoLog, sysstat,
      ] = await Promise.all([
        this.#queryDbProps(conn),
        this.#querySessions(conn),
        this.#queryProcesses(conn),
        this.#queryWaits(conn),
        this.#querySga(conn),
        this.#queryTablespaces(conn),
        this.#queryRedoLog(conn),
        this.#querySysstat(conn),
      ])

      return {
        db_version:  dbProps.version,
        uptime_days: dbProps.uptime_days,
        clients: {
          num_clients:    sessions.active,
          avg_response_ms: sysstat.avg_response_ms,
          network_in_kbs:  sysstat.net_in,
          network_out_kbs: sysstat.net_out,
        },
        sessions: {
          current:     sessions.current,
          active:      sessions.active,
          inactive:    sessions.inactive,
          blocked:     sessions.blocked,
          chart:       sessions.chart,
        },
        processes,
        execution_rate:  sysstat.execution_rate,
        parse_rate:      sysstat.parse_rate,
        open_cursors:    sysstat.open_cursors,
        commit_rate:     sysstat.commit_rate,
        waits: {
          chart:     waits.chart,
          breakdown: waits.breakdown,
        },
        db_cpu_ratio: sysstat.db_cpu_ratio,
        memory: {
          sga_alloc_mb:     sga.total_mb,
          buffer_cache_mb:  sga.buffer_cache_mb,
          shared_pool_mb:   sga.shared_pool_mb,
          large_pool_mb:    sga.large_pool_mb,
          redo_buffer_mb:   sga.redo_buffer_mb,
          db_block_rate:    sysstat.db_block_rate_chart,
          logical_reads:    sysstat.logical_reads_chart,
          redo_generated:   sysstat.redo_generated_chart,
        },
        storage: {
          data:  tablespaces.data,
          temp:  tablespaces.temp,
          undo:  tablespaces.undo,
          io_chart: tablespaces.io_chart,
        },
        redo_log: {
          current_group: redoLog.current_group,
          used_pct:      redoLog.used_pct,
          fill_chart:    redoLog.fill_chart,
          log_counts:    redoLog.log_counts,
        },
      }
    } finally {
      await conn.close()
    }
  }

  async testConnection(creds: DbCredentials): Promise<{ ok: boolean; latency_ms: number }> {
    const oracledbMod = await import('oracledb')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const oracledb: typeof import('oracledb') = (oracledbMod as any).default ?? oracledbMod
    const start = Date.now()
    try {
      const conn = await oracledb.getConnection({
        user:          creds.username,
        password:      creds.password,
        connectString: `${creds.host}:${creds.port}/${creds.database}`,
        ...(creds.options?.['privilege'] === 'SYSDBA'  ? { privilege: oracledb.SYSDBA  } : {}),
        ...(creds.options?.['privilege'] === 'SYSOPER' ? { privilege: oracledb.SYSOPER } : {}),
      })
      await conn.execute('SELECT 1 FROM DUAL')
      await conn.close()
      return { ok: true, latency_ms: Date.now() - start }
    } catch {
      return { ok: false, latency_ms: Date.now() - start }
    }
  }

  // ─── Private query helpers ─────────────────────────────────────────────────

  async #queryDbProps(conn: any) {
    const { rows } = await conn.execute(
      `SELECT version_full, (SYSDATE - startup_time) * 24 AS uptime_h FROM v$instance`,
      [], { outFormat: 4002 },  // OBJECT format
    )
    const r = (rows as any[])[0] ?? {}
    return {
      version:     r.VERSION_FULL ?? 'unknown',
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
      chart: [{ time: '00m', value: current }],  // single point; scanner accumulates over time
    }
  }

  async #queryProcesses(conn: any) {
    const { rows } = await conn.execute(
      `SELECT program, COUNT(*) AS cnt FROM v$process GROUP BY program ORDER BY cnt DESC FETCH FIRST 10 ROWS ONLY`,
      [], { outFormat: 4002 },
    )
    return (rows as any[]).map(r => ({ name: r.PROGRAM ?? 'unknown', count: Number(r.CNT) }))
  }

  async #queryWaits(conn: any) {
    const { rows } = await conn.execute(
      `SELECT event, time_waited, wait_class
       FROM v$system_event
       WHERE wait_class NOT IN ('Idle','Other')
       ORDER BY time_waited DESC FETCH FIRST 8 ROWS ONLY`,
      [], { outFormat: 4002 },
    )
    const breakdown: Record<string, number> = {}
    const chart: { time: string; value: number }[] = []
    for (const r of (rows as any[])) {
      breakdown[r.EVENT] = Number(r.TIME_WAITED)
      chart.push({ time: r.EVENT.substring(0, 8), value: Number(r.TIME_WAITED) })
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
      io_chart: [{ time: '00m', read: 0, write: 0 }],
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
      used_pct:      0,  // V$LOG doesn't expose fill — use V$LOGFILE + events
      fill_chart:    [{ time: '00m', value: 0 }],
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

    const get = (name: string) => Number((rows as any[]).find((r: any) => r.NAME === name)?.VALUE ?? 0)
    return {
      execution_rate:       [{ time: '00m', value: get('execute count') }],
      parse_rate:           [{ time: '00m', value: get('parse count (total)') }],
      open_cursors:         [{ time: '00m', value: get('opened cursors current') }],
      commit_rate:          [{ time: '00m', value: get('user commits') }],
      db_block_rate_chart:  [{ time: '00m', value: get('db block gets') }],
      logical_reads_chart:  [{ time: '00m', value: get('logical reads') }],
      redo_generated_chart: [{ time: '00m', value: get('redo size') / 1024 }],
      net_in:               Math.round(get('bytes received via SQL*Net from client') / 1024),
      net_out:              Math.round(get('bytes sent via SQL*Net to client') / 1024),
      avg_response_ms:      0,
      db_cpu_ratio:         0,
    }
  }
}
