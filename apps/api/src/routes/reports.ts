import { Router } from 'express'
import { requireAuth, requireDBA } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'

const router = Router()

// ─── Helper: clamp days param ────────────────────────────────────────────────
function parseDays(raw: unknown, def = 30, max = 90): number {
  return Math.min(parseInt(String(raw ?? def), 10) || def, max)
}

// ─── GET /api/reports/capacity?days=30 ───────────────────────────────────────
// Returns storage / connection / memory trends per connection for capacity planning
router.get('/capacity', requireAuth, async (req, res) => {
  const days = parseDays(req.query.days, 30)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  try {
    const { data: conns, error: cErr } = await supabase
      .from('connections')
      .select('id,name,db_type,environment')
      .order('name')
    if (cErr) throw new Error(cErr.message)

    const { data: snaps, error: sErr } = await supabase
      .from('health_snapshots')
      .select('connection_id,score,metrics,scored_at')
      .gte('scored_at', since)
      .order('scored_at', { ascending: true })
    if (sErr) throw new Error(sErr.message)

    // Group snapshots by connection
    const byConn: Record<string, typeof snaps> = {}
    for (const s of (snaps ?? [])) {
      if (!byConn[s.connection_id]) byConn[s.connection_id] = []
      byConn[s.connection_id].push(s)
    }

    const connections = (conns ?? []).map(c => {
      const rows = byConn[c.id] ?? []

      const trend = rows.map(s => {
        const m = (s.metrics ?? {}) as Record<string, unknown>
        return {
          t: s.scored_at,
          storage_pct: extractStoragePct(m, c.db_type),
          connections_pct: extractConnectionsPct(m),
          memory_pct: extractMemoryPct(m, c.db_type),
          score: s.score,
        }
      })

      const last = rows[rows.length - 1]
      const lm = (last?.metrics ?? {}) as Record<string, unknown>

      return {
        connection_id: c.id,
        connection_name: c.name,
        db_type: c.db_type,
        environment: c.environment,
        trend,
        current: {
          storage_pct: extractStoragePct(lm, c.db_type),
          connections_pct: extractConnectionsPct(lm),
          memory_pct: extractMemoryPct(lm, c.db_type),
          throughput: extractThroughput(lm, c.db_type),
          cpu_pct: extractCpuPct(lm, c.db_type),
          os_memory: extractOsMemory(lm),
          disk_mounts: extractDiskMounts(lm),
          filegroup_breakdown: extractFilegroupBreakdown(lm),
        },
      }
    })

    res.json({ data: { connections, days } })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/reports/fleet ──────────────────────────────────────────────────
// Fleet-wide health summary: status breakdown, per-type/env stats, score distribution
router.get('/fleet', requireAuth, async (req, res) => {
  try {
    const { data: conns, error: cErr } = await supabase
      .from('connections')
      .select('id,name,db_type,environment')
    if (cErr) throw new Error(cErr.message)

    // Latest snapshot per connection
    const { data: latest, error: lErr } = await supabase
      .from('health_snapshots')
      .select('connection_id,score,status,scored_at')
      .order('scored_at', { ascending: false })
    if (lErr) throw new Error(lErr.message)

    const latestByConn: Record<string, any> = {}
    for (const s of (latest ?? [])) {
      if (!latestByConn[s.connection_id]) latestByConn[s.connection_id] = s
    }

    const connWithScore = (conns ?? []).map(c => ({
      ...c,
      score: latestByConn[c.id]?.score ?? null,
      status: latestByConn[c.id]?.status ?? 'unknown',
    }))

    // Status counts
    const by_status: Record<string, number> = { healthy: 0, warning: 0, critical: 0, unknown: 0 }
    for (const c of connWithScore) by_status[c.status] = (by_status[c.status] ?? 0) + 1

    // By DB type
    const by_db_type: Record<string, { count: number; scores: number[] }> = {}
    for (const c of connWithScore) {
      if (!by_db_type[c.db_type]) by_db_type[c.db_type] = { count: 0, scores: [] }
      by_db_type[c.db_type].count++
      if (c.score != null) by_db_type[c.db_type].scores.push(c.score)
    }

    // By environment
    const by_environment: Record<string, { count: number; scores: number[] }> = {}
    for (const c of connWithScore) {
      if (!by_environment[c.environment]) by_environment[c.environment] = { count: 0, scores: [] }
      by_environment[c.environment].count++
      if (c.score != null) by_environment[c.environment].scores.push(c.score)
    }

    const avgOf = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

    // Score distribution buckets
    const buckets = [
      { range: '0–20', min: 0, max: 20, count: 0 },
      { range: '21–40', min: 21, max: 40, count: 0 },
      { range: '41–60', min: 41, max: 60, count: 0 },
      { range: '61–80', min: 61, max: 80, count: 0 },
      { range: '81–100', min: 81, max: 100, count: 0 },
    ]
    for (const c of connWithScore) {
      if (c.score == null) continue
      const b = buckets.find(b => c.score >= b.min && c.score <= b.max)
      if (b) b.count++
    }

    // Worst 5
    const withScores = connWithScore.filter(c => c.score != null)
    const worst_performers = [...withScores]
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)
      .map(c => ({ id: c.id, name: c.name, db_type: c.db_type, score: c.score, status: c.status }))

    const allScores = withScores.map(c => c.score)

    res.json({
      data: {
        total_connections: (conns ?? []).length,
        by_status,
        by_db_type: Object.fromEntries(
          Object.entries(by_db_type).map(([k, v]) => [k, { count: v.count, avg_score: avgOf(v.scores) }])
        ),
        by_environment: Object.fromEntries(
          Object.entries(by_environment).map(([k, v]) => [k, { count: v.count, avg_score: avgOf(v.scores) }])
        ),
        worst_performers,
        fleet_avg_score: avgOf(allScores),
        score_distribution: buckets.map(b => ({ range: b.range, count: b.count })),
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/reports/dr-readiness ───────────────────────────────────────────
// DR readiness report: pair status, drill history, RPO/RTO compliance
router.get('/dr-readiness', requireAuth, requireDBA, async (req, res) => {
  try {
    const { data: pairs, error: pErr } = await supabase
      .from('dr_pairs')
      .select(`
        id, rpo_target_minutes, rto_target_minutes,
        prod:connections!dr_pairs_prod_connection_id_fkey(id,name,db_type),
        dr:connections!dr_pairs_dr_connection_id_fkey(id,name,db_type)
      `)
    if (pErr) throw new Error(pErr.message)

    const { data: drills, error: dErr } = await supabase
      .from('dr_drills')
      .select('pair_id,result,started_at,rpo_actual_min,rto_actual_min')
      .order('started_at', { ascending: false })
    if (dErr) throw new Error(dErr.message)

    // Group drills by pair
    const drillsByPair: Record<string, typeof drills> = {}
    for (const d of (drills ?? [])) {
      if (!drillsByPair[d.pair_id]) drillsByPair[d.pair_id] = []
      drillsByPair[d.pair_id].push(d)
    }

    const report = (pairs ?? []).map(p => {
      const pairDrills = drillsByPair[p.id] ?? []
      const last = pairDrills[0] // already sorted desc
      const passCount = pairDrills.filter(d => d.result === 'pass').length

      let readiness: 'ready' | 'overdue' | 'at-risk' | 'never-tested' = 'never-tested'
      if (last) {
        const daysSince = (Date.now() - new Date(last.started_at).getTime()) / 86400000
        if (last.result === 'pass' && daysSince <= 90) readiness = 'ready'
        else if (daysSince > 90) readiness = 'overdue'
        else readiness = 'at-risk'
      }

      return {
        pair_id: p.id,
        prod_name: (p as any).prod?.name ?? 'Unknown',
        dr_name: (p as any).dr?.name ?? 'Unknown',
        db_type: (p as any).prod?.db_type ?? 'unknown',
        rpo_target: p.rpo_target_minutes,
        rto_target: p.rto_target_minutes,
        last_drill_date: last?.started_at ?? null,
        last_drill_result: last?.result ?? null,
        last_rpo_actual: last?.rpo_actual_min ?? null,
        last_rto_actual: last?.rto_actual_min ?? null,
        drill_count: pairDrills.length,
        pass_rate: pairDrills.length ? Math.round((passCount / pairDrills.length) * 100) : null,
        readiness,
      }
    })

    res.json({ data: report })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/reports/incidents?days=30 ──────────────────────────────────────
// Incident report: alert stats, timeline, MTTR, breakdown by severity/type/connection
router.get('/incidents', requireAuth, async (req, res) => {
  const days = parseDays(req.query.days, 30)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  try {
    const { data: alerts, error: aErr } = await supabase
      .from('alerts')
      .select('id,connection_id,severity,status,type,created_at,resolved_at')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
    if (aErr) throw new Error(aErr.message)

    const { data: conns, error: cErr } = await supabase
      .from('connections')
      .select('id,name')
    if (cErr) throw new Error(cErr.message)

    const connNames: Record<string, string> = {}
    for (const c of (conns ?? [])) connNames[c.id] = c.name

    const rows = alerts ?? []

    // By severity
    const by_severity: Record<string, number> = { critical: 0, warning: 0, info: 0 }
    for (const a of rows) by_severity[a.severity] = (by_severity[a.severity] ?? 0) + 1

    // By status
    const by_status: Record<string, number> = {}
    for (const a of rows) by_status[a.status] = (by_status[a.status] ?? 0) + 1

    // By connection
    const connCounts: Record<string, number> = {}
    for (const a of rows) connCounts[a.connection_id] = (connCounts[a.connection_id] ?? 0) + 1
    const by_connection = Object.entries(connCounts)
      .map(([id, count]) => ({ connection_id: id, name: connNames[id] ?? 'Unknown', count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    // By type
    const typeCounts: Record<string, number> = {}
    for (const a of rows) typeCounts[a.type] = (typeCounts[a.type] ?? 0) + 1
    const by_type = Object.entries(typeCounts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)

    // Timeline: group by day
    const dayBuckets: Record<string, { critical: number; warning: number; info: number }> = {}
    for (const a of rows) {
      const day = a.created_at.slice(0, 10)
      if (!dayBuckets[day]) dayBuckets[day] = { critical: 0, warning: 0, info: 0 }
      dayBuckets[day][a.severity as 'critical' | 'warning' | 'info']++
    }
    const timeline = Object.entries(dayBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, counts]) => ({ t, ...counts }))

    // MTTR: average time from created_at to resolved_at (for resolved alerts)
    const resolved = rows.filter(a => a.resolved_at)
    let mttr_hours: number | null = null
    if (resolved.length) {
      const totalMs = resolved.reduce((sum, a) => {
        return sum + (new Date(a.resolved_at!).getTime() - new Date(a.created_at).getTime())
      }, 0)
      mttr_hours = Math.round((totalMs / resolved.length / 3600000) * 10) / 10
    }

    res.json({
      data: {
        total_alerts: rows.length,
        by_severity,
        by_status,
        by_connection,
        by_type,
        timeline,
        mttr_hours,
        days,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── GET /api/reports/audit?days=30&limit=200 ────────────────────────────────
// Audit trail: activity log with filters
router.get('/audit', requireAuth, requireDBA, async (req, res) => {
  const days = parseDays(req.query.days, 30)
  const limit = Math.min(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1000)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const action = req.query.action as string | undefined

  try {
    let query = supabase
      .from('activity_log')
      .select('id,actor_id,actor_name,action,target_type,target_id,payload,created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (action) query = query.eq('action', action)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    // Unique actions for filter dropdown
    const { data: actions } = await supabase
      .from('activity_log')
      .select('action')
      .gte('created_at', since)

    const uniqueActions = [...new Set((actions ?? []).map(a => a.action))].sort()

    res.json({ data: { entries: data ?? [], actions: uniqueActions, days } })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── Metric extraction helpers ───────────────────────────────────────────────

function extractStoragePct(m: Record<string, unknown>, dbType: string): number | null {
  if (dbType === 'oracle') return num(m.storage_data_pct)
  if (dbType === 'mariadb') return num(m.disk_usage_pct)
  // MSSQL: derive from disk mounts if available, then buffer pool fallback
  return num(m.disk_usage_pct) ?? num(m.buffer_pool_memory_pct)
}

function extractConnectionsPct(m: Record<string, unknown>): number | null {
  const active = num(m.active_connections) ?? num(m.sessions_active)
  const max = num(m.max_connections) ?? num(m.sessions_total)
  if (active != null && max != null && max > 0) return Math.round((active / max) * 100)
  return null
}

function extractMemoryPct(m: Record<string, unknown>, dbType: string): number | null {
  // Prefer OS-level memory usage when available
  const osMem = num(m.os_memory_usage_pct)
  if (osMem != null && osMem > 0) return osMem
  // Fall back to database-level memory metrics
  if (dbType === 'mssql') return num(m.buffer_pool_memory_pct)
  if (dbType === 'mariadb') return num(m.innodb_buffer_hit_ratio_pct)
  if (dbType === 'oracle') {
    const used = num(m.sga_currently_used_gb)
    const max = num(m.sga_maximum_size_gb)
    if (used != null && max != null && max > 0) return Math.round((used / max) * 100)
  }
  return null
}

function extractThroughput(m: Record<string, unknown>, dbType: string): number | null {
  if (dbType === 'mariadb') return num(m.queries_per_sec)
  if (dbType === 'mssql') return num(m.batch_requests_sec)
  return null
}

function extractCpuPct(m: Record<string, unknown>, dbType: string): number | null {
  if (dbType === 'oracle') return num(m.os_cpu_busy_pct)
  if (dbType === 'mssql') return num(m.cpu_usage_pct)
  return null
}

function extractOsMemory(m: Record<string, unknown>): { total_gb: number | null; available_gb: number | null } {
  return {
    total_gb:     num(m.os_physical_memory_gb),
    available_gb: num(m.os_available_memory_gb) ?? num(m.os_free_memory_gb),
  }
}

function extractDiskMounts(m: Record<string, unknown>): any[] {
  const mounts = m.disk_mounts
  if (Array.isArray(mounts)) return mounts
  return []
}

function extractFilegroupBreakdown(m: Record<string, unknown>): any[] {
  const fg = m.filegroup_breakdown
  if (Array.isArray(fg)) return fg
  return []
}

function num(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

export default router
