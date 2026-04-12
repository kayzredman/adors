'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  Users,
  XCircle,
  Zap,
  History,
  BarChart2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ServiceStatusItem {
  name: string
  status: 'healthy' | 'degraded' | 'down'
  details: string
  checked_at: string
}

interface WorkerStats {
  counts: { waiting: number; active: number; completed: number; failed: number; delayed: number }
  repeatable_jobs: Array<{ name: string; pattern: string; next: string | null }>
  recent_completed: Array<{ id: string; name: string; finished_at: string | null; duration_ms: number | null }>
  recent_failed: Array<{ id: string; name: string; failed_at: string | null; error: string; attempts: number }>
}

interface ScanHistory {
  total_scans_24h: number
  status_distribution: Record<string, number>
  timeline: Array<{ hour: string; total: number; healthy: number; warning: number; critical: number }>
}

interface SystemMetrics {
  connections: { total: number; active: number; by_type: Record<string, number>; by_environment: Record<string, number> }
  users: { total: number; active: number }
  alerts_24h: number
  snapshots_24h: number
  process: { uptime_s: number; memory_mb: { rss: number; heap_used: number; heap_total: number }; node_version: string }
}

interface RecentErrors {
  critical_alerts: Array<{ id: string; connection_id: string; severity: string; type: string; message: string; created_at: string }>
  failed_scans: Array<{ id: string; connection_id: string; error: string; error_at: string }>
}

interface ActivityItem {
  id: string
  actor_name: string
  action: string
  target_type: string
  target_id: string | null
  payload: Record<string, unknown>
  created_at: string
}

interface OverviewData {
  service_status: ServiceStatusItem[] | null
  worker_stats: WorkerStats | null
  scan_history: ScanHistory | null
  system_metrics: SystemMetrics | null
  recent_errors: RecentErrors | null
  activity_log: ActivityItem[] | null
}

export default function ServicesPage() {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const res = await api.services.overview()
      setData(res.data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(() => fetchData(true), 30_000)
    return () => clearInterval(id)
  }, [fetchData])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-critical/10 border border-critical/20 rounded-lg p-4 text-critical text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Services Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">System-wide infrastructure status and diagnostics</p>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-border bg-card hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw className={cn('w-4 h-4', refreshing && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Service Status Cards */}
      {data?.service_status && <ServiceStatusCards services={data.service_status} />}

      {/* Two-column layout for Worker Stats + System Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data?.worker_stats && <WorkerQueueSection stats={data.worker_stats} />}
        {data?.system_metrics && <SystemMetricsSection metrics={data.system_metrics} />}
      </div>

      {/* Scan History */}
      {data?.scan_history && <ScanHistorySection history={data.scan_history} />}

      {/* Two-column layout for Recent Errors + Activity Log */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {data?.recent_errors && <RecentErrorsSection errors={data.recent_errors} />}
        {data?.activity_log && <ActivityLogSection log={data.activity_log} />}
      </div>
    </div>
  )
}

// ─── Service Status Cards ─────────────────────────────────────────────────────

function ServiceStatusCards({ services }: { services: ServiceStatusItem[] }) {
  const iconMap: Record<string, React.ElementType> = {
    'API Server': Server,
    'Database': Database,
    'Redis': HardDrive,
    'Auth (GoTrue)': Shield,
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {services.map((svc) => {
        const Icon = iconMap[svc.name] ?? Server
        return (
          <div
            key={svc.name}
            className={cn(
              'relative rounded-xl border p-4 bg-card transition-colors',
              svc.status === 'healthy' && 'border-success/30',
              svc.status === 'degraded' && 'border-warning/30',
              svc.status === 'down' && 'border-critical/30',
            )}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center',
                svc.status === 'healthy' && 'bg-success/10 text-success',
                svc.status === 'degraded' && 'bg-warning/10 text-warning',
                svc.status === 'down' && 'bg-critical/10 text-critical',
              )}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{svc.name}</p>
                <StatusBadge status={svc.status} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground truncate" title={svc.details}>
              {svc.details}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider',
      status === 'healthy' && 'text-success',
      status === 'degraded' && 'text-warning',
      status === 'down' && 'text-critical',
    )}>
      <span className={cn(
        'w-1.5 h-1.5 rounded-full',
        status === 'healthy' && 'bg-success',
        status === 'degraded' && 'bg-warning',
        status === 'down' && 'bg-critical',
      )} />
      {status}
    </span>
  )
}

// ─── Worker Queue Stats ──────────────────────────────────────────────────────

function WorkerQueueSection({ stats }: { stats: WorkerStats }) {
  const { counts, repeatable_jobs, recent_completed, recent_failed } = stats

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Zap className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-foreground">Worker Queue</h2>
      </div>
      <div className="p-5 space-y-5">
        {/* Job counts */}
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(counts).map(([key, val]) => (
            <div key={key} className="text-center">
              <p className="text-lg font-bold text-foreground">{val}</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{key}</p>
            </div>
          ))}
        </div>

        {/* Repeatable jobs */}
        {repeatable_jobs.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Scheduled Jobs</p>
            <div className="space-y-1.5">
              {repeatable_jobs.map((j, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-muted/50 rounded-lg px-3 py-2">
                  <span className="font-medium text-foreground">{j.name}</span>
                  <span className="text-muted-foreground font-mono">{j.pattern}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent completed */}
        {recent_completed.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent Completed</p>
            <div className="space-y-1">
              {recent_completed.slice(0, 3).map((j) => (
                <div key={j.id} className="flex items-center justify-between text-xs px-3 py-1.5">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 text-success" />
                    <span className="text-foreground">{j.name}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {j.duration_ms != null ? `${j.duration_ms}ms` : '—'}
                    {j.finished_at && ` · ${timeAgo(j.finished_at)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent failed */}
        {recent_failed.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">Recent Failed</p>
            <div className="space-y-1">
              {recent_failed.slice(0, 3).map((j) => (
                <div key={j.id} className="text-xs px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-3 h-3 text-critical shrink-0" />
                    <span className="text-foreground font-medium">{j.name}</span>
                    <span className="text-muted-foreground ml-auto">Attempt {j.attempts}</span>
                  </div>
                  <p className="text-muted-foreground truncate pl-[18px] mt-0.5">{j.error}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── System Metrics ──────────────────────────────────────────────────────────

function SystemMetricsSection({ metrics }: { metrics: SystemMetrics }) {
  const { connections, users, alerts_24h, snapshots_24h, process: proc } = metrics

  const uptimeStr = formatUptime(proc.uptime_s)

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <BarChart2 className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-foreground">System Metrics</h2>
      </div>
      <div className="p-5 space-y-5">
        {/* Key numbers */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <MetricCard label="Connections" value={connections.total} sub={`${connections.active} active`} />
          <MetricCard label="Users" value={users.total} sub={`${users.active} active`} />
          <MetricCard label="Alerts (24h)" value={alerts_24h} />
          <MetricCard label="Scans (24h)" value={snapshots_24h} />
        </div>

        {/* Connection breakdown */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">By Engine</p>
            <div className="space-y-1.5">
              {Object.entries(connections.by_type).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-xs px-3 py-1.5 bg-muted/50 rounded-lg">
                  <span className="text-foreground capitalize">{type}</span>
                  <span className="text-muted-foreground font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground mb-2">By Environment</p>
            <div className="space-y-1.5">
              {Object.entries(connections.by_environment).map(([env, count]) => (
                <div key={env} className="flex items-center justify-between text-xs px-3 py-1.5 bg-muted/50 rounded-lg">
                  <span className="text-foreground capitalize">{env}</span>
                  <span className="text-muted-foreground font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Process info */}
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">API Process</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <InfoPill label="Uptime" value={uptimeStr} />
            <InfoPill label="RSS" value={`${proc.memory_mb.rss} MB`} />
            <InfoPill label="Heap" value={`${proc.memory_mb.heap_used}/${proc.memory_mb.heap_total} MB`} />
            <InfoPill label="Node" value={proc.node_version} />
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/50 rounded-lg px-3 py-2">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-foreground font-mono text-xs mt-0.5">{value}</p>
    </div>
  )
}

// ─── Scan History ────────────────────────────────────────────────────────────

function ScanHistorySection({ history }: { history: ScanHistory }) {
  const { total_scans_24h, status_distribution, timeline } = history

  // Find max for scaling the bar chart
  const maxTotal = Math.max(1, ...timeline.map((t) => t.total))

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-brand-400" />
          <h2 className="text-sm font-semibold text-foreground">Scan History (24h)</h2>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{total_scans_24h} total scans</span>
          {Object.entries(status_distribution).map(([status, count]) => (
            <span key={status} className="flex items-center gap-1">
              <span className={cn(
                'w-2 h-2 rounded-full',
                status === 'healthy' && 'bg-success',
                status === 'warning' && 'bg-warning',
                status === 'critical' && 'bg-critical',
              )} />
              {count} {status}
            </span>
          ))}
        </div>
      </div>
      <div className="p-5">
        {timeline.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No scan data in the last 24 hours</p>
        ) : (
          <div className="flex items-end gap-[2px] h-32">
            {timeline.map((bucket, i) => {
              const healthyH = (bucket.healthy / maxTotal) * 100
              const warningH = (bucket.warning / maxTotal) * 100
              const criticalH = (bucket.critical / maxTotal) * 100
              const hourLabel = bucket.hour.slice(11, 16)
              return (
                <div
                  key={i}
                  className="flex-1 flex flex-col justify-end group relative"
                  title={`${hourLabel} — ${bucket.total} scans (${bucket.healthy}H / ${bucket.warning}W / ${bucket.critical}C)`}
                >
                  <div className="flex flex-col rounded-t overflow-hidden">
                    {criticalH > 0 && <div className="bg-critical" style={{ height: `${criticalH}%`, minHeight: criticalH > 0 ? 2 : 0 }} />}
                    {warningH > 0 && <div className="bg-warning" style={{ height: `${warningH}%`, minHeight: warningH > 0 ? 2 : 0 }} />}
                    {healthyH > 0 && <div className="bg-success" style={{ height: `${healthyH}%`, minHeight: healthyH > 0 ? 2 : 0 }} />}
                  </div>
                  {/* Show every 3rd label */}
                  {i % 3 === 0 && (
                    <p className="text-[9px] text-muted-foreground text-center mt-1.5">{hourLabel}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Recent Errors ───────────────────────────────────────────────────────────

function RecentErrorsSection({ errors }: { errors: RecentErrors }) {
  const { critical_alerts, failed_scans } = errors
  const hasContent = critical_alerts.length > 0 || failed_scans.length > 0

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-critical" />
        <h2 className="text-sm font-semibold text-foreground">Recent Errors</h2>
      </div>
      <div className="p-5 max-h-[400px] overflow-y-auto">
        {!hasContent ? (
          <p className="text-sm text-muted-foreground text-center py-8">No recent errors — all systems nominal</p>
        ) : (
          <div className="space-y-4">
            {/* Critical alerts */}
            {critical_alerts.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Critical Alerts</p>
                <div className="space-y-1.5">
                  {critical_alerts.map((a) => (
                    <div key={a.id} className="text-xs bg-critical/5 border border-critical/10 rounded-lg px-3 py-2">
                      <div className="flex items-start gap-2">
                        <XCircle className="w-3.5 h-3.5 text-critical shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-foreground font-medium">{a.message}</p>
                          <p className="text-muted-foreground mt-0.5">
                            {a.type} · {timeAgo(a.created_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed scans */}
            {failed_scans.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Failed Scans</p>
                <div className="space-y-1.5">
                  {failed_scans.map((s) => (
                    <div key={s.id} className="text-xs bg-muted/50 rounded-lg px-3 py-2">
                      <p className="text-foreground font-medium truncate">{s.error}</p>
                      <p className="text-muted-foreground mt-0.5">{timeAgo(s.error_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Activity Log ────────────────────────────────────────────────────────────

function ActivityLogSection({ log }: { log: ActivityItem[] }) {
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <Activity className="w-4 h-4 text-brand-400" />
        <h2 className="text-sm font-semibold text-foreground">Activity Log</h2>
      </div>
      <div className="p-5 max-h-[400px] overflow-y-auto">
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
        ) : (
          <div className="space-y-1">
            {log.map((item) => (
              <div key={item.id} className="flex items-start gap-3 text-xs px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                <Clock className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-foreground">
                    <span className="font-medium">{item.actor_name}</span>
                    <span className="text-muted-foreground"> {item.action} </span>
                    <span className="text-muted-foreground">{item.target_type}</span>
                  </p>
                  <p className="text-muted-foreground">{timeAgo(item.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const secs = Math.floor(diff / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
