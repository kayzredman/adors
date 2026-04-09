'use client'

import { useEffect, useState } from 'react'
import { Bell, CheckCircle2, AlertTriangle, Info, Filter } from 'lucide-react'
import { cn, formatRelativeTime, severityColor } from '@/lib/utils'
import { api } from '@/lib/api'

type Alert = {
  id: string
  severity: 'critical' | 'warning' | 'info'
  status: 'active' | 'acknowledged' | 'resolved'
  type: string
  message: string
  created_at: string
  connections?: { name: string; db_type: string; environment: string }
}

const SEVERITY_FILTERS = ['all', 'critical', 'warning', 'info'] as const
const STATUS_FILTERS   = ['all', 'active', 'acknowledged', 'resolved'] as const

export default function AlertsPage() {
  const [alerts,   setAlerts]   = useState<Alert[]>([])
  const [loading,  setLoading]  = useState(true)
  const [counts,   setCounts]   = useState({ critical: 0, warning: 0, info: 0, total: 0 })
  const [sevFilter, setSevFilter] = useState<typeof SEVERITY_FILTERS[number]>('all')
  const [staFilter, setStaFilter] = useState<typeof STATUS_FILTERS[number]>('active')

  async function load() {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (sevFilter !== 'all') params.severity = sevFilter
      if (staFilter !== 'all') params.status   = staFilter

      const [alertRes, countRes] = await Promise.all([
        api.alerts.list(params) as Promise<{ data: Alert[] }>,
        api.alerts.counts()     as Promise<{ data: typeof counts }>,
      ])
      setAlerts(alertRes.data ?? [])
      setCounts(countRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sevFilter, staFilter])

  async function acknowledge(id: string) {
    await api.alerts.acknowledge(id)
    setAlerts(a => a.filter(x => x.id !== id || staFilter === 'all'))
    setCounts(c => ({ ...c, total: Math.max(0, c.total - 1) }))
  }

  async function resolve(id: string) {
    await api.alerts.resolve(id)
    setAlerts(a => a.filter(x => x.id !== id || staFilter === 'all'))
    setCounts(c => ({ ...c, total: Math.max(0, c.total - 1) }))
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Bell className="w-6 h-6 text-brand-400" />
            Alerts Center
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Monitor and action database alerts across the fleet</p>
        </div>
        {/* Summary pills */}
        <div className="flex gap-3">
          {[
            { label: 'Critical', value: counts.critical, cls: 'text-critical bg-critical/10 border-critical/30' },
            { label: 'Warning',  value: counts.warning,  cls: 'text-warning bg-warning/10 border-warning/30' },
            { label: 'Info',     value: counts.info,     cls: 'text-brand-400 bg-brand-500/10 border-brand-500/30' },
          ].map(({ label, value, cls }) => (
            <div key={label} className={cn('rounded-lg border px-3 py-1.5 text-center min-w-16', cls)}>
              <p className="text-xl font-bold tabular-nums">{value}</p>
              <p className="text-[10px] uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="flex gap-2">
          {SEVERITY_FILTERS.map(f => (
            <button key={f} onClick={() => setSevFilter(f)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                sevFilter === f ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-muted-foreground hover:text-foreground')}>
              {f}
            </button>
          ))}
        </div>
        <div className="w-px h-4 bg-border" />
        <div className="flex gap-2">
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setStaFilter(f)}
              className={cn('px-3 py-1 rounded-full text-xs font-medium border transition-colors capitalize',
                staFilter === f ? 'bg-brand-500 text-white border-brand-500' : 'border-border text-muted-foreground hover:text-foreground')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Alert list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading alerts…</div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-success mx-auto mb-3" />
            <p className="font-medium text-foreground">No alerts found</p>
            <p className="text-sm text-muted-foreground">All systems nominal for the selected filters</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Severity', 'Message', 'Connection', 'Status', 'Time', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {alerts.map(alert => (
                <AlertRow key={alert.id} alert={alert} onAcknowledge={acknowledge} onResolve={resolve} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function AlertRow({ alert, onAcknowledge, onResolve }: {
  alert: Alert
  onAcknowledge: (id: string) => void
  onResolve:     (id: string) => void
}) {
  const [busy, setBusy] = useState(false)

  const SevIcon =
    alert.severity === 'critical' ? AlertTriangle :
    alert.severity === 'warning'  ? AlertTriangle : Info

  return (
    <tr className="hover:bg-muted/20 transition-colors">
      <td className="px-5 py-3.5">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border capitalize', severityColor(alert.severity))}>
          <SevIcon className="w-3 h-3" />{alert.severity}
        </span>
      </td>
      <td className="px-5 py-3.5 max-w-xs">
        <p className="font-medium text-foreground line-clamp-1">{alert.message}</p>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">{alert.type}</p>
      </td>
      <td className="px-5 py-3.5">
        {alert.connections ? (
          <div>
            <p className="font-medium text-foreground">{alert.connections.name}</p>
            <p className="text-xs text-muted-foreground uppercase">{alert.connections.db_type} · {alert.connections.environment}</p>
          </div>
        ) : <span className="text-muted-foreground">—</span>}
      </td>
      <td className="px-5 py-3.5">
        <span className={cn('text-xs font-medium capitalize px-2 py-0.5 rounded-full border',
          alert.status === 'active'       ? 'text-critical bg-critical/10 border-critical/30' :
          alert.status === 'acknowledged' ? 'text-warning bg-warning/10 border-warning/30' :
          'text-success bg-success/10 border-success/30')}>
          {alert.status}
        </span>
      </td>
      <td className="px-5 py-3.5 text-xs text-muted-foreground tabular-nums">
        {formatRelativeTime(alert.created_at)}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex gap-2">
          {alert.status === 'active' && (
            <button disabled={busy} onClick={async () => { setBusy(true); await onAcknowledge(alert.id); setBusy(false) }}
              className="px-2.5 py-1 text-xs font-medium rounded border border-warning/40 text-warning hover:bg-warning/10 transition-colors disabled:opacity-50">
              Acknowledge
            </button>
          )}
          {alert.status !== 'resolved' && (
            <button disabled={busy} onClick={async () => { setBusy(true); await onResolve(alert.id); setBusy(false) }}
              className="px-2.5 py-1 text-xs font-medium rounded border border-success/40 text-success hover:bg-success/10 transition-colors disabled:opacity-50">
              Resolve
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}
