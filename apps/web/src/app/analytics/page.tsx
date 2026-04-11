'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, Activity, AlertTriangle, BarChart2, RefreshCw,
  Cpu, HardDrive, DatabaseBackup, Server,
} from 'lucide-react'
import { MetricChart, Sparkline } from '@/components/ui/Charts'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { cn, healthStatusColor, dbTypeLabel } from '@/lib/utils'
import { api } from '@/lib/api'

const DAYS_OPTIONS = [3, 7, 14, 30]
type Tab = 'overview' | 'performance' | 'storage' | 'backups' | 'db-types'

const DB_COLORS: Record<string, string> = {
  oracle:  '#F80000',
  mssql:   '#CC2927',
  mariadb: '#E8940A',
}

function ScoreRing({ score, label, sub }: { score: number | null; label: string; sub: string }) {
  const color = score === null ? 'text-muted-foreground'
    : score >= 80 ? 'text-success'
    : score >= 50 ? 'text-warning'
    : 'text-critical'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('text-4xl font-black tabular-nums', color)}>
        {score ?? '—'}
      </span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days,    setDays]    = useState(7)
  const [error,   setError]   = useState<string | null>(null)
  const [tab,     setTab]     = useState<Tab>('overview')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.analytics.fleet(days)
      setData(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',    label: 'Overview',     icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'performance', label: 'Performance',  icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'storage',     label: 'Storage',      icon: <HardDrive className="w-3.5 h-3.5" /> },
    { id: 'backups',     label: 'Backups',      icon: <DatabaseBackup className="w-3.5 h-3.5" /> },
    { id: 'db-types',    label: 'By DB Type',   icon: <Server className="w-3.5 h-3.5" /> },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fleet Analytics</h1>
          <p className="text-sm text-muted-foreground">Health trends across all database connections</p>
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

      {data && tab === 'overview' && <OverviewTab data={data} days={days} router={router} />}
      {data && tab === 'performance' && <PerformanceTab connections={data.connections} router={router} />}
      {data && tab === 'storage' && <StorageTab connections={data.connections} router={router} />}
      {data && tab === 'backups' && <BackupsTab connections={data.connections} router={router} />}
      {data && tab === 'db-types' && <DbTypesTab data={data} router={router} />}
    </div>
  )
}

// ─── Overview Tab (original content) ─────────────────────────────────────────
function OverviewTab({ data, days, router }: { data: any; days: number; router: any }) {
  return (
    <>
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Activity className="w-3.5 h-3.5" /> Fleet Average
          </div>
          <ScoreRing score={data.averages.fleet} label="Overall" sub="all connections" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-critical">
            <AlertTriangle className="w-3.5 h-3.5" /> Production
          </div>
          <ScoreRing score={data.averages.production} label="Prod Avg" sub="production only" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-400">
            <BarChart2 className="w-3.5 h-3.5" /> UAT
          </div>
          <ScoreRing score={data.averages.uat} label="UAT Avg" sub="non-production" />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-brand-400" />
          <p className="text-sm font-semibold text-foreground">Fleet Score Trend — Last {days} Days</p>
        </div>
        {data.fleet_trend.length > 0 ? (
          <MetricChart data={data.fleet_trend} color="#0072CE" height={140} label="Avg Score" format={(v) => String(v)} />
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">No scan data yet in this window</p>
        )}
      </div>

      {data.worst_performers.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-critical" /> Worst Performers
          </p>
          <ConnectionList connections={data.worst_performers} router={router} />
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <p className="text-sm font-semibold text-foreground">All Connections</p>
        <ConnectionList connections={data.connections} router={router} />
      </div>
    </>
  )
}

// ─── Performance Tab (CPU, RAM, Sessions) ────────────────────────────────────
function PerformanceTab({ connections, router }: { connections: any[]; router: any }) {
  const cpuConns    = connections.filter(c => metricVal(c, 'cpu_usage_pct') != null)
  const memConns    = connections.filter(c => metricVal(c, 'buffer_pool_memory_pct') != null || metricVal(c, 'innodb_buffer_hit_ratio_pct') != null || metricVal(c, 'sga_currently_used_gb') != null)
  const sessionConns = connections.filter(c => metricVal(c, 'sessions_active') != null || metricVal(c, 'active_connections') != null)

  return (
    <>
      {/* CPU */}
      <MetricSection title="CPU Usage" icon={<Cpu className="w-4 h-4 text-critical" />}>
        {cpuConns.length === 0 ? <NoData label="CPU metrics" /> : (
          <div className="space-y-2">
            {cpuConns.map(c => (
              <MetricRow
                key={c.id}
                conn={c}
                label="CPU"
                value={metricVal(c, 'cpu_usage_pct')}
                unit="%"
                color={metricVal(c, 'cpu_usage_pct')! > 80 ? '#EF4444' : metricVal(c, 'cpu_usage_pct')! > 50 ? '#F59E0B' : '#10B981'}
                trend={c.trend}
                router={router}
              />
            ))}
          </div>
        )}
      </MetricSection>

      {/* Memory / Buffer Pool */}
      <MetricSection title="Memory & Buffer Pool" icon={<BarChart2 className="w-4 h-4 text-brand-400" />}>
        {memConns.length === 0 ? <NoData label="memory metrics" /> : (
          <div className="space-y-2">
            {memConns.map(c => {
              const val = metricVal(c, 'buffer_pool_memory_pct') ?? metricVal(c, 'innodb_buffer_hit_ratio_pct') ?? parseFloat(String(metricVal(c, 'sga_currently_used_gb') ?? 0))
              const label = c.db_type === 'oracle' ? 'SGA' : c.db_type === 'mariadb' ? 'InnoDB Hit%' : 'Buffer Pool%'
              const unit = c.db_type === 'oracle' ? ' GB' : '%'
              return (
                <MetricRow key={c.id} conn={c} label={label} value={val} unit={unit} color="#8B5CF6" trend={c.trend} router={router} />
              )
            })}
          </div>
        )}
      </MetricSection>

      {/* Sessions / Connections */}
      <MetricSection title="Active Sessions / Connections" icon={<Activity className="w-4 h-4 text-success" />}>
        {sessionConns.length === 0 ? <NoData label="session metrics" /> : (
          <div className="space-y-2">
            {sessionConns.map(c => {
              const val = metricVal(c, 'sessions_active') ?? metricVal(c, 'active_connections') ?? 0
              return (
                <MetricRow key={c.id} conn={c} label="Sessions" value={val} unit="" color="#0072CE" trend={c.trend} router={router} />
              )
            })}
          </div>
        )}
      </MetricSection>
    </>
  )
}

// ─── Storage Tab ─────────────────────────────────────────────────────────────
function StorageTab({ connections, router }: { connections: any[]; router: any }) {
  const storageConns = connections.filter(c =>
    metricVal(c, 'storage_data_pct') != null ||
    metricVal(c, 'disk_usage_pct') != null
  )

  return (
    <MetricSection title="Storage Utilization" icon={<HardDrive className="w-4 h-4 text-warning" />}>
      {storageConns.length === 0 ? <NoData label="storage metrics" /> : (
        <div className="grid grid-cols-2 gap-4">
          {storageConns.map(c => {
            const pct = metricVal(c, 'storage_data_pct') ?? metricVal(c, 'disk_usage_pct') ?? 0
            const barColor = pct > 85 ? 'bg-critical' : pct > 70 ? 'bg-warning' : 'bg-success'
            return (
              <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{dbTypeLabel(c.db_type)} · {c.environment?.toUpperCase()}</p>
                  </div>
                  <span className={cn('text-2xl font-black tabular-nums', pct > 85 ? 'text-critical' : pct > 70 ? 'text-warning' : 'text-success')}>
                    {Math.round(pct)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                {c.db_type === 'oracle' && (
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    {metricVal(c, 'storage_temp_pct') != null && <span>Temp: <strong className="text-foreground">{metricVal(c, 'storage_temp_pct')}%</strong></span>}
                    {metricVal(c, 'storage_undo_pct') != null && <span>Undo: <strong className="text-foreground">{metricVal(c, 'storage_undo_pct')}%</strong></span>}
                  </div>
                )}
                <button
                  onClick={() => router.push(`/connections/${c.id}/analytics`)}
                  className="text-xs text-brand-400 hover:text-brand-300 font-medium"
                >
                  Deep dive →
                </button>
              </div>
            )
          })}
        </div>
      )}
    </MetricSection>
  )
}

// ─── Backups Tab ─────────────────────────────────────────────────────────────
function BackupsTab({ connections, router }: { connections: any[]; router: any }) {
  // Show all connections — backup data comes from latest_metrics which is populated per-connection analytics
  return (
    <MetricSection title="Backup Overview" icon={<DatabaseBackup className="w-4 h-4 text-success" />}>
      <p className="text-xs text-muted-foreground mb-3">
        Backup history is available per-connection. Click "Details" to see RMAN / SQL Server backup logs.
      </p>
      <div className="divide-y divide-border">
        {connections.map(c => (
          <div key={c.id} className="flex items-center gap-4 py-3">
            <HealthGauge score={c.score ?? 0} size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
              <p className="text-xs text-muted-foreground">{dbTypeLabel(c.db_type)} · {c.environment?.toUpperCase()}</p>
            </div>
            <span className={cn('text-xs font-semibold capitalize', healthStatusColor(c.status))}>{c.status}</span>
            <button
              onClick={() => router.push(`/connections/${c.id}/analytics`)}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0"
            >
              View backups →
            </button>
          </div>
        ))}
      </div>
    </MetricSection>
  )
}

// ─── DB Types Tab ────────────────────────────────────────────────────────────
function DbTypesTab({ data, router }: { data: any; router: any }) {
  const byType = data.by_db_type ?? {}
  const dbTypes = ['oracle', 'mssql', 'mariadb'] as const

  return (
    <div className="space-y-6">
      {dbTypes.map(dbType => {
        const info = byType[dbType] ?? { count: 0, avg: null, worst: [] }
        if (info.count === 0) return null
        return (
          <div key={dbType} className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold px-2 py-0.5 rounded border font-mono" style={{ color: DB_COLORS[dbType], borderColor: `${DB_COLORS[dbType]}40`, backgroundColor: `${DB_COLORS[dbType]}10` }}>
                  {dbType.toUpperCase()}
                </span>
                <span className="text-sm text-muted-foreground">{info.count} connection{info.count !== 1 ? 's' : ''}</span>
              </div>
              <ScoreRing score={info.avg} label="Avg Score" sub={dbType.toUpperCase()} />
            </div>

            {info.worst.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Needs Attention</p>
                <ConnectionList connections={info.worst} router={router} />
              </div>
            )}

            {/* DB-type-specific KPIs */}
            <DbTypeKpis dbType={dbType} connections={data.connections.filter((c: any) => c.db_type === dbType)} />
          </div>
        )
      })}
    </div>
  )
}

// ─── DB-type KPI callouts ────────────────────────────────────────────────────
function DbTypeKpis({ dbType, connections }: { dbType: string; connections: any[] }) {
  const kpis: { label: string; key: string; unit: string; warnAbove?: number }[] = (() => {
    switch (dbType) {
      case 'oracle': return [
        { label: 'Tablespace Used',      key: 'storage_data_pct',       unit: '%', warnAbove: 85 },
        { label: 'SGA Used',             key: 'sga_currently_used_gb',  unit: ' GB' },
        { label: 'Active Sessions',      key: 'sessions_active',        unit: '' },
        { label: 'Blocked Sessions',     key: 'sessions_blocked',       unit: '', warnAbove: 0 },
        { label: 'Redo Log Used',        key: 'redo_log_used_pct',      unit: '%', warnAbove: 80 },
      ]
      case 'mssql': return [
        { label: 'CPU',                  key: 'cpu_usage_pct',          unit: '%', warnAbove: 80 },
        { label: 'Buffer Pool',          key: 'buffer_pool_memory_pct', unit: '%' },
        { label: 'Page Life Expectancy', key: 'page_life_expectancy_sec', unit: 's' },
        { label: 'Batch Requests/s',     key: 'batch_requests_sec',     unit: '' },
        { label: 'Blocking SPIDs',       key: 'blocking_spids',         unit: '', warnAbove: 0 },
        { label: 'Deadlocks/min',        key: 'deadlocks_per_min',      unit: '', warnAbove: 0 },
      ]
      case 'mariadb': return [
        { label: 'InnoDB Buffer Hit',    key: 'innodb_buffer_hit_ratio_pct', unit: '%' },
        { label: 'Queries/sec',          key: 'queries_per_sec',         unit: '' },
        { label: 'Slow Queries/min',     key: 'slow_queries_per_min',    unit: '', warnAbove: 5 },
        { label: 'Replication Lag',      key: 'replication_lag_sec',     unit: 's', warnAbove: 10 },
        { label: 'Table Lock Waits',     key: 'table_lock_waited',       unit: '', warnAbove: 100 },
        { label: 'Disk Used',            key: 'disk_used_gb',            unit: ' GB' },
      ]
      default: return []
    }
  })()

  if (kpis.length === 0 || connections.length === 0) return null

  return (
    <div className="grid grid-cols-3 xl:grid-cols-6 gap-3">
      {kpis.map(kpi => {
        const vals = connections.map(c => metricVal(c, kpi.key)).filter(v => v != null) as number[]
        const avg = vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null
        const warn = avg != null && kpi.warnAbove != null && avg > kpi.warnAbove
        return (
          <div key={kpi.key} className={cn('rounded-lg border p-3 text-center', warn ? 'border-critical/30 bg-critical/5' : 'border-border bg-card')}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{kpi.label}</p>
            <p className={cn('text-xl font-black tabular-nums mt-1', warn ? 'text-critical' : 'text-foreground')}>
              {avg != null ? `${avg}${kpi.unit}` : '—'}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">avg across {vals.length}</p>
          </div>
        )
      })}
    </div>
  )
}

// ─── Shared helpers ──────────────────────────────────────────────────────────
function metricVal(conn: any, key: string): number | null {
  // latest metric value — stored in the trend's last data point
  // or in the connection's score snapshot
  const trend = conn.trend as { t: string; v: number }[] | undefined
  if (conn[key] != null) return Number(conn[key])
  return null
}

function MetricSection({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      {children}
    </div>
  )
}

function MetricRow({ conn, label, value, unit, color, trend, router }: {
  conn: any; label: string; value: number | null; unit: string; color: string; trend: any[]; router: any
}) {
  return (
    <div className="flex items-center gap-4 py-2">
      <HealthGauge score={conn.score ?? 0} size={36} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-foreground truncate">{conn.name}</p>
        <p className="text-xs text-muted-foreground">{dbTypeLabel(conn.db_type)} · {label}: <strong className="text-foreground">{value != null ? `${value}${unit}` : '—'}</strong></p>
      </div>
      <div className="w-24">
        <Sparkline data={trend} color={color} height={28} />
      </div>
      <button onClick={() => router.push(`/connections/${conn.id}/analytics`)} className="text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0">
        Details →
      </button>
    </div>
  )
}

function NoData({ label }: { label: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">No {label} available yet — run a health scan first</p>
}

function ConnectionList({ connections, router }: { connections: any[]; router: any }) {
  return (
    <div className="divide-y divide-border">
      {connections.map((c: any) => (
        <div key={c.id} className="flex items-center gap-4 py-3">
          <HealthGauge score={c.score ?? 0} size={40} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
            <p className="text-xs text-muted-foreground">
              {dbTypeLabel(c.db_type)} · {c.environment?.toUpperCase()}
              {c.scored_at && <> · last scan {new Date(c.scored_at).toLocaleTimeString()}</>}
            </p>
          </div>
          <span className={cn('text-xs font-semibold capitalize w-16 text-right', healthStatusColor(c.status))}>
            {c.status}
          </span>
          <div className="w-28">
            <Sparkline
              data={c.trend}
              color={c.score >= 80 ? '#10B981' : c.score >= 50 ? '#F59E0B' : '#EF4444'}
              height={32}
            />
          </div>
          <button
            onClick={() => router.push(`/connections/${c.id}/analytics`)}
            className="text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0"
          >
            Details →
          </button>
        </div>
      ))}
    </div>
  )
}
