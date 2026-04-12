import { Router } from 'express'
import { requireAuth, requireRole, requireAAL2 } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { healthScanQueue } from '../workers/healthScanWorker.js'

const router = Router()

// All services routes require super_admin + aal2
router.use(requireAuth, requireRole('super_admin'), requireAAL2)

// ─── GET /api/admin/services/overview ─────────────────────────────────────────
// Returns all 6 sections in a single payload to minimize round-trips.
router.get('/overview', async (_req, res) => {
  try {
    const [
      serviceStatus,
      workerStats,
      scanHistory,
      systemMetrics,
      recentErrors,
      activityLog,
    ] = await Promise.allSettled([
      getServiceStatus(),
      getWorkerQueueStats(),
      getScanHistory(),
      getSystemMetrics(),
      getRecentErrors(),
      getActivityLog(),
    ])

    res.json({
      data: {
        service_status:  serviceStatus.status === 'fulfilled'  ? serviceStatus.value  : null,
        worker_stats:    workerStats.status === 'fulfilled'    ? workerStats.value    : null,
        scan_history:    scanHistory.status === 'fulfilled'    ? scanHistory.value    : null,
        system_metrics:  systemMetrics.status === 'fulfilled'  ? systemMetrics.value  : null,
        recent_errors:   recentErrors.status === 'fulfilled'   ? recentErrors.value   : null,
        activity_log:    activityLog.status === 'fulfilled'    ? activityLog.value    : null,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to fetch services overview' })
  }
})

export default router

// ─── Data Fetchers ────────────────────────────────────────────────────────────

async function getServiceStatus() {
  const services: Array<{
    name: string
    status: 'healthy' | 'degraded' | 'down'
    details: string
    checked_at: string
  }> = []

  const now = new Date().toISOString()

  // 1. API — if we're responding, we're alive
  services.push({
    name: 'API Server',
    status: 'healthy',
    details: `Running on port ${process.env.PORT ?? 4000}`,
    checked_at: now,
  })

  // 2. Database (Supabase/PostgreSQL)
  try {
    const start = Date.now()
    const { error } = await supabase.from('connections').select('id').limit(1)
    const latency = Date.now() - start
    services.push({
      name: 'Database',
      status: error ? 'down' : latency > 2000 ? 'degraded' : 'healthy',
      details: error ? error.message : `Latency: ${latency}ms`,
      checked_at: now,
    })
  } catch (err: any) {
    services.push({ name: 'Database', status: 'down', details: err.message, checked_at: now })
  }

  // 3. Redis / BullMQ
  try {
    const { redis } = await import('../config/redis.js')
    const start = Date.now()
    await redis.ping()
    const latency = Date.now() - start
    services.push({
      name: 'Redis',
      status: latency > 1000 ? 'degraded' : 'healthy',
      details: `Latency: ${latency}ms`,
      checked_at: now,
    })
  } catch (err: any) {
    services.push({ name: 'Redis', status: 'down', details: err.message, checked_at: now })
  }

  // 4. Supabase Auth (GoTrue)
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.SUPABASE_URL ?? 'http://localhost:8000',
      process.env.SUPABASE_SERVICE_KEY ?? '',
    )
    const start = Date.now()
    const { error } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1 })
    const latency = Date.now() - start
    services.push({
      name: 'Auth (GoTrue)',
      status: error ? 'degraded' : latency > 3000 ? 'degraded' : 'healthy',
      details: error ? error.message : `Latency: ${latency}ms`,
      checked_at: now,
    })
  } catch (err: any) {
    services.push({ name: 'Auth (GoTrue)', status: 'down', details: err.message, checked_at: now })
  }

  return services
}

async function getWorkerQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed, repeatableJobs] = await Promise.all([
      healthScanQueue.getWaitingCount(),
      healthScanQueue.getActiveCount(),
      healthScanQueue.getCompletedCount(),
      healthScanQueue.getFailedCount(),
      healthScanQueue.getDelayedCount(),
      healthScanQueue.getRepeatableJobs(),
    ])

    // Get most recent completed/failed jobs for timing info
    const recentCompleted = await healthScanQueue.getCompleted(0, 5)
    const recentFailed = await healthScanQueue.getFailed(0, 5)

    return {
      counts: { waiting, active, completed, failed, delayed },
      repeatable_jobs: repeatableJobs.map((j) => ({
        name: j.name,
        pattern: j.pattern,
        next: j.next ? new Date(j.next).toISOString() : null,
      })),
      recent_completed: recentCompleted.map((j) => ({
        id: j.id,
        name: j.name,
        finished_at: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
        duration_ms: j.finishedOn && j.processedOn ? j.finishedOn - j.processedOn : null,
        result: j.returnvalue,
      })),
      recent_failed: recentFailed.map((j) => ({
        id: j.id,
        name: j.name,
        failed_at: j.finishedOn ? new Date(j.finishedOn).toISOString() : null,
        error: j.failedReason,
        attempts: j.attemptsMade,
      })),
    }
  } catch {
    return null
  }
}

async function getScanHistory() {
  // Last 24h of scan activity — grouped by hour
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const { data: snapshots, error } = await supabase
    .from('health_snapshots')
    .select('status, scored_at')
    .gte('scored_at', since)
    .order('scored_at', { ascending: true })

  if (error) throw new Error(error.message)

  // Group by hour bucket
  const hourBuckets: Record<string, { total: number; healthy: number; warning: number; critical: number }> = {}
  for (const s of snapshots ?? []) {
    const hour = s.scored_at.slice(0, 13) // "2025-01-15T10"
    if (!hourBuckets[hour]) hourBuckets[hour] = { total: 0, healthy: 0, warning: 0, critical: 0 }
    hourBuckets[hour].total++
    if (s.status === 'healthy') hourBuckets[hour].healthy++
    else if (s.status === 'warning') hourBuckets[hour].warning++
    else hourBuckets[hour].critical++
  }

  const timeline = Object.entries(hourBuckets)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, counts]) => ({ hour: hour + ':00:00Z', ...counts }))

  // Status distribution for the period
  const totalScans = (snapshots ?? []).length
  const statusCounts: Record<string, number> = {}
  for (const s of snapshots ?? []) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1
  }

  return {
    total_scans_24h: totalScans,
    status_distribution: statusCounts,
    timeline,
  }
}

async function getSystemMetrics() {
  // Connection counts by status and type
  const { data: conns, error: connErr } = await supabase
    .from('connections')
    .select('id, db_type, environment, status')

  if (connErr) throw new Error(connErr.message)

  const byType: Record<string, number> = {}
  const byEnv: Record<string, number> = {}
  let activeCount = 0

  for (const c of conns ?? []) {
    byType[c.db_type] = (byType[c.db_type] ?? 0) + 1
    byEnv[c.environment] = (byEnv[c.environment] ?? 0) + 1
    if (c.status === 'active') activeCount++
  }

  // User counts
  const { count: totalUsers } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })

  const { count: activeUsers } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .is('deactivated_at', null)

  // Alert counts (last 24h)
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: alertCount24h } = await supabase
    .from('alerts')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since24h)

  // Snapshot counts (last 24h)
  const { count: snapshotCount24h } = await supabase
    .from('health_snapshots')
    .select('id', { count: 'exact', head: true })
    .gte('scored_at', since24h)

  // Process metrics
  const mem = process.memoryUsage()

  return {
    connections: {
      total: (conns ?? []).length,
      active: activeCount,
      by_type: byType,
      by_environment: byEnv,
    },
    users: {
      total: totalUsers ?? 0,
      active: activeUsers ?? 0,
    },
    alerts_24h: alertCount24h ?? 0,
    snapshots_24h: snapshotCount24h ?? 0,
    process: {
      uptime_s: Math.round(process.uptime()),
      memory_mb: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heap_used: Math.round(mem.heapUsed / 1024 / 1024),
        heap_total: Math.round(mem.heapTotal / 1024 / 1024),
      },
      node_version: process.version,
    },
  }
}

async function getRecentErrors() {
  // Recent critical alerts
  const { data: criticalAlerts, error: alertErr } = await supabase
    .from('alerts')
    .select('id, connection_id, severity, type, message, created_at')
    .eq('severity', 'critical')
    .order('created_at', { ascending: false })
    .limit(20)

  if (alertErr) throw new Error(alertErr.message)

  // Failed scan snapshots (score = 0 means adapter error)
  const { data: failedScans, error: scanErr } = await supabase
    .from('health_snapshots')
    .select('id, connection_id, score, metrics, scored_at')
    .eq('score', 0)
    .order('scored_at', { ascending: false })
    .limit(10)

  if (scanErr) throw new Error(scanErr.message)

  return {
    critical_alerts: criticalAlerts ?? [],
    failed_scans: (failedScans ?? []).map((s) => ({
      id: s.id,
      connection_id: s.connection_id,
      error: (s.metrics as any)?.error ?? 'Unknown error',
      error_at: (s.metrics as any)?.error_at ?? s.scored_at,
      scored_at: s.scored_at,
    })),
  }
}

async function getActivityLog() {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw new Error(error.message)
  return data ?? []
}
