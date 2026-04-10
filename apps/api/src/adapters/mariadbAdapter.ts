/**
 * MariaDB live adapter using the `mysql2` driver (promise API).
 * Queries SHOW STATUS / SHOW GLOBAL STATUS / SHOW SLAVE STATUS to replicate
 * the mock adapter's metric shape for MariaDbDetailPanel.
 */

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

export class MariaDbAdapter implements DbAdapter {
  async getHealthMetrics(creds: DbCredentials): Promise<Record<string, unknown>> {
    const mysqlMod = await import('mysql2/promise').catch(() => {
      throw new Error('mysql2 package not installed. Run: pnpm add mysql2')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mysql: typeof import('mysql2/promise') = (mysqlMod as any).default ?? mysqlMod

    const conn = await mysql.createConnection({
      host:               creds.host,
      port:               creds.port,
      database:           creds.database,
      user:               creds.username,
      password:           creds.password,
      connectTimeout:     10000,
      ...((creds.options ?? {}) as any),
    })

    try {
      const [globalStatus, innodbStatus, replStatus, diskMounts] = await Promise.all([
        this.#queryGlobalStatus(conn),
        this.#queryInnodbStatus(conn),
        this.#queryReplication(conn),
        this.#queryDiskMounts(conn).catch(() => []),
      ])

      const get = (map: Record<string, string>, key: string) => Number(map[key] ?? 0)

      const threadsConnected = get(globalStatus, 'Threads_connected')
      const threadsRunning   = get(globalStatus, 'Threads_running')
      const maxConn          = get(globalStatus, 'Max_used_connections') || 151

      const bpPages    = get(globalStatus, 'Innodb_buffer_pool_pages_total')
      const bpFree     = get(globalStatus, 'Innodb_buffer_pool_pages_free')
      const bpUsed     = bpPages - bpFree
      const hitRatio   = bpPages > 0 ? Math.round((bpUsed / bpPages) * 100) : 0

      const queries    = get(globalStatus, 'Queries')
      const selects    = get(globalStatus, 'Com_select')
      const inserts    = get(globalStatus, 'Com_insert')
      const updates    = get(globalStatus, 'Com_update')
      const deletes    = get(globalStatus, 'Com_delete')
      const slowQs     = get(globalStatus, 'Slow_queries')
      const tableLocks = get(globalStatus, 'Table_locks_waited')

      const bpSizeMb  = get(innodbStatus, 'bp_size_bytes') / 1024 / 1024
      const rowsRead  = get(innodbStatus, 'rows_read')
      const rowsWritten = get(innodbStatus, 'rows_inserted') + get(innodbStatus, 'rows_updated') + get(innodbStatus, 'rows_deleted')

      // Return flat keys matching mock adapter shape (MariaDbDetailPanel reads these directly)
      return {
        adapter: 'live',
        db_version:  globalStatus['version'] ?? globalStatus['Version'] ?? 'unknown',
        uptime_days: Math.floor(get(globalStatus, 'Uptime') / 86400),
        os:          'Linux x86_64',
        cpus:        0,
        // Connections
        active_connections:  threadsConnected,
        max_connections:     maxConn,
        thread_cache_size:   get(globalStatus, 'thread_cache_size'),
        threads_running:     threadsRunning,
        connection_chart:    [{ t: new Date().toISOString(), v: threadsConnected }],
        // InnoDB Buffer Pool
        innodb_buffer_pool_size_gb:   Math.round(bpSizeMb / 1024 * 10) / 10,
        innodb_buffer_hit_ratio_pct:  hitRatio,
        innodb_buffer_read_requests:  get(globalStatus, 'Innodb_buffer_pool_read_requests'),
        innodb_buffer_reads:          get(globalStatus, 'Innodb_buffer_pool_reads'),
        innodb_rows_read_per_sec:     rowsRead,
        innodb_rows_written_per_sec:  rowsWritten,
        buffer_hit_chart:  [{ t: new Date().toISOString(), v: hitRatio }],
        innodb_io_chart:   [{ t: new Date().toISOString(), v: 0 }],
        // Slow Queries
        slow_queries_per_min:    slowQs,
        slow_query_log_enabled:  get(globalStatus, 'slow_query_log') === 1,
        long_query_time_sec:     get(globalStatus, 'long_query_time') || 2,
        slow_query_chart:        [{ t: new Date().toISOString(), v: slowQs }],
        // Replication
        replication_running:   replStatus.is_running,
        replication_lag_sec:   replStatus.lag_sec,
        replication_lag_chart: [{ t: new Date().toISOString(), v: replStatus.lag_sec }],
        // Queries
        queries_per_sec:  queries,
        select_per_s:     selects,
        select_per_sec:   selects,
        insert_per_sec:   inserts,
        update_per_sec:   updates,
        delete_per_sec:   deletes,
        query_chart:      [{ t: new Date().toISOString(), total: queries, select: selects, insert: inserts, update: updates, delete: deletes }],
        // Table Locks
        table_lock_waited:    tableLocks,
        table_lock_immediate: get(globalStatus, 'Table_locks_immediate'),
        // Storage (placeholder)
        disk_usage_pct: 0,
        disk_used_gb:   0,
        disk_total_gb:  0,
        disk_io_chart:  [{ t: new Date().toISOString(), v: 0 }],
        // Backup history (no native SQL table in MariaDB)
        backup_history: [],
        // Disk / schema utilization
        disk_mounts: diskMounts,
      }
    } finally {
      await conn.end()
    }
  }

  async testConnection(creds: DbCredentials): Promise<{ ok: boolean; latency_ms: number }> {
    const mysqlMod = await import('mysql2/promise')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mysql: typeof import('mysql2/promise') = (mysqlMod as any).default ?? mysqlMod
    const start = Date.now()
    let conn: any
    try {
      conn = await mysql.createConnection({ host: creds.host, port: creds.port, user: creds.username, password: creds.password, connectTimeout: 5000 })
      await conn.query('SELECT 1')
      return { ok: true, latency_ms: Date.now() - start }
    } catch {
      return { ok: false, latency_ms: Date.now() - start }
    } finally {
      conn?.end()
    }
  }

  async executeQuery(creds: DbCredentials, sql: string, timeoutMs = 10_000): Promise<import('./types.js').QueryResult> {
    validateReadOnlySql(sql)
    const mysqlMod = await import('mysql2/promise')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mysql: typeof import('mysql2/promise') = (mysqlMod as any).default ?? mysqlMod
    let conn: any
    const start = Date.now()
    try {
      conn = await mysql.createConnection({
        host: creds.host, port: creds.port,
        user: creds.username, password: creds.password,
        database: creds.database,
        connectTimeout: 5000,
        ...((creds.options ?? {}) as any),
      })
      await conn.query(`SET SESSION max_execution_time=${timeoutMs}`)
      const [rawRows, fields] = await conn.query(sql)
      const columns = (fields as any[]).map((f: any) => f.name as string)
      const rows = (rawRows as any[]).map((r: any) => {
        const out: Record<string, unknown> = {}
        for (const col of columns) out[col] = r[col] ?? null
        return out
      })
      return { columns, rows, rowCount: rows.length, executionMs: Date.now() - start }
    } finally {
      conn?.end()
    }
  }

  // ─── Query helpers ─────────────────────────────────────────────────────────

  async #queryGlobalStatus(conn: any): Promise<Record<string, string>> {
    const [rows] = await conn.query('SHOW GLOBAL STATUS')
    return Object.fromEntries((rows as any[]).map((r: any) => [r.Variable_name, r.Value]))
  }

  async #queryInnodbStatus(conn: any): Promise<Record<string, number>> {
    const [rows] = await conn.query(`
      SELECT variable_name, variable_value FROM information_schema.global_variables
      WHERE variable_name = 'innodb_buffer_pool_size'
    `)
    const [ibRows] = await conn.query(`
      SELECT variable_name, variable_value
      FROM information_schema.global_status
      WHERE variable_name IN ('Innodb_rows_read','Innodb_rows_inserted','Innodb_rows_updated','Innodb_rows_deleted')
    `)
    const bp = Number((rows as any[])[0]?.variable_value ?? 0)
    const ib = Object.fromEntries((ibRows as any[]).map((r: any) => [r.variable_name, Number(r.variable_value)]))
    return {
      bp_size_bytes:  bp,
      rows_read:      ib['Innodb_rows_read']    ?? 0,
      rows_inserted:  ib['Innodb_rows_inserted'] ?? 0,
      rows_updated:   ib['Innodb_rows_updated']  ?? 0,
      rows_deleted:   ib['Innodb_rows_deleted']  ?? 0,
    }
  }

  async #queryReplication(conn: any) {
    try {
      const [rows] = await conn.query('SHOW SLAVE STATUS')
      const r = (rows as any[])[0]
      if (!r) return { is_running: false, lag_sec: 0 }
      return {
        is_running: r.Slave_IO_Running === 'Yes' && r.Slave_SQL_Running === 'Yes',
        lag_sec:    Number(r.Seconds_Behind_Master ?? 0),
      }
    } catch {
      // Not a replica
      return { is_running: false, lag_sec: 0 }
    }
  }

  async #queryDiskMounts(conn: any) {
    const [rows] = await conn.query(`
      SELECT
        table_schema                                                      AS mount,
        table_schema                                                      AS label,
        ROUND(SUM(data_length + index_length) / 1073741824, 3)           AS total_gb,
        ROUND(SUM(data_length + index_length) / 1073741824, 3)           AS used_gb,
        0                                                                  AS free_gb,
        100                                                                AS used_pct,
        COUNT(*)                                                           AS table_count
      FROM information_schema.tables
      WHERE table_schema NOT IN ('information_schema','performance_schema','sys','mysql')
      GROUP BY table_schema
      ORDER BY total_gb DESC
    `)
    return (rows as any[]).map((r: any) => ({
      mount:       r.mount,
      label:       r.label + ` (${r.table_count} tables)`,
      total_gb:    Number(r.total_gb ?? 0),
      used_gb:     Number(r.used_gb  ?? 0),
      free_gb:     0,
      used_pct:    100,
    }))
  }
}
