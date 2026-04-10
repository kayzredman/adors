'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, TrendingUp, Clock, Database } from 'lucide-react'
import { MetricChart, Sparkline } from '@/components/ui/Charts'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { cn, healthStatusColor, dbTypeLabel } from '@/lib/utils'
import { api } from '@/lib/api'

const DAYS_OPTIONS = [7, 14, 30, 90]

const METRIC_LABELS: Record<string, string> = {
  sessions_active:          'Active Sessions',
  sessions_blocked:         'Blocked Sessions',
  storage_data_pct:         'Storage Used %',
  sga_currently_used_gb:    'SGA Used (GB)',
  active_connections:       'Active Connections',
  buffer_pool_memory_pct:   'Buffer Pool %',
  cpu_usage_pct:            'CPU Usage %',
  blocking_spids:           'Blocking SPIDs',
  innodb_buffer_hit_ratio_pct: 'InnoDB Buffer Hit %',
  queries_per_sec:          'Queries / sec',
  replication_lag_sec:      'Replication Lag (s)',
}

const METRIC_COLORS: Record<string, string> = {
  sessions_active:          '#0072CE',
  sessions_blocked:         '#EF4444',
  storage_data_pct:         '#F59E0B',
  sga_currently_used_gb:    '#8B5CF6',
  active_connections:       '#0072CE',
  buffer_pool_memory_pct:   '#F59E0B',
  cpu_usage_pct:            '#EF4444',
  blocking_spids:           '#EF4444',
  innodb_buffer_hit_ratio_pct: '#10B981',
  queries_per_sec:          '#0072CE',
  replication_lag_sec:      '#F59E0B',
}

function StatusPill({ status, count }: { status: string; count: number }) {
  return (
    <div className={cn(
      'flex items-center gap-2 rounded-lg px-3 py-2 border text-xs font-semibold',
      status === 'healthy'  ? 'bg-success/10 border-success/30 text-success' :
      status === 'warning'  ? 'bg-warning/10 border-warning/30 text-warning' :
      status === 'critical' ? 'bg-critical/10 border-critical/30 text-critical' :
                              'bg-muted/10 border-border text-muted-foreground',
    )}>
      <span className="capitalize">{status}</span>
      <span className="font-black text-sm">{count}</span>
    </div>
  )
}

export default function ConnectionAnalyticsPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days,    setDays]    = useState(30)
  const [error,   setError]   = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.analytics.connection(id, days)
      setData(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id, days])

  const conn = data?.connection

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/connections/${id}`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-400" />
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {conn?.name ?? '…'} — Analytics
              </h1>
              {conn && (
                <p className="text-xs text-muted-foreground">
                  {dbTypeLabel(conn.db_type)} · {conn.environment.toUpperCase()}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  days === d
                    ? 'bg-brand-500 text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
        </div>
      )}

      {data && (
        <>
          {/* ── Score summary ─────────────────────────────────── */}
          <div className="grid grid-cols-4 gap-4">
            {/* Current gauge */}
            <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Score</p>
              <HealthGauge score={data.score_history.at(-1)?.v ?? 0} size={72} />
            </div>

            {/* Stats */}
            {data.score_stats ? (
              <>
                {[
                  ['Avg Score', data.score_stats.avg],
                  ['Best',      data.score_stats.max],
                  ['Worst',     data.score_stats.min],
                ].map(([label, val]) => {
                  const v = Number(val)
                  const color = v >= 80 ? 'text-success' : v >= 50 ? 'text-warning' : 'text-critical'
                  return (
                    <div key={String(label)} className="rounded-xl border border-border bg-card p-5 flex flex-col items-center justify-center gap-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                      <p className={cn('text-4xl font-black tabular-nums', color)}>{val}</p>
                      <p className="text-xs text-muted-foreground">last {days}d</p>
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="col-span-3 rounded-xl border border-border bg-card p-5 flex items-center justify-center text-sm text-muted-foreground">
                No scan history in this window
              </div>
            )}
          </div>

          {/* ── Status distribution ───────────────────────────── */}
          {Object.keys(data.status_counts).length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Status Distribution — {data.snapshot_count} scans</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {Object.entries(data.status_counts).map(([status, count]) => (
                  <StatusPill key={status} status={status} count={count as number} />
                ))}
              </div>
            </div>
          )}

          {/* ── Score history ─────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-400" />
              <p className="text-sm font-semibold text-foreground">Score History — Last {days} Days</p>
            </div>
            {data.score_history.length > 0 ? (
              <MetricChart
                data={data.score_history}
                color="#0072CE"
                height={160}
                label="Score"
                format={(v) => String(v)}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No scan data yet in this window</p>
            )}
          </div>

          {/* ── Metric sparklines ─────────────────────────────── */}
          {Object.keys(data.metric_trends).length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Key Metric Trends</p>
              <div className="grid grid-cols-2 gap-4">
                {Object.entries(data.metric_trends).map(([key, series]: [string, any]) => (
                  <div key={key} className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {METRIC_LABELS[key] ?? key}
                    </p>
                    <MetricChart
                      data={series}
                      color={METRIC_COLORS[key] ?? '#0072CE'}
                      height={100}
                      label={METRIC_LABELS[key] ?? key}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Min: <span className="text-foreground font-mono">{Math.min(...series.map((p: any) => p.v)).toLocaleString()}</span></span>
                      <span>Avg: <span className="text-foreground font-mono">{Math.round(series.reduce((s: number, p: any) => s + p.v, 0) / series.length).toLocaleString()}</span></span>
                      <span>Max: <span className="text-foreground font-mono">{Math.max(...series.map((p: any) => p.v)).toLocaleString()}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.snapshot_count === 0 && (
            <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
              No scan snapshots found in the last {days} days.
              <br />Run a Manual Scan from the detail page to generate data.
            </div>
          )}
        </>
      )}
    </div>
  )
}
