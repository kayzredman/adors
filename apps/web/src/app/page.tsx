'use client'

import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Database, Zap } from 'lucide-react'
import Link from 'next/link'
import { DbHealthCard } from '@/components/dashboard/DbHealthCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { api } from '@/lib/api'

export default function DashboardPage() {
  const [connections,  setConnections]  = useState<any[]>([])
  const [activity,     setActivity]     = useState<any[]>([])
  const [alertCounts,  setAlertCounts]  = useState({ critical: 0, warning: 0, info: 0, total: 0 })
  const [loading,      setLoading]      = useState(true)

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

  const prodConnections = connections.filter(c => c.environment === 'production')
  const uatConnections  = connections.filter(c => c.environment === 'uat')
  const overallScore    = connections.length
    ? Math.round(connections.reduce((sum, c) => sum + (c.health?.score ?? 0), 0) / connections.length)
    : 0

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

      {/* ── Main layout: health grid + activity feed ──────────── */}
      <div className="flex gap-6">
        <div className="flex-1 space-y-4">
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-critical" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production Databases</h2>
            </div>
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1,2,3].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {prodConnections.map((conn: any) => (
                  <Link key={conn.id} href={`/connections/${conn.id}`}>
                    <DbHealthCard connection={conn} className="cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition-all" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-brand-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">UAT Databases</h2>
            </div>
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1,2,3].map(i => <SkeletonCard key={i} />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {uatConnections.map((conn: any) => (
                  <Link key={conn.id} href={`/connections/${conn.id}`}>
                    <DbHealthCard connection={conn} className="cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition-all" />
                  </Link>
                ))}
              </div>
            )}
          </section>
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
    </div>
  )
}

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
