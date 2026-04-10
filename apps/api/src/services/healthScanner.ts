import type { DbConnection, HealthSnapshot, HealthStatus } from '@adors/shared'
import { supabase } from '../config/supabase.js'
import { getAdapter } from '../adapters/index.js'
import { getConnectionCredentials } from './connectionService.js'

// ─── Mock Adapter Interface ───────────────────────────────────────────────────
// Phase 2 will replace these with real oracledb / mssql / mysql2 drivers

interface HealthMetrics {
  score: number
  status: HealthStatus
  blocked_sessions: number
  active_alerts: number
  details: Record<string, unknown>
}

// ─── Mock Adapters ────────────────────────────────────────────────────────────

function mockOracleHealth(conn: DbConnection): HealthMetrics {
  const isProd = conn.environment === 'production'
  const score = isProd ? Math.floor(Math.random() * 30) + 65 : Math.floor(Math.random() * 20) + 78
  const blockedSessions = isProd ? Math.floor(Math.random() * 5) : 0
  const tablespacePct = Math.floor(Math.random() * 40) + 55
  const now = Date.now()

  // Generate time-series sparkline data (last 10 points, ~30s intervals)
  const timeSeries = (base: number, variance: number) =>
    Array.from({ length: 10 }, (_, i) => ({
      t: new Date(now - (9 - i) * 30000).toISOString(),
      v: Math.max(0, base + Math.floor((Math.random() - 0.5) * variance)),
    }))

  return {
    score,
    status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
    blocked_sessions: blockedSessions,
    active_alerts: blockedSessions > 0 || tablespacePct > 85 ? (isProd ? 2 : 0) : 0,
    details: {
      adapter: 'mock',
      // ── Server Info ─────────────────────────────
      db_version:      '19.0.0.0.0 EE',
      uptime_days:     isProd ? 35 : 12,
      os:              'x86_64/Linux 2.4.xx',
      cpus:            isProd ? 16 : 8,
      // ── Clients ─────────────────────────────────
      num_clients:     Math.floor(Math.random() * 20) + 5,
      avg_response_ms: Math.round((Math.random() * 2 + 0.1) * 10) / 10,
      network_in_kbs:  Math.round(Math.random() * 8 * 10) / 10,
      network_out_kbs: Math.round(Math.random() * 4 * 10) / 10,
      // ── Sessions ────────────────────────────────
      sessions_active:   Math.floor(Math.random() * 80) + 20,
      sessions_inactive: Math.floor(Math.random() * 30) + 5,
      sessions_blocked:  blockedSessions,
      sessions_total:    Math.floor(Math.random() * 120) + 30,
      sessions_chart:    timeSeries(60, 40),
      // ── Processes ────────────────────────────────
      num_dispatchers:        1,
      num_shared_servers:     1,
      num_dedicated_servers:  Math.floor(Math.random() * 100) + 150,
      num_parallel_servers:   Math.floor(Math.random() * 20) + 24,
      num_busy_parallel:      Math.floor(Math.random() * 3),
      num_job_servers:        0,
      // ── Execution / Parse / Cursors / Commits ────
      execution_rate_chart:   timeSeries(180, 80),
      parse_rate_chart:       timeSeries(3, 2),
      open_cursors_chart:     timeSeries(6, 4),
      commit_rate_chart:      timeSeries(3, 2),
      // ── Waits ───────────────────────────────────
      waits_chart: timeSeries(2, 3),
      wait_breakdown: {
        administrative:  Math.random() * 0.1,
        application:     Math.random() * 0.3,
        commit:          Math.random() * 0.5,
        concurrency:     Math.random() * 0.2,
        configuration:   Math.random() * 0.1,
        network:         Math.random() * 0.4,
        other:           Math.random() * 0.2,
        scheduler:       Math.random() * 0.1,
        system_io:       Math.random() * 0.8,
        user_io:         Math.random() * 1.5,
      },
      // ── DB CPU Ratio ─────────────────────────────
      db_cpu_ratio_pct:  Math.floor(Math.random() * 20) + 65,
      db_cpu_chart:      timeSeries(75, 15),
      // ── Memory ──────────────────────────────────
      sga_currently_used_gb: 24.0,
      sga_maximum_size_gb:   24.0,
      buffer_cache_size_gb:  19.7,
      redo_log_buffers_mb:   109.4,
      shared_pool_size_gb:   3.7,
      large_pool_size_mb:    512,
      db_block_rate_chart:   timeSeries(6, 4),
      logical_reads_chart:   timeSeries(400000, 200000),
      redo_generated_chart:  timeSeries(800, 200),
      // ── Storage ──────────────────────────────────
      storage_data_pct:      tablespacePct,
      storage_data_tb:       1.2,
      storage_temp_pct:      Math.floor(Math.random() * 10),
      storage_temp_gb:       587.4,
      storage_undo_pct:      Math.floor(Math.random() * 15) + 2,
      storage_undo_gb:       32.0,
      storage_io_chart:      timeSeries(5, 4),
      // ── Redo Log ─────────────────────────────────
      redo_log_group:        '#27378',
      redo_log_used_pct:     Math.floor(Math.random() * 40) + 40,
      redo_log_size_gb:      2.0,
      redo_log_fill_chart:   timeSeries(1.2, 1.0),
      redo_log_sequence:     Math.floor(Math.random() * 5) + 27373,
      log_count_current:     1,
      log_count_active:      0,
      log_count_inactive:    3,
      log_count_cleaning:    0,
      log_count_unused:      0,
      // ── Tablespace summary ───────────────────────
      tablespace_usage_pct:  tablespacePct,
      redo_log_switches_hr:  Math.floor(Math.random() * 20),
      sga_hit_ratio_pct:     Math.floor(Math.random() * 10) + 90,
      // ── Tablespace utilization (disk_mounts) ─────
      disk_mounts: [
        { mount: 'SYSTEM',     total_gb: 0.89, used_gb: 0.87, free_gb: 0.02, used_pct: 97.8 },
        { mount: 'SYSAUX',     total_gb: 1.20, used_gb: 0.98, free_gb: 0.22, used_pct: 81.7 },
        { mount: 'USERS',      total_gb: 20.0, used_gb: +(tablespacePct / 100 * 20).toFixed(2), free_gb: +(20 - tablespacePct / 100 * 20).toFixed(2), used_pct: tablespacePct },
        { mount: 'UNDOTBS1',   total_gb: 32.0, used_gb: 4.2,  free_gb: 27.8, used_pct: 13.1 },
        { mount: 'TEMP',       total_gb: 10.0, used_gb: 1.4,  free_gb: 8.6,  used_pct: 14.0 },
        { mount: 'AUDIT_DATA', total_gb: 5.0,  used_gb: 2.1,  free_gb: 2.9,  used_pct: 42.0 },
      ],
    },
  }
}

function mockMssqlHealth(conn: DbConnection): HealthMetrics {
  const isProd = conn.environment === 'production'
  const score = isProd ? Math.floor(Math.random() * 25) + 70 : Math.floor(Math.random() * 20) + 80
  const memoryPct = Math.floor(Math.random() * 30) + 60
  const now = Date.now()

  const timeSeries = (base: number, variance: number) =>
    Array.from({ length: 10 }, (_, i) => ({
      t: new Date(now - (9 - i) * 30000).toISOString(),
      v: Math.max(0, base + Math.floor((Math.random() - 0.5) * variance)),
    }))

  return {
    score,
    status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
    blocked_sessions: Math.floor(Math.random() * 3),
    active_alerts: memoryPct > 85 ? 1 : 0,
    details: {
      adapter: 'mock',
      // ── Server Info ──────────────────────────────
      db_version:            'SQL Server 2022 (16.0)',
      uptime_days:           isProd ? 28 : 7,
      os:                    'Windows Server 2022',
      cpus:                  isProd ? 16 : 8,
      // ── Connections ──────────────────────────────
      active_connections:    Math.floor(Math.random() * 100) + 20,
      max_connections:       32767,
      // ── Memory ──────────────────────────────────
      buffer_pool_memory_pct: memoryPct,
      target_server_memory_gb: isProd ? 64 : 16,
      total_server_memory_gb:  isProd ? (64 * memoryPct) / 100 : (16 * memoryPct) / 100,
      page_life_expectancy_sec: Math.floor(Math.random() * 200) + 600,
      memory_pressure_chart:   timeSeries(memoryPct, 10),
      // ── Waits & Blocking ─────────────────────────
      blocking_spids:          Math.floor(Math.random() * 3),
      deadlocks_per_min:       Math.floor(Math.random() * 3),
      top_wait_types: [
        { wait_type: 'CXPACKET',     wait_ms: Math.floor(Math.random() * 5000) + 1000 },
        { wait_type: 'LCK_M_S',      wait_ms: Math.floor(Math.random() * 2000) },
        { wait_type: 'PAGEIOLATCH',  wait_ms: Math.floor(Math.random() * 1000) },
        { wait_type: 'SOS_SCHEDULER',wait_ms: Math.floor(Math.random() * 800)  },
        { wait_type: 'WRITELOG',     wait_ms: Math.floor(Math.random() * 500)  },
      ],
      blocking_chart: timeSeries(1, 3),
      // ── Query Performance ─────────────────────────
      avg_query_time_ms:    Math.floor(Math.random() * 500) + 50,
      cpu_usage_pct:        Math.floor(Math.random() * 40) + 30,
      batch_requests_sec:   Math.floor(Math.random() * 500) + 100,
      compilations_sec:     Math.floor(Math.random() * 50) + 10,
      recompilations_sec:   Math.floor(Math.random() * 10),
      query_perf_chart:     timeSeries(200, 150),
      cpu_chart:            timeSeries(45, 20),
      // ── Disk I/O ─────────────────────────────────
      disk_reads_per_sec:   Math.floor(Math.random() * 200) + 50,
      disk_writes_per_sec:  Math.floor(Math.random() * 100) + 20,
      io_chart:             timeSeries(150, 80),
      // ── Log ───────────────────────────────────────
      log_flush_per_sec:    Math.floor(Math.random() * 100) + 20,
      log_cache_hit_pct:    Math.floor(Math.random() * 10) + 88,
    },
  }
}

function mockMariaDbHealth(conn: DbConnection): HealthMetrics {
  const isProd = conn.environment === 'production'
  const score = isProd ? Math.floor(Math.random() * 20) + 78 : Math.floor(Math.random() * 15) + 85
  const now = Date.now()

  const timeSeries = (base: number, variance: number) =>
    Array.from({ length: 10 }, (_, i) => ({
      t: new Date(now - (9 - i) * 30000).toISOString(),
      v: Math.max(0, base + Math.floor((Math.random() - 0.5) * variance)),
    }))

  return {
    score,
    status: score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical',
    blocked_sessions: 0,
    active_alerts: 0,
    details: {
      adapter: 'mock',
      // ── Server Info ───────────────────────────────
      db_version:   '10.11.7-MariaDB',
      uptime_days:  isProd ? 21 : 5,
      os:           'Linux x86_64',
      cpus:         isProd ? 8 : 4,
      // ── Connections ───────────────────────────────
      active_connections:  Math.floor(Math.random() * 60) + 10,
      max_connections:     500,
      thread_cache_size:   100,
      threads_running:     Math.floor(Math.random() * 10) + 1,
      connection_chart:    timeSeries(40, 20),
      // ── InnoDB Buffer Pool ─────────────────────────
      innodb_buffer_pool_size_gb:    isProd ? 16 : 4,
      innodb_buffer_hit_ratio_pct:   Math.floor(Math.random() * 5) + 94,
      innodb_buffer_read_requests:   Math.floor(Math.random() * 500000) + 100000,
      innodb_buffer_reads:           Math.floor(Math.random() * 5000),
      innodb_rows_read_per_sec:      Math.floor(Math.random() * 5000) + 500,
      innodb_rows_written_per_sec:   Math.floor(Math.random() * 1000) + 100,
      buffer_hit_chart:              timeSeries(96, 4),
      innodb_io_chart:               timeSeries(200, 100),
      // ── Slow Queries ──────────────────────────────
      slow_queries_per_min:     Math.floor(Math.random() * 5),
      slow_query_log_enabled:   true,
      long_query_time_sec:      2,
      slow_query_chart:         timeSeries(2, 4),
      // ── Replication ───────────────────────────────
      replication_running:         isProd,
      replication_io_running:      isProd ? 'Yes' : 'No',
      replication_sql_running:     isProd ? 'Yes' : 'No',
      replication_lag_sec:         conn.environment === 'production' ? 0 : Math.floor(Math.random() * 3),
      replication_lag_chart:       timeSeries(0.5, 2),
      replication_master_host:     isProd ? 'prod-mar-primary.internal' : null,
      replication_master_log_file: isProd ? `binlog.0001${Math.floor(Math.random() * 40) + 80}` : null,
      replication_master_log_pos:  isProd ? Math.floor(Math.random() * 1000000) + 500000 : null,
      replication_relay_log_file:  isProd ? `relay-bin.000042` : null,
      replication_last_error:      null,
      // ── Storage ──────────────────────────────────
      disk_usage_pct:       Math.floor(Math.random() * 30) + 40,
      disk_used_gb:         Math.floor(Math.random() * 200) + 100,
      disk_total_gb:        500,
      disk_io_chart:        timeSeries(80, 50),
      // ── Queries ───────────────────────────────────
      queries_per_sec:      Math.floor(Math.random() * 2000) + 500,
      select_per_sec:       Math.floor(Math.random() * 1500) + 300,
      insert_per_sec:       Math.floor(Math.random() * 200) + 50,
      update_per_sec:       Math.floor(Math.random() * 150) + 30,
      delete_per_sec:       Math.floor(Math.random() * 50),
      query_chart:          timeSeries(1200, 600),
      // ── Table Locks ───────────────────────────────
      table_lock_waited:    Math.floor(Math.random() * 10),
      table_lock_immediate: Math.floor(Math.random() * 500) + 100,
    },
  }
}

// ─── Adapter Router ───────────────────────────────────────────────────────────

function getMockMetrics(conn: DbConnection): HealthMetrics {
  switch (conn.db_type) {
    case 'oracle':  return mockOracleHealth(conn)
    case 'mssql':   return mockMssqlHealth(conn)
    case 'mariadb': return mockMariaDbHealth(conn)
  }
}

/**
 * Route to live adapter if credentials are stored, otherwise use mock.
 * When live credentials exist and the adapter fails, we do NOT fall back to
 * mock — the DBA needs to see real errors, not fake green data.
 */
async function getMetrics(conn: DbConnection): Promise<HealthMetrics> {
  const creds = await getConnectionCredentials(conn.id)

  if (!creds) {
    // No credentials stored — use mock adapter (demo/seed connections)
    return getMockMetrics(conn)
  }

  const defaultPorts: Record<string, number> = { oracle: 1521, mssql: 1433, mariadb: 3306 }
  const dbCreds = {
    host:     conn.host,
    port:     conn.port ?? defaultPorts[conn.db_type] ?? 3306,
    database: conn.service_name ?? conn.database_name ?? '',
    username: creds.username,
    password: creds.password,
    options:  creds.oracle_privilege ? { privilege: creds.oracle_privilege } : undefined,
  }

  const adapter = await getAdapter(conn.db_type as 'oracle' | 'mssql' | 'mariadb')
  const details = await adapter.getHealthMetrics(dbCreds)  // throws on failure — intentional

  const score  = deriveScore(conn.db_type as string, details)
  const status: HealthStatus = score >= 80 ? 'healthy' : score >= 60 ? 'warning' : 'critical'

  return {
    score,
    status,
    blocked_sessions: Number((details as any).sessions?.blocked ?? (details as any).blocking_spids ?? 0),
    active_alerts: 0,
    details: { ...details, adapter: 'live' },
  }
}

function deriveScore(dbType: string, details: Record<string, unknown>): number {
  // Heuristic scoring from flat live metric keys (matching live adapter output shape)
  let score = 100
  if (dbType === 'oracle') {
    const dataPct = (details as any).storage_data_pct ?? 0
    if (dataPct >= 90) score -= 30
    else if (dataPct >= 80) score -= 15
    const blocked = (details as any).sessions_blocked ?? 0
    if (blocked > 0) score -= Math.min(20, blocked * 5)
  }
  if (dbType === 'mssql') {
    const memPct = (details as any).buffer_pool_memory_pct ?? 0
    if (memPct >= 90) score -= 25
    else if (memPct >= 80) score -= 10
    const blocking = (details as any).blocking_spids ?? 0
    if (blocking > 0) score -= Math.min(20, blocking * 5)
  }
  if (dbType === 'mariadb') {
    const hitRatio = (details as any).innodb_buffer_hit_ratio_pct ?? 100
    if (hitRatio < 85) score -= 20
    else if (hitRatio < 92) score -= 10
    const lag = (details as any).replication_lag_sec ?? 0
    if (lag > 30) score -= 20
    else if (lag > 5) score -= 10
  }
  return Math.max(0, Math.min(100, score))
}

// ─── Core Scanner ────────────────────────────────────────────────────────────

export async function scanConnection(conn: DbConnection): Promise<HealthSnapshot> {
  let metrics: HealthMetrics
  try {
    metrics = await getMetrics(conn)
  } catch (err: any) {
    // Live adapter threw (bad credentials, network, driver error)
    // Write a real critical snapshot — DBA must see this, not mock green data
    console.error(`[healthScanner] Live scan failed for ${conn.name}: ${err.message}`)

    // NJS-138: thin mode does not support Oracle 11g — adapter auto-retries with thick mode,
    // but if Instant Client is not installed that retry also fails with a clear message.
    let errorMsg: string = err.message

    metrics = {
      score:            0,
      status:           'critical',
      blocked_sessions: 0,
      active_alerts:    1,
      details: {
        adapter:       'live',
        error:         errorMsg,
        error_at:      new Date().toISOString(),
      },
    }
  }

  const snapshot = {
    connection_id:    conn.id,
    score:            metrics.score,
    status:           metrics.status,
    metrics:          metrics.details,
    active_alerts:    metrics.active_alerts,
    blocked_sessions: metrics.blocked_sessions,
    scored_at:        new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('health_snapshots')
    .insert(snapshot)
    .select()
    .single()

  if (error) throw new Error(`Failed to save health snapshot: ${error.message}`)

  // Update connection last_checked_at
  await supabase
    .from('connections')
    .update({ last_checked_at: snapshot.scored_at })
    .eq('id', conn.id)

  // Auto-fire alerts for critical conditions
  await evaluateAlerts(conn, metrics)

  return data as HealthSnapshot
}

export async function triggerManualScan(conn: DbConnection): Promise<HealthSnapshot> {
  return scanConnection(conn)
}

// Maximum concurrent DB scans per batch. Keeps the Supabase connection pool
// free for live user traffic even when the fleet is large.
const SCAN_BATCH_SIZE = 3

/**
 * Scan all active connections, optionally filtered to specific health statuses.
 *
 * Called by two BullMQ jobs:
 *   priority-scan  (every 1 min)  → statuses: ['critical', 'warning']
 *   routine-scan   (every 3 min)  → statuses: ['healthy']
 *
 * The two-tier approach means a connection that just turned critical is
 * re-evaluated within 60 seconds — fast enough for mission-critical alerting —
 * while steady healthy connections only consume scan budget every 3 minutes.
 */
export async function scanAllConnections(
  statuses: string[] = ['critical', 'warning', 'healthy'],
): Promise<void> {
  // Map health statuses → latest health_snapshot status, but we need to
  // filter on the connections themselves. We join via the last snapshot.
  // Simplest approach: always pull active connections then filter client-side
  // on the last known status from the snapshot (already present in connections.status
  // if we keep it in sync) — or fetch all and skip non-matching.
  //
  // Because health_snapshots.status is written per connection on each scan,
  // we query connections joined to their latest snapshot status.
  const { data: connections, error } = await supabase
    .from('connections')
    .select('*, health_snapshots(status, scored_at)')
    .eq('status', 'active')
    .order('scored_at', { referencedTable: 'health_snapshots', ascending: false })
    .limit(1, { referencedTable: 'health_snapshots' })

  if (error || !connections || connections.length === 0) return

  // Filter to connections whose latest snapshot status matches the requested tier.
  // New connections with no snapshot yet always fall through to the priority tier.
  const targets = connections.filter((conn: any) => {
    const latestStatus = conn.health_snapshots?.[0]?.status ?? 'critical'
    return statuses.includes(latestStatus)
  })

  if (targets.length === 0) return

  // Process in fixed-size batches — never more than SCAN_BATCH_SIZE
  // live adapter calls + Supabase writes in flight simultaneously.
  for (let i = 0; i < targets.length; i += SCAN_BATCH_SIZE) {
    const batch = targets.slice(i, i + SCAN_BATCH_SIZE)
    await Promise.allSettled(
      batch.map((conn: any) => scanConnection(conn as DbConnection)),
    )
  }
}

// ─── Alert Evaluation ────────────────────────────────────────────────────────

async function evaluateAlerts(conn: DbConnection, metrics: HealthMetrics) {
  const alerts: Array<{
    connection_id: string
    severity: 'critical' | 'warning' | 'info'
    type: string
    message: string
    details: Record<string, unknown>
  }> = []

  if (conn.db_type === 'oracle') {
    const tablespacePct = metrics.details.tablespace_usage_pct as number
    if (tablespacePct >= 90) {
      alerts.push({
        connection_id: conn.id,
        severity: 'critical',
        type: 'tablespace_near_limit',
        message: `SYSTEM tablespace at ${tablespacePct}% — immediate action required`,
        details: { tablespace_usage_pct: tablespacePct },
      })
    } else if (tablespacePct >= 80) {
      alerts.push({
        connection_id: conn.id,
        severity: 'warning',
        type: 'tablespace_near_limit',
        message: `Tablespace at ${tablespacePct}% — monitor closely`,
        details: { tablespace_usage_pct: tablespacePct },
      })
    }
  }

  if (conn.db_type === 'mssql') {
    const memPct = metrics.details.buffer_pool_memory_pct as number
    if (memPct >= 90) {
      alerts.push({
        connection_id: conn.id,
        severity: 'critical',
        type: 'high_memory_usage',
        message: `Buffer pool consuming ${memPct}% of RAM`,
        details: { buffer_pool_memory_pct: memPct },
      })
    }
  }

  if (metrics.blocked_sessions > 0) {
    alerts.push({
      connection_id: conn.id,
      severity: metrics.blocked_sessions >= 3 ? 'critical' : 'warning',
      type: 'blocked_sessions',
      message: `${metrics.blocked_sessions} session(s) blocked on ${conn.name}`,
      details: { blocked_sessions: metrics.blocked_sessions },
    })
  }

  if (alerts.length > 0) {
    await supabase.from('alerts').insert(alerts)
  }
}
