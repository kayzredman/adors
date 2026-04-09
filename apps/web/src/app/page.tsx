import { Activity, AlertTriangle, Database, Zap } from 'lucide-react'
import Link from 'next/link'
import { DbHealthCard } from '@/components/dashboard/DbHealthCard'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function getConnections() {
  try {
    const res = await fetch(`${API_URL}/api/connections?health=true`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

async function getActivityLog() {
  try {
    const res = await fetch(`${API_URL}/api/activity?limit=15`, {
      next: { revalidate: 15 },
    })
    if (!res.ok) return []
    const json = await res.json()
    return json.data ?? []
  } catch {
    return []
  }
}

async function getAlertCounts() {
  try {
    const res = await fetch(`${API_URL}/api/alerts/counts`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return { critical: 0, warning: 0, info: 0, total: 0 }
    const json = await res.json()
    return json.data
  } catch {
    return { critical: 0, warning: 0, info: 0, total: 0 }
  }
}

export default async function DashboardPage() {
  const [connections, activity, alertCounts] = await Promise.all([
    getConnections(),
    getActivityLog(),
    getAlertCounts(),
  ])

  const prodConnections = connections.filter((c: any) => c.environment === 'production')
  const uatConnections  = connections.filter((c: any) => c.environment === 'uat')
  const overallScore    = connections.length
    ? Math.round(connections.reduce((sum: number, c: any) => sum + (c.health?.score ?? 0), 0) / connections.length)
    : 0

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ───────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mission Control</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Live fleet monitoring — {connections.length} databases registered
          </p>
        </div>
        {/* Fleet summary pills */}
        <div className="flex items-center gap-3">
          <StatPill icon={<Database className="w-4 h-4" />} label="Fleet Score" value={`${overallScore}%`} color="text-brand-400" />
          <StatPill icon={<AlertTriangle className="w-4 h-4" />} label="Active Alerts" value={String(alertCounts.total)} color={alertCounts.total > 0 ? 'text-critical' : 'text-success'} />
          <StatPill icon={<Zap className="w-4 h-4" />} label="Critical" value={String(alertCounts.critical)} color={alertCounts.critical > 0 ? 'text-critical' : 'text-muted-foreground'} />
        </div>
      </div>

      {/* ── Main layout: health grid + activity feed ──────────── */}
      <div className="flex gap-6">
        {/* Health cards */}
        <div className="flex-1 space-y-4">
          {/* Production */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-critical" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production Databases</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {prodConnections.map((conn: any) => (
                <Link key={conn.id} href={`/connections/${conn.id}`}>
                  <DbHealthCard connection={conn} className="cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition-all" />
                </Link>
              ))}
            </div>
          </section>

          {/* UAT */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-brand-400" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">UAT Databases</h2>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {uatConnections.map((conn: any) => (
                <Link key={conn.id} href={`/connections/${conn.id}`}>
                  <DbHealthCard connection={conn} className="cursor-pointer hover:ring-1 hover:ring-brand-500/50 transition-all" />
                </Link>
              ))}
            </div>
          </section>
        </div>

        {/* Activity feed sidebar */}
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
