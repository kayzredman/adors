import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'

const router = Router()

// ─── GET /api/analytics/fleet?days=7 ─────────────────────────────────────────
// Returns: score trends per connection, prod/UAT averages, worst performers
router.get('/fleet', requireAuth, async (req, res) => {
  const days = Math.min(parseInt(String(req.query.days ?? '7'), 10) || 7, 90)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  try {
    // All connections
    const { data: conns, error: connErr } = await supabase
      .from('connections')
      .select('id,name,db_type,environment')
      .order('environment', { ascending: true })
      .order('name', { ascending: true })
    if (connErr) throw new Error(connErr.message)

    // Score history — one row per (connection, hour bucket) to keep payload small
    const { data: snaps, error: snapErr } = await supabase
      .from('health_snapshots')
      .select('connection_id,score,status,scored_at')
      .gte('scored_at', since)
      .order('scored_at', { ascending: true })
    if (snapErr) throw new Error(snapErr.message)

    // Latest snapshot per connection (for current score / status)
    const { data: latest, error: latestErr } = await supabase
      .from('health_snapshots')
      .select('connection_id,score,status,scored_at')
      .order('scored_at', { ascending: false })
    if (latestErr) throw new Error(latestErr.message)

    // Deduplicate to one latest snapshot per connection
    const latestByConn: Record<string, any> = {}
    for (const s of (latest ?? [])) {
      if (!latestByConn[s.connection_id]) latestByConn[s.connection_id] = s
    }

    // Build per-connection trend arrays
    const trendsById: Record<string, { t: string; v: number }[]> = {}
    for (const s of (snaps ?? [])) {
      if (!trendsById[s.connection_id]) trendsById[s.connection_id] = []
      trendsById[s.connection_id].push({ t: s.scored_at, v: s.score })
    }

    // Assemble connection summaries
    const connections = (conns ?? []).map((c) => {
      const snap = latestByConn[c.id]
      return {
        id:          c.id,
        name:        c.name,
        db_type:     c.db_type,
        environment: c.environment,
        score:       snap?.score   ?? null,
        status:      snap?.status  ?? 'unknown',
        scored_at:   snap?.scored_at ?? null,
        trend:       trendsById[c.id] ?? [],
      }
    })

    // Fleet averages (only connections that have snapshots)
    const withScores = connections.filter(c => c.score !== null)
    const avg = (arr: typeof withScores) =>
      arr.length ? Math.round(arr.reduce((s, c) => s + c.score!, 0) / arr.length) : null

    const prod = withScores.filter(c => c.environment === 'production')
    const uat  = withScores.filter(c => c.environment === 'uat')
    const dr   = withScores.filter(c => c.environment === 'dr')

    // Worst 5 performers
    const worstPerformers = [...withScores]
      .sort((a, b) => a.score! - b.score!)
      .slice(0, 5)

    // Per-DB-type breakdown
    const allDbTypes = ['oracle', 'mssql', 'mariadb'] as const
    const by_db_type = Object.fromEntries(
      allDbTypes.map(dbType => {
        const all    = (conns ?? []).filter(c => c.db_type === dbType)
        const scored = withScores.filter(c => c.db_type === dbType)
        return [dbType, {
          count:      all.length,
          avg:        scored.length ? Math.round(scored.reduce((s, c) => s + c.score!, 0) / scored.length) : null,
          worst:      [...scored].sort((a, b) => a.score! - b.score!).slice(0, 3),
        }]
      })
    )

    // Fleet-wide score trend over the window (average score per day)
    const dayBuckets: Record<string, number[]> = {}
    for (const s of (snaps ?? [])) {
      const day = s.scored_at.slice(0, 10)
      if (!dayBuckets[day]) dayBuckets[day] = []
      dayBuckets[day].push(s.score)
    }
    const fleetTrend = Object.entries(dayBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, scores]) => ({
        t: day,
        v: Math.round(scores.reduce((s, n) => s + n, 0) / scores.length),
      }))

    res.json({
      data: {
        connections,
        averages: {
          fleet:      avg(withScores),
          production: avg(prod),
          uat:        avg(uat),
          dr:         avg(dr),
        },
        worst_performers: worstPerformers,
        fleet_trend:      fleetTrend,
        by_db_type,
        days,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/analytics/:id?days=30 ──────────────────────────────────────────
// Returns: score history + key metric trends for one connection
router.get('/:id', requireAuth, async (req, res) => {
  const { id } = req.params
  const days  = Math.min(parseInt(String(req.query.days ?? '30'), 10) || 30, 90)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  try {
    const { data: conn, error: connErr } = await supabase
      .from('connections')
      .select('id,name,db_type,environment')
      .eq('id', id)
      .single()
    if (connErr) throw new Error('Connection not found')

    const { data: snaps, error: snapErr } = await supabase
      .from('health_snapshots')
      .select('score,status,metrics,scored_at')
      .eq('connection_id', id)
      .gte('scored_at', since)
      .order('scored_at', { ascending: true })
    if (snapErr) throw new Error(snapErr.message)

    const rows = snaps ?? []

    // Score history
    const score_history = rows.map(s => ({ t: s.scored_at, v: s.score }))

    // Status distribution
    const status_counts: Record<string, number> = {}
    for (const s of rows) status_counts[s.status] = (status_counts[s.status] ?? 0) + 1

    // Extract metric sparklines from stored metrics JSONB
    // Pull whatever numeric keys are present — gracefully handles different DB types
    const metricKeys = [
      // Oracle
      'sessions_active', 'sessions_blocked', 'storage_data_pct', 'sga_currently_used_gb',
      'storage_temp_pct', 'storage_undo_pct', 'redo_log_used_pct', 'tablespace_usage_pct',
      'db_cpu_ratio_pct',
      // MSSQL
      'active_connections', 'buffer_pool_memory_pct', 'cpu_usage_pct', 'blocking_spids',
      'page_life_expectancy_sec', 'batch_requests_sec', 'deadlocks_per_min',
      'disk_reads_per_sec', 'disk_writes_per_sec', 'total_server_memory_gb',
      // MariaDB / shared
      'innodb_buffer_hit_ratio_pct', 'queries_per_sec', 'replication_lag_sec',
      'slow_queries_per_min', 'table_lock_waited', 'disk_usage_pct', 'disk_used_gb',
      // All adapters
      'uptime_days',
    ]

    const metric_trends: Record<string, { t: string; v: number }[]> = {}
    for (const key of metricKeys) {
      const series = rows
        .filter(s => s.metrics?.[key] != null)
        .map(s => ({ t: s.scored_at, v: Number(s.metrics[key]) }))
      if (series.length > 0) metric_trends[key] = series
    }

    // Averages / min / max for score
    const scores = rows.map(r => r.score)
    const scoreStats = scores.length
      ? {
          avg: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
          min: Math.min(...scores),
          max: Math.max(...scores),
        }
      : null

    // Latest snapshot metrics (non-trending fields: backup_history, disk_mounts, ha_state)
    const latestSnap = rows[rows.length - 1]
    const latest_metrics: Record<string, unknown> = latestSnap?.metrics ?? {}

    res.json({
      data: {
        connection:     conn,
        days,
        score_history,
        score_stats:    scoreStats,
        status_counts,
        metric_trends,
        latest_metrics,
        snapshot_count: rows.length,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
