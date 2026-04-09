/**
 * MariaDB live adapter using the `mysql2` driver (promise API).
 * Queries SHOW STATUS / SHOW GLOBAL STATUS / SHOW SLAVE STATUS to replicate
 * the mock adapter's metric shape for MariaDbDetailPanel.
 */

import type { DbAdapter, DbCredentials } from './types.js'

export class MariaDbAdapter implements DbAdapter {
  async getHealthMetrics(creds: DbCredentials): Promise<Record<string, unknown>> {
    const mysql = await import('mysql2/promise').catch(() => {
      throw new Error('mysql2 package not installed. Run: pnpm add mysql2')
    })

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
      const [globalStatus, innodbStatus, replStatus] = await Promise.all([
        this.#queryGlobalStatus(conn),
        this.#queryInnodbStatus(conn),
        this.#queryReplication(conn),
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

      return {
        db_version: globalStatus['version'] ?? 'unknown',
        connections: {
          active:       threadsConnected,
          max:          maxConn,
          threads_running: threadsRunning,
          chart: [{ time: '00m', value: threadsConnected }],
        },
        innodb_buffer_pool: {
          size_mb:   Math.round(bpSizeMb),
          hit_ratio: hitRatio,
          rows_read:    rowsRead,
          rows_written: rowsWritten,
          hit_chart: [{ time: '00m', value: hitRatio }],
          rw_chart:  [{ time: '00m', read: rowsRead, write: rowsWritten }],
        },
        queries: {
          total_per_s:  queries,
          select_per_s: selects,
          insert_per_s: inserts,
          update_per_s: updates,
          delete_per_s: deletes,
          chart: [{ time: '00m', total: queries, select: selects, insert: inserts, update: updates }],
        },
        slow_queries: {
          count:          slowQs,
          long_query_time: get(globalStatus, 'long_query_time'),
          chart: [{ time: '00m', value: slowQs }],
        },
        replication: {
          is_running: replStatus.is_running,
          lag_sec:    replStatus.lag_sec,
          chart: [{ time: '00m', value: replStatus.lag_sec }],
        },
        storage: {
          data_size_gb:   0,  // requires information_schema query (added in Phase 3)
          index_size_gb:  0,
          io_chart: [{ time: '00m', read: 0, write: 0 }],
        },
        table_lock_waited: tableLocks,
      }
    } finally {
      await conn.end()
    }
  }

  async testConnection(creds: DbCredentials): Promise<{ ok: boolean; latency_ms: number }> {
    const mysql = await import('mysql2/promise')
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
}
