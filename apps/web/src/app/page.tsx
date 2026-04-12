'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Database, Zap, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { DbHealthCard } from '@/components/dashboard/DbHealthCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

type Tab = 'overview' | 'production' | 'uat' | 'dr' | 'alerts'

type Alert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  status: string
  message: string
  created_at: string
  connections?: { name: string; db_type: string; environment: string }
}

export default function DashboardPage() {
  const [connections,  setConnections]  = useState<any[]>([])
  const [activity,     setActivity]     = useState<any[]>([])
  const [alertCounts,  setAlertCounts]  = useState({ critical: 0, warning: 0, info: 0, total: 0 })
  const [alerts,       setAlerts]       = useState<Alert[]>([])
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState<Tab>('overview')

  useEffect(() => {
    Promise.all([
      api.connections.list(true),
      api.activity.list(15),
      api.alerts.counts(),
    ]).then(([connRes, actRes, alertRes]) => {
      setConnections((connRes as any).data ?? [])
      setActivity((actRes as any).data ?? [])
      setAlertCounts((alertRes as any).data ?? { critical: 0, warning: 0, info: 0, total: 0 })
    }).catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (tab === 'alerts') {
      api.alerts.list({ status: 'active' })
        .then(r => setAlerts((r as any).data ?? []))
        .catch(() => {})
    }
  }, [tab])

  const prodConnections = connections.filter(c => c.environment === 'production')
  const uatConnections  = connections.filter(c => c.environment === 'uat')
  const drConnections   = connections.filter(c => c.environment === 'dr')
  const overallScore    = connections.length
    ? Math.round(connections.reduce((sum, c) => sum + (c.health?.score ?? 0), 0) / connections.length)
    : 0

  const TABS: { id: Tab; label: string; badge?: number; badgeDanger?: boolean }[] = [
    { id: 'overview',   label: 'Overview' },
    { id: 'production', label: 'Production', badge: prodConnections.length },
    { id: 'uat',        label: 'UAT',        badge: uatConnections.length },
    { id: 'dr',         label: 'DR',         badge: drConnections.length },
    { id: 'alerts',     label: 'Alerts',     badge: alertCounts.total || undefined, badgeDanger: alertCounts.total > 0 },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mission Control</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {loading ? 'Loading fleet…' : `Live fleet monitoring — ${connections.length} databases registered`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatPill icon={<Database className="w-4 h-4" />} label="Fleet Score" value={loading ? '…' : `${overallScore}%`} color="text-brand-400" />
          <StatPill icon={<AlertTriangle className="w-4 h-4" />} label="Active Alerts" value={loading ? '…' : String(alertCounts.total)} color={alertCounts.total > 0 ? 'text-critical' : 'text-success'} />
          <StatPill icon={<Zap className="w-4 h-4" />} label="Critical" value={loading ? '…' : String(alertCounts.critical)} color={alertCounts.critical > 0 ? 'text-critical' : 'text-muted-foreground'} />
        </div>
      </div>

      {/* ── Tab bar ───────────────────────────────────────────── */}
      <div className="flex gap-0.5 border-b border-border -mb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'relative px-4 py-2.5 text-sm font-medium transition-colors',
              tab === t.id
                ? 'text-foreground after:absolute after:bottom-[-1px] after:left-0 after:right-0 after:h-[2px] after:bg-brand-500'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
            {t.badge != null && (
              <span className={cn(
                'ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                t.badgeDanger ? 'bg-critical/20 text-critical' : 'bg-muted text-muted-foreground',
              )}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ─────────────────────────────────────────── */}
      {(tab === 'overview' || tab === 'production' || tab === 'uat' || tab === 'dr') && (
        <div className="flex gap-6">
          <div className="flex-1 space-y-4">
            {(tab === 'overview' || tab === 'production') && (
              <ConnectionSection
                title="Production Databases"
                connections={prodConnections}
                loading={loading}
                dotColor="bg-critical"
              />
            )}
            {(tab === 'overview' || tab === 'uat') && (
              <ConnectionSection
                title="UAT Databases"
                connections={uatConnections}
                loading={loading}
                dotColor="bg-brand-400"
              />
            )}
            {(tab === 'overview' || tab === 'dr') && (
              <ConnectionSection
                title="DR Databases"
                connections={drConnections}
                loading={loading}
                dotColor="bg-warning"
              />
            )}
          </div>

          <aside className="w-80 shrink-0">
            <div className="rounded-xl border border-border bg-card p-4 h-full">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-brand-400" />
                <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
              </div>
              <ActivityFeed entries={activity} />
            </div>
          </aside>
        </div>
      )}

      {tab === 'alerts' && (
        <AlertsTab
          alerts={alerts}
          onAcknowledge={(id) => {
            const alert = alerts.find(a => a.id === id)
            api.alerts.acknowledge(id).then(() => {
              setAlerts(prev => prev.filter(a => a.id !== id))
              setAlertCounts(prev => ({
                ...prev,
                total:    Math.max(0, prev.total - 1),
                critical: Math.max(0, prev.critical - (alert?.severity === 'critical' ? 1 : 0)),
                warning:  Math.max(0, prev.warning  - (alert?.severity === 'warning'  ? 1 : 0)),
                info:     Math.max(0, prev.info     - (alert?.severity === 'info'     ? 1 : 0)),
              }))
            }).catch(() => {})
          }}
        />
      )}
    </div>
  )
}

// ─── Connection section ───────────────────────────────────────────────────────
function ConnectionSection({
  title, connections, loading, dotColor,
}: {
  title: string; connections: any[]; loading: boolean; dotColor: string
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span className={cn('w-2 h-2 rounded-full', dotColor)} />
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      </div>
      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : connections.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground text-center">
          No {title.toLowerCase()} registered
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {connections.map((conn: any) => (
            <Link key={conn.id} href={`/connections/${conn.id}`}>
              <DbHealthCard connection={conn} className="cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition-all" />
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}

// ─── Alerts tab ───────────────────────────────────────────────────────────────
function AlertsTab({ alerts, onAcknowledge }: { alerts: Alert[]; onAcknowledge: (id: string) => void }) {
  const SEV = {
    critical: { cls: 'bg-critical/10 border-critical/30 text-critical',   dot: 'bg-critical' },
    warning:  { cls: 'bg-warning/10 border-warning/30 text-warning',       dot: 'bg-warning' },
    info:     { cls: 'bg-brand-500/10 border-brand-500/30 text-brand-400', dot: 'bg-brand-400' },
  }

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center">
        <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">All clear</p>
        <p className="text-xs text-muted-foreground mt-1">No active alerts</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {alerts.map(alert => {
        const cfg = SEV[alert.severity] ?? SEV.info
        return (
          <div key={alert.id} className={cn('flex items-start gap-4 rounded-xl border p-4', cfg.cls)}>
            <span className={cn('w-2 h-2 rounded-full mt-1.5 shrink-0', cfg.dot)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">{alert.message}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {alert.connections?.name ?? 'Unknown connection'}
                {alert.connections?.environment && ` · ${alert.connections.environment.toUpperCase()}`}
                {' · '}
                {new Date(alert.created_at).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => onAcknowledge(alert.id)}
              className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-lg border border-current opacity-70 hover:opacity-100 transition-opacity"
            >
              Ack
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatPill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <span className={color}>{icon}</span>
      <div>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className={`text-sm font-bold tabular-nums ${color}`}>{value}</p>
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse space-y-3">
      <div className="h-3 w-24 bg-muted rounded" />
      <div className="h-8 w-16 bg-muted rounded" />
      <div className="h-2 w-full bg-muted rounded" />
    </div>
  )
}

