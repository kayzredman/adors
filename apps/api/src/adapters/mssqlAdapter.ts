/**
 * SQL Server live adapter using the `mssql` driver.
 * Queries sys.dm_* views to replicate the mock adapter's metric shape
 * so MssqlDetailPanel works unchanged.
 */

import type { DbAdapter, DbCredentials } from './types.js'

export class MssqlAdapter implements DbAdapter {
  async getHealthMetrics(creds: DbCredentials): Promise<Record<string, unknown>> {
    const mssqlMod = await import('mssql').catch(() => {
      throw new Error('mssql package not installed. Run: pnpm add mssql')
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mssql: typeof import('mssql') = (mssqlMod as any).default ?? mssqlMod

    const pool = await mssql.connect({
      user:     creds.username,
      password: creds.password,
      server:   creds.host,
      port:     creds.port,
      database: creds.database,
      options: {
        trustServerCertificate: true,
        encrypt: false,
        ...((creds.options ?? {}) as any),
      },
      connectionTimeout: 10000,
      requestTimeout:    15000,
    })

    try {
      const [version, memory, sessions, waits, blocking, cpuIo] = await Promise.all([
        this.#queryVersion(pool),
        this.#queryMemory(pool),
        this.#querySessions(pool),
        this.#queryWaits(pool),
        this.#queryBlocking(pool),
        this.#queryCpuIo(pool),
      ])

      // Return flat keys matching mock adapter shape (MssqlDetailPanel reads these directly)
      return {
        adapter: 'live',
        db_version:                version.product_version,
        uptime_days:               version.uptime_days,
        os:                        version.os,
        cpus:                      version.cpus,
        // Connections
        active_connections:        sessions.active,
        max_connections:           sessions.max_allowed,
        connection_chart:          sessions.chart,
        // Memory
        buffer_pool_memory_pct:    memory.buffer_pool_pct,
        target_server_memory_gb:   memory.target_gb,
        total_server_memory_gb:    memory.current_gb,
        page_life_expectancy_sec:  memory.ple,
        memory_pressure_chart:     memory.chart,
        // Waits
        top_wait_types:            waits.top,
        // Blocking
        blocking_spids:            blocking.count,
        blocking_chart:            blocking.chart,
        deadlocks_per_min:         cpuIo.deadlocks,
        // Query perf
        batch_requests_sec:        cpuIo.batch_req_per_s,
        avg_query_time_ms:         cpuIo.avg_exec_ms,
        cpu_usage_pct:             cpuIo.cpu_pct,
        compilations_sec:          cpuIo.compilations,
        recompilations_sec:        cpuIo.recompilations,
        cpu_chart:                 cpuIo.cpu_chart,
        query_perf_chart:          cpuIo.cpu_chart,
        // Disk I/O
        disk_reads_per_sec:        cpuIo.disk_io.reads_per_s,
        disk_writes_per_sec:       cpuIo.disk_io.writes_per_s,
        io_chart:                  cpuIo.disk_io.io_chart,
        // Log (placeholder — requires additional query)
        log_flush_per_sec:         0,
        log_cache_hit_pct:         0,

        // Legacy nested shape kept for backwards compatibility
        connections: {
          active:          sessions.active,
          max_allowed:     sessions.max_allowed,
          chart:           sessions.chart,
          batch_req_per_s: cpuIo.batch_req_per_s,
        },
        memory_nested: {
          buffer_pool_pct:      memory.buffer_pool_pct,
          target_gb:            memory.target_gb,
          current_gb:           memory.current_gb,
          page_life_expectancy: memory.ple,
          chart:                memory.chart,
          pressure_hist:        memory.pressure_hist,
        },
        disk_io: cpuIo.disk_io,

        // --- unused below, kept to avoid breaking query_perf block ---
        query_perf: {
          avg_exec_ms:        cpuIo.avg_exec_ms,
          cpu_pct:            cpuIo.cpu_pct,
          batch_req_per_s:    cpuIo.batch_req_per_s,
          compilations_per_s: cpuIo.compilations,
          chart:              cpuIo.cpu_chart,
        },
      }
    } finally {
      await pool.close()
    }
  }

  async testConnection(creds: DbCredentials): Promise<{ ok: boolean; latency_ms: number }> {
    const mssqlMod = await import('mssql')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mssql: typeof import('mssql') = (mssqlMod as any).default ?? mssqlMod
    const start = Date.now()
    let pool: any
    try {
      pool = await mssql.connect({ user: creds.username, password: creds.password, server: creds.host, port: creds.port, database: creds.database, options: { trustServerCertificate: true, encrypt: false }, connectionTimeout: 5000 })
      await pool.request().query('SELECT 1')
      return { ok: true, latency_ms: Date.now() - start }
    } catch {
      return { ok: false, latency_ms: Date.now() - start }
    } finally {
      pool?.close()
    }
  }

  // ─── Query helpers ─────────────────────────────────────────────────────────

  async #queryVersion(pool: any) {
    const r = await pool.request().query(`
      SELECT
        SERVERPROPERTY('ProductVersion') AS pv,
        SERVERPROPERTY('Edition') AS ed,
        @@CPU_COUNT AS cpus,
        @@VERSION AS full_ver
    `)
    const sysInfo = await pool.request().query(`
      SELECT sqlserver_start_time AS start_time FROM sys.dm_os_sys_info
    `)
    const row = r.recordset[0] ?? {}
    const startTime  = sysInfo.recordset[0]?.start_time ? new Date(sysInfo.recordset[0].start_time) : null
    const uptimeDays = startTime ? Math.floor((Date.now() - startTime.getTime()) / 86400000) : 0
    const fullVer    = String(row.full_ver ?? '')
    const osMatch    = fullVer.match(/on\s+(.+?)\s*(?:\n|$)/i)
    return {
      product_version: String(row.pv ?? 'unknown'),
      uptime_days:     uptimeDays,
      os:              osMatch ? osMatch[1].trim() : 'Windows Server',
      cpus:            Number(row.cpus ?? 0),
    }
  }

  async #queryMemory(pool: any) {
    const r = await pool.request().query(`
      SELECT
        physical_memory_in_use_kb,
        page_fault_count,
        memory_utilization_percentage
      FROM sys.dm_os_process_memory
    `)
    const row = r.recordset[0] ?? {}
    const current_gb = (Number(row.physical_memory_in_use_kb ?? 0) / 1024 / 1024)

    const cfg = await pool.request().query(`
      SELECT value_in_use FROM sys.configurations WHERE name = 'max server memory (MB)'
    `)
    const target_gb = (Number(cfg.recordset[0]?.value_in_use ?? 2048) / 1024)

    const ple = await pool.request().query(`
      SELECT cntr_value FROM sys.dm_os_performance_counters
      WHERE counter_name = 'Page life expectancy' AND object_name LIKE '%Buffer Manager%'
    `)

    return {
      buffer_pool_pct:  Math.round((current_gb / target_gb) * 100),
      target_gb:        Math.round(target_gb * 10) / 10,
      current_gb:       Math.round(current_gb * 10) / 10,
      ple:              Number(ple.recordset[0]?.cntr_value ?? 0),
      chart:            [{ t: new Date().toISOString(), v: Math.round(current_gb * 10) / 10 }],
      pressure_hist:    [{ t: new Date().toISOString(), v: Number(row.memory_utilization_percentage ?? 0) }],
    }
  }

  async #querySessions(pool: any) {
    const r = await pool.request().query(`
      SELECT
        COUNT(*) AS active
      FROM sys.dm_exec_sessions
      WHERE is_user_process = 1
    `)
    const cfg = await pool.request().query(`
      SELECT value_in_use FROM sys.configurations WHERE name = 'max connections'
    `)
    return {
      active:      Number(r.recordset[0]?.active ?? 0),
      max_allowed: Number(cfg.recordset[0]?.value_in_use ?? 32767),
      chart:       [{ t: new Date().toISOString(), v: Number(r.recordset[0]?.active ?? 0) }],
    }
  }

  async #queryWaits(pool: any) {
    const r = await pool.request().query(`
      SELECT TOP 8
        wait_type,
        wait_time_ms,
        waiting_tasks_count
      FROM sys.dm_os_wait_stats
      WHERE wait_type NOT IN (
        'SLEEP_TASK','BROKER_TO_FLUSH','BROKER_TASK_STOP','CLR_AUTO_EVENT',
        'DISPATCHER_QUEUE_SEMAPHORE','FT_IFTS_SCHEDULER_IDLE_WAIT','HADR_WORK_QUEUE',
        'LAZYWRITER_SLEEP','LOGMGR_QUEUE','ONDEMAND_TASK_QUEUE','REQUEST_FOR_DEADLOCK_SEARCH',
        'RESOURCE_QUEUE','SERVER_IDLE_CHECK','SLEEP_DBSTARTUP','SLEEP_DCOMSTARTUP',
        'SLEEP_MASTERDBREADY','SLEEP_MASTERMDREADY','SLEEP_MASTERUPGRADED','SLEEP_MSDBSTARTUP',
        'SLEEP_SYSTEMTASK','SLEEP_TEMPDBSTARTUP','SNI_HTTP_ACCEPT','SP_SERVER_DIAGNOSTICS_SLEEP',
        'SQLTRACE_BUFFER_FLUSH','WAITFOR','XE_TIMER_EVENT','XE_DISPATCHER_WAIT',
        'BROKER_EVENTHANDLER','CHECKPOINT_QUEUE'
      )
      ORDER BY wait_time_ms DESC
    `)
    return {
      top: r.recordset.map((row: any) => ({
        wait_type: row.wait_type,
        wait_ms:   Number(row.wait_time_ms),
        tasks:     Number(row.waiting_tasks_count),
      })),
    }
  }

  async #queryBlocking(pool: any) {
    const r = await pool.request().query(`
      SELECT COUNT(*) AS cnt FROM sys.dm_exec_requests WHERE blocking_session_id > 0
    `)
    return {
      count: Number(r.recordset[0]?.cnt ?? 0),
      chart: [{ t: new Date().toISOString(), v: Number(r.recordset[0]?.cnt ?? 0) }],
    }
  }

  async #queryCpuIo(pool: any) {
    const perf = await pool.request().query(`
      SELECT counter_name, cntr_value
      FROM sys.dm_os_performance_counters
      WHERE counter_name IN (
        'Batch Requests/sec','SQL Compilations/sec','SQL Re-Compilations/sec',
        'Number of Deadlocks/sec'
      ) AND instance_name = ''
    `)
    const get = (name: string) => Number(perf.recordset.find((r: any) => r.counter_name === name)?.cntr_value ?? 0)

    const io = await pool.request().query(`
      SELECT
        SUM(io_stall_read_ms)  AS read_stall,
        SUM(io_stall_write_ms) AS write_stall,
        SUM(num_of_reads)      AS reads,
        SUM(num_of_writes)     AS writes
      FROM sys.dm_io_virtual_file_stats(NULL, NULL)
    `)
    const ior = io.recordset[0] ?? {}

    return {
      batch_req_per_s: get('Batch Requests/sec'),
      compilations:    get('SQL Compilations/sec'),
      deadlocks:       get('Number of Deadlocks/sec'),
      avg_exec_ms:     0,
      cpu_pct:         0,
      cpu_chart:       [{ t: new Date().toISOString(), v: 0 }],
      disk_io: {
        read_stall_ms:  Number(ior.read_stall ?? 0),
        write_stall_ms: Number(ior.write_stall ?? 0),
        reads_per_s:    Number(ior.reads ?? 0),
        writes_per_s:   Number(ior.writes ?? 0),
        io_chart:       [{ t: new Date().toISOString(), v: Number(ior.reads ?? 0) + Number(ior.writes ?? 0) }],
      },
    }
  }
}
