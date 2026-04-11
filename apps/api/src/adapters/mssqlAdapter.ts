/**
 * SQL Server live adapter using the `mssql` driver.
 * Queries sys.dm_* views to replicate the mock adapter's metric shape
 * so MssqlDetailPanel works unchanged.
 */

import type { DbAdapter, DbCredentials } from './types.js'

/** Reject anything that isn't a read-only statement. */
function validateReadOnlySql(sql: string): void {
  const trimmed = sql.trim().replace(/\/\*[\s\S]*?\*\//g, '').trim()
  const keyword = trimmed.split(/\s+/)[0]?.toUpperCase() ?? ''
  const allowed = new Set(['SELECT', 'WITH', 'EXPLAIN'])
  if (!allowed.has(keyword)) {
    throw new Error(`Only read-only queries are allowed. Got: ${keyword}`)
  }
}

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
      const [version, memory, sessions, waits, blocking, cpuIo, backups, diskMounts, haState, filegroupBreakdown] = await Promise.all([
        this.#queryVersion(pool),
        this.#queryMemory(pool),
        this.#querySessions(pool),
        this.#queryWaits(pool),
        this.#queryBlocking(pool),
        this.#queryCpuIo(pool),
        this.#queryBackups(pool).catch(() => []),
        this.#queryDiskMounts(pool).catch(() => []),
        this.#queryHaState(pool).catch(() => ({ type: 'none', details: [] })),
        this.#queryFilegroupBreakdown(pool).catch(() => []),
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
        // Backup history
        backup_history:            backups,
        // Disk / volume utilization
        disk_mounts:               diskMounts,
        // Per-filegroup disk breakdown
        filegroup_breakdown:       filegroupBreakdown,
        // HA / Replication state
        ha_state:                  haState,

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

  async executeQuery(creds: DbCredentials, sql: string, timeoutMs = 10_000): Promise<import('./types.js').QueryResult> {
    validateReadOnlySql(sql)
    const mssqlMod = await import('mssql')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mssql: typeof import('mssql') = (mssqlMod as any).default ?? mssqlMod
    let pool: any
    const start = Date.now()
    try {
      pool = await mssql.connect({
        user: creds.username, password: creds.password,
        server: creds.host, port: creds.port, database: creds.database,
        options: { trustServerCertificate: true, encrypt: false },
        connectionTimeout: 5000, requestTimeout: timeoutMs,
      })
      const result = await pool.request().query(sql)
      const rawRows: Record<string, unknown>[] = result.recordset ?? []
      const columns = rawRows.length ? Object.keys(rawRows[0]) : []
      return { columns, rows: rawRows.map(r => ({ ...r })), rowCount: rawRows.length, executionMs: Date.now() - start }
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
        @@VERSION AS full_ver
    `)
    const sysInfo = await pool.request().query(`
      SELECT sqlserver_start_time AS start_time, cpu_count AS cpus FROM sys.dm_os_sys_info
    `)
    const row = r.recordset[0] ?? {}
    const sys = sysInfo.recordset[0] ?? {}
    const startTime  = sys.start_time ? new Date(sys.start_time) : null
    const uptimeDays = startTime ? Math.floor((Date.now() - startTime.getTime()) / 86400000) : 0
    const fullVer    = String(row.full_ver ?? '')
    const osMatch    = fullVer.match(/on\s+(.+?)\s*(?:\n|$)/i)
    return {
      product_version: String(row.pv ?? 'unknown'),
      uptime_days:     uptimeDays,
      os:              osMatch ? osMatch[1].trim() : 'Windows Server',
      cpus:            Number(sys.cpus ?? 0),
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

  async #queryBackups(pool: any) {
    const r = await pool.request().query(`
      SELECT TOP 10
        bs.database_name,
        bs.backup_start_date,
        bs.backup_finish_date,
        DATEDIFF(minute, bs.backup_start_date, bs.backup_finish_date) AS duration_min,
        ROUND(CAST(bs.backup_size AS float) / 1073741824, 2)          AS size_gb,
        CASE bs.type
          WHEN 'D' THEN 'Full'
          WHEN 'I' THEN 'Differential'
          WHEN 'L' THEN 'Log'
          ELSE bs.type
        END AS backup_type,
        bs.is_copy_only,
        bmf.physical_device_name AS destination
      FROM msdb.dbo.backupset bs
      LEFT JOIN msdb.dbo.backupmediafamily bmf ON bs.media_set_id = bmf.media_set_id
      ORDER BY bs.backup_finish_date DESC
    `)
    return r.recordset.map((row: any) => ({
      type:         row.backup_type ?? 'Full',
      status:       'COMPLETED',
      started_at:   row.backup_start_date  ? new Date(row.backup_start_date).toISOString()  : null,
      finished_at:  row.backup_finish_date ? new Date(row.backup_finish_date).toISOString() : null,
      duration_min: Number(row.duration_min ?? 0),
      size_gb:      Number(row.size_gb ?? 0),
      destination:  row.destination ?? '',
    }))
  }

  async #queryHaState(pool: any) {
    // ── 1. Always On Availability Groups (2012+) ──────────────────────────────
    try {
      const agResult = await pool.request().query(`
        SELECT
          ag.name                                  AS ag_name,
          ar.role_desc                             AS local_role,
          ar.operational_state_desc                AS op_state,
          ar.connected_state_desc                  AS connected,
          ar.synchronization_health_desc           AS sync_health,
          ar.recovery_health_desc                  AS recovery_health,
          ars.last_redone_lsn,
          ars.last_received_lsn,
          ars.log_send_queue_size                  AS log_send_queue_kb,
          ars.redo_queue_size                      AS redo_queue_kb,
          ars.is_local,
          ar2.replica_server_name                  AS partner
        FROM sys.dm_hadr_availability_replica_states ar
        JOIN sys.availability_groups ag
          ON ar.group_id = ag.group_id
        JOIN sys.availability_replicas ar2
          ON ar.replica_id = ar2.replica_id
        LEFT JOIN sys.dm_hadr_database_replica_states ars
          ON ars.replica_id = ar.replica_id
        WHERE ar.is_local = 1
      `)
      if (agResult.recordset.length > 0) {
        const row = agResult.recordset[0]
        return {
          type: 'alwayson' as const,
          ag_name:      row.ag_name,
          local_role:   row.local_role,       // PRIMARY / SECONDARY
          op_state:     row.op_state,         // ONLINE / OFFLINE etc.
          connected:    row.connected,
          sync_health:  row.sync_health,      // HEALTHY / PARTIALLY_HEALTHY / NOT_HEALTHY
          recovery_health: row.recovery_health,
          log_send_queue_kb: Number(row.log_send_queue_kb ?? 0),
          redo_queue_kb:     Number(row.redo_queue_kb     ?? 0),
          details: agResult.recordset.map((r: any) => ({
            partner:           r.partner,
            local_role:        r.local_role,
            op_state:          r.op_state,
            connected:         r.connected,
            sync_health:       r.sync_health,
            log_send_queue_kb: Number(r.log_send_queue_kb ?? 0),
            redo_queue_kb:     Number(r.redo_queue_kb     ?? 0),
          })),
        }
      }
    } catch { /* AG DMV not available — Standard Edition or older */ }

    // ── 2. Log Shipping (2000+) ───────────────────────────────────────────────
    try {
      const lsResult = await pool.request().query(`
        SELECT
          p.primary_database,
          s.secondary_server,
          s.secondary_database,
          m.last_backup_date,
          m.last_backup_file,
          m.backup_threshold,
          m.last_restored_date,
          m.restore_threshold,
          m.status
        FROM msdb.dbo.log_shipping_monitor_primary   m
        JOIN msdb.dbo.log_shipping_primary_databases p ON m.primary_id = p.primary_id
        LEFT JOIN msdb.dbo.log_shipping_primary_secondaries s ON p.primary_id = s.primary_id
      `)
      if (lsResult.recordset.length > 0) {
        return {
          type: 'logshipping' as const,
          local_role: 'PRIMARY',
          details: lsResult.recordset.map((r: any) => ({
            primary_database:     r.primary_database,
            secondary_server:     r.secondary_server,
            secondary_database:   r.secondary_database,
            last_backup_date:     r.last_backup_date  ? new Date(r.last_backup_date).toISOString()  : null,
            last_restored_date:   r.last_restored_date ? new Date(r.last_restored_date).toISOString() : null,
            backup_threshold_min:  Number(r.backup_threshold  ?? 0),
            restore_threshold_min: Number(r.restore_threshold ?? 0),
            status:               Number(r.status ?? 0),  // 1=OK, 2=Warning, 3=Critical
          })),
        }
      }
      // Try secondary side
      const lsSecResult = await pool.request().query(`
        SELECT
          m.secondary_server,
          m.secondary_database,
          m.primary_server,
          m.primary_database,
          m.last_restored_date,
          m.restore_threshold,
          m.status
        FROM msdb.dbo.log_shipping_monitor_secondary m
      `)
      if (lsSecResult.recordset.length > 0) {
        return {
          type: 'logshipping' as const,
          local_role: 'SECONDARY',
          details: lsSecResult.recordset.map((r: any) => ({
            primary_database:     r.primary_database,
            secondary_server:     r.secondary_server,
            secondary_database:   r.secondary_database,
            last_backup_date:     null,
            last_restored_date:   r.last_restored_date ? new Date(r.last_restored_date).toISOString() : null,
            backup_threshold_min:  0,
            restore_threshold_min: Number(r.restore_threshold ?? 0),
            status:               Number(r.status ?? 0),
          })),
        }
      }
    } catch { /* msdb not accessible or tables missing */ }

    // ── 3. Database Mirroring (2005–2012, deprecated) ─────────────────────────
    try {
      const mirResult = await pool.request().query(`
        SELECT
          DB_NAME(database_id)                  AS database_name,
          mirroring_state_desc                  AS state,
          mirroring_role_desc                   AS role,
          mirroring_safety_level_desc           AS safety,
          mirroring_partner_name                AS partner,
          mirroring_witness_name                AS witness,
          mirroring_witness_state_desc          AS witness_state
        FROM sys.database_mirroring
        WHERE mirroring_state IS NOT NULL
      `)
      if (mirResult.recordset.length > 0) {
        const row = mirResult.recordset[0]
        return {
          type: 'mirroring' as const,
          local_role: row.role,
          sync_health: row.state,
          details: mirResult.recordset.map((r: any) => ({
            database_name: r.database_name,
            state:         r.state,        // SYNCHRONIZED / SYNCHRONIZING / SUSPENDED / DISCONNECTED
            role:          r.role,         // PRINCIPAL / MIRROR
            safety:        r.safety,       // FULL (sync) / OFF (async)
            partner:       r.partner,
            witness:       r.witness,
            witness_state: r.witness_state,
          })),
        }
      }
    } catch { /* sys.database_mirroring not available */ }

    return { type: 'none' as const, details: [] }
  }

  async #queryDiskMounts(pool: any) {
    // sys.dm_os_volume_stats requires SQL Server 2008 R2+
    const r = await pool.request().query(`
      SELECT DISTINCT
        vs.volume_mount_point                                          AS mount,
        ISNULL(vs.logical_volume_name, vs.volume_mount_point)         AS label,
        ROUND(CAST(vs.total_bytes     AS float) / 1073741824, 1)      AS total_gb,
        ROUND(CAST(vs.available_bytes AS float) / 1073741824, 1)      AS free_gb,
        ROUND((1.0 - CAST(vs.available_bytes AS float) / vs.total_bytes) * 100, 1) AS used_pct
      FROM sys.master_files mf
      CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs
      ORDER BY vs.volume_mount_point
    `)
    return r.recordset.map((row: any) => ({
      mount:    row.mount,
      label:    row.label,
      total_gb: Number(row.total_gb ?? 0),
      used_gb:  Number(row.total_gb ?? 0) - Number(row.free_gb ?? 0),
      free_gb:  Number(row.free_gb  ?? 0),
      used_pct: Number(row.used_pct ?? 0),
    }))
  }

  async #queryFilegroupBreakdown(pool: any) {
    // Per-filegroup and per-file size breakdown (SQL Server 2005+)
    const r = await pool.request().query(`
      SELECT
        DB_NAME(mf.database_id)                                          AS db_name,
        ISNULL(fg.name, CASE mf.type WHEN 1 THEN 'LOG' ELSE 'UNKNOWN' END) AS filegroup_name,
        fg.type_desc                                                     AS fg_type,
        mf.name                                                          AS logical_name,
        mf.physical_name                                                 AS physical_name,
        ROUND(CAST(mf.size AS float) * 8 / 1048576, 2)                  AS allocated_gb,
        ROUND(
          CAST(FILEPROPERTY(mf.name, 'SpaceUsed') AS float) * 8 / 1048576, 2
        )                                                                AS used_gb,
        CASE mf.is_percent_growth WHEN 1
          THEN CAST(mf.growth AS varchar) + '%'
          ELSE CAST(mf.growth * 8 / 1024 AS varchar) + ' MB'
        END                                                              AS auto_growth
      FROM sys.master_files mf
      LEFT JOIN sys.filegroups fg
             ON fg.data_space_id = mf.data_space_id
            AND fg.database_id   = mf.database_id
      WHERE mf.state = 0   -- ONLINE files only
      ORDER BY db_name, filegroup_name, mf.name
    `)
    return r.recordset.map((row: any) => ({
      db_name:        row.db_name,
      filegroup_name: row.filegroup_name,
      fg_type:        row.fg_type ?? null,
      logical_name:   row.logical_name,
      physical_name:  row.physical_name,
      allocated_gb:   Number(row.allocated_gb ?? 0),
      used_gb:        Number(row.used_gb ?? 0),
      auto_growth:    row.auto_growth,
    }))
  }

  async #queryCpuIo(pool: any) {    const perf = await pool.request().query(`
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
