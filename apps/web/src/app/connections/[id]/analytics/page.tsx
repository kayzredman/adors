'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, RefreshCw, TrendingUp, Clock, Database,
  Cpu, HardDrive, DatabaseBackup, Activity,
} from 'lucide-react'
import { MetricChart } from '@/components/ui/Charts'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { cn, healthStatusColor, dbTypeLabel } from '@/lib/utils'
import { api } from '@/lib/api'

const DAYS_OPTIONS = [7, 14, 30, 90]
type Tab = 'overview' | 'performance' | 'storage' | 'backups'

const METRIC_LABELS: Record<string, string> = {
  sessions_active:            'Active Sessions',
  sessions_blocked:           'Blocked Sessions',
  storage_data_pct:           'Data Tablespace %',
  storage_temp_pct:           'Temp Tablespace %',
  storage_undo_pct:           'Undo Tablespace %',
  sga_currently_used_gb:      'SGA Used (GB)',
  redo_log_used_pct:          'Redo Log Used %',
  db_cpu_ratio_pct:           'DB CPU %',
  tablespace_usage_pct:       'Tablespace Usage %',
  active_connections:         'Active Connections',
  buffer_pool_memory_pct:     'Buffer Pool %',
  cpu_usage_pct:              'CPU Usage %',
  blocking_spids:             'Blocking SPIDs',
  page_life_expectancy_sec:   'Page Life Expectancy (s)',
  batch_requests_sec:         'Batch Requests/s',
  deadlocks_per_min:          'Deadlocks/min',
  disk_reads_per_sec:         'Disk Reads/s',
  disk_writes_per_sec:        'Disk Writes/s',
  total_server_memory_gb:     'Server Memory (GB)',
  innodb_buffer_hit_ratio_pct:'InnoDB Buffer Hit %',
  queries_per_sec:            'Queries / sec',
  replication_lag_sec:        'Replication Lag (s)',
  slow_queries_per_min:       'Slow Queries/min',
  table_lock_waited:          'Table Lock Waits',
  disk_usage_pct:             'Disk Usage %',
  disk_used_gb:               'Disk Used (GB)',
  uptime_days:                'Uptime (days)',
}

const METRIC_COLORS: Record<string, string> = {
  sessions_active:            '#0072CE',
  sessions_blocked:           '#EF4444',
  storage_data_pct:           '#F59E0B',
  storage_temp_pct:           '#F97316',
  storage_undo_pct:           '#F97316',
  sga_currently_used_gb:      '#8B5CF6',
  redo_log_used_pct:          '#EF4444',
  db_cpu_ratio_pct:           '#EF4444',
  tablespace_usage_pct:       '#F59E0B',
  active_connections:         '#0072CE',
  buffer_pool_memory_pct:     '#F59E0B',
  cpu_usage_pct:              '#EF4444',
  blocking_spids:             '#EF4444',
  page_life_expectancy_sec:   '#10B981',
  batch_requests_sec:         '#0072CE',
  deadlocks_per_min:          '#EF4444',
  disk_reads_per_sec:         '#8B5CF6',
  disk_writes_per_sec:        '#F59E0B',
  total_server_memory_gb:     '#8B5CF6',
  innodb_buffer_hit_ratio_pct:'#10B981',
  queries_per_sec:            '#0072CE',
  replication_lag_sec:        '#F59E0B',
  slow_queries_per_min:       '#EF4444',
  table_lock_waited:          '#EF4444',
  disk_usage_pct:             '#F59E0B',
  disk_used_gb:               '#F59E0B',
  uptime_days:                '#10B981',
}

// Group metric keys by category per DB type
const METRIC_GROUPS: Record<string, Record<string, string[]>> = {
  oracle: {
    performance: ['sessions_active', 'sessions_blocked', 'db_cpu_ratio_pct', 'sga_currently_used_gb'],
    storage:     ['storage_data_pct', 'storage_temp_pct', 'storage_undo_pct', 'redo_log_used_pct', 'tablespace_usage_pct'],
  },
  mssql: {
    performance: ['cpu_usage_pct', 'active_connections', 'buffer_pool_memory_pct', 'blocking_spids', 'page_life_expectancy_sec', 'batch_requests_sec', 'deadlocks_per_min', 'total_server_memory_gb'],
    storage:     ['disk_reads_per_sec', 'disk_writes_per_sec'],
  },
  mariadb: {
    performance: ['queries_per_sec', 'innodb_buffer_hit_ratio_pct', 'replication_lag_sec', 'slow_queries_per_min', 'table_lock_waited'],
    storage:     ['disk_usage_pct', 'disk_used_gb'],
  },
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

function MetricTrendCard({ metricKey, series }: { metricKey: string; series: { t: string; v: number }[] }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {METRIC_LABELS[metricKey] ?? metricKey}
      </p>
      <MetricChart
        data={series}
        color={METRIC_COLORS[metricKey] ?? '#0072CE'}
        height={100}
        label={METRIC_LABELS[metricKey] ?? metricKey}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Min: <span className="text-foreground font-mono">{Math.min(...series.map(p => p.v)).toLocaleString()}</span></span>
        <span>Avg: <span className="text-foreground font-mono">{Math.round(series.reduce((s, p) => s + p.v, 0) / series.length).toLocaleString()}</span></span>
        <span>Max: <span className="text-foreground font-mono">{Math.max(...series.map(p => p.v)).toLocaleString()}</span></span>
      </div>
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
  const [tab,     setTab]     = useState<Tab>('overview')

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
  const dbType = conn?.db_type ?? 'oracle'
  const metricTrends = data?.metric_trends ?? {}
  const latestMetrics = data?.latest_metrics ?? {}
  const groups = METRIC_GROUPS[dbType] ?? {}

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',    label: 'Overview',    icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'performance', label: 'Performance', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'storage',     label: 'Storage',     icon: <HardDrive className="w-3.5 h-3.5" /> },
    { id: 'backups',     label: 'Backups',     icon: <DatabaseBackup className="w-3.5 h-3.5" /> },
  ]

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

      {/* Tab bar */}
      <div className="flex gap-0.5 border-b border-border -mb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'text-foreground after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-brand-500'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
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
          {/* ── OVERVIEW TAB ─────────────────────────────────── */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-5 flex flex-col items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current Score</p>
                  <HealthGauge score={data.score_history.at(-1)?.v ?? 0} size={72} />
                </div>
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

              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-400" />
                  <p className="text-sm font-semibold text-foreground">Score History — Last {days} Days</p>
                </div>
                {data.score_history.length > 0 ? (
                  <MetricChart data={data.score_history} color="#0072CE" height={160} label="Score" format={(v) => String(v)} />
                ) : (
                  <p className="text-sm text-muted-foreground py-8 text-center">No scan data yet in this window</p>
                )}
              </div>
            </>
          )}

          {/* ── PERFORMANCE TAB ──────────────────────────────── */}
          {tab === 'performance' && (
            <>
              {(groups.performance ?? []).length > 0 ? (
                <div className="grid grid-cols-2 gap-4">
                  {(groups.performance ?? []).map(key =>
                    metricTrends[key] ? <MetricTrendCard key={key} metricKey={key} series={metricTrends[key]} /> : null
                  )}
                </div>
              ) : (
                <NoMetricsCard />
              )}

              {/* Remaining metrics not in any group */}
              {(() => {
                const grouped = new Set([...(groups.performance ?? []), ...(groups.storage ?? [])])
                const ungrouped = Object.entries(metricTrends).filter(([k]) => !grouped.has(k))
                if (ungrouped.length === 0) return null
                return (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-foreground">Other Metrics</p>
                    <div className="grid grid-cols-2 gap-4">
                      {ungrouped.map(([key, series]) => (
                        <MetricTrendCard key={key} metricKey={key} series={series as any} />
                      ))}
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          {/* ── STORAGE TAB ──────────────────────────────────── */}
          {tab === 'storage' && (
            <>
              {(groups.storage ?? []).some(k => metricTrends[k]) ? (
                <div className="grid grid-cols-2 gap-4">
                  {(groups.storage ?? []).map(key =>
                    metricTrends[key] ? <MetricTrendCard key={key} metricKey={key} series={metricTrends[key]} /> : null
                  )}
                </div>
              ) : (
                <NoMetricsCard />
              )}

              {/* Snapshot-level storage details from latest_metrics */}
              {(latestMetrics.disk_mounts as any[])?.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-warning" /> Disk Mounts
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {(latestMetrics.disk_mounts as any[]).map((m: any, i: number) => (
                      <div key={i} className="rounded-lg border border-border bg-background p-3 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="font-mono text-muted-foreground">{m.mount ?? m.name}</span>
                          <span className="font-semibold text-foreground">{m.used_gb?.toFixed(1) ?? '?'} GB</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', (m.used_pct ?? 0) > 85 ? 'bg-critical' : (m.used_pct ?? 0) > 70 ? 'bg-warning' : 'bg-success')}
                            style={{ width: `${Math.min(100, m.used_pct ?? 0)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── BACKUPS TAB ──────────────────────────────────── */}
          {tab === 'backups' && (
            <>
              {(latestMetrics.backup_history as any[])?.length > 0 ? (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <DatabaseBackup className="w-4 h-4 text-success" /> Backup History
                  </p>
                  <div className="divide-y divide-border">
                    {(latestMetrics.backup_history as any[]).map((b: any, i: number) => {
                      const ok = b.status === 'COMPLETED' || b.status === 'completed' || b.status === 'Success'
                      return (
                        <div key={i} className="flex items-center gap-4 py-3 text-sm">
                          <span className={cn('w-2 h-2 rounded-full shrink-0', ok ? 'bg-success' : 'bg-critical')} />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-foreground truncate">{b.type ?? b.backup_type ?? 'Backup'}</p>
                            <p className="text-xs text-muted-foreground">
                              {b.start_time ?? b.backup_start_date ?? b.completed_at ?? '—'}
                              {b.size_gb != null && <> · {b.size_gb} GB</>}
                              {b.duration_min != null && <> · {b.duration_min} min</>}
                            </p>
                          </div>
                          <span className={cn('text-xs font-semibold', ok ? 'text-success' : 'text-critical')}>
                            {b.status}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
                  No backup history found in the latest scan.
                  <br />Run a health scan to populate backup data.
                </div>
              )}
            </>
          )}

          {data.snapshot_count === 0 && tab === 'overview' && (
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

function NoMetricsCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
      No metric trend data available yet. Run a health scan to generate data.
    </div>
  )
}
