import Link from 'next/link'
import { Plus, Database, RefreshCw } from 'lucide-react'
import { cn, dbTypeLabel, healthStatusColor } from '@/lib/utils'
import { HealthGauge } from '@/components/ui/HealthGauge'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

async function getConnections() {
  try {
    const res = await fetch(`${API_URL}/api/connections?health=true`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return []
    return (await res.json()).data ?? []
  } catch {
    return []
  }
}

export default async function ConnectionsPage() {
  const connections = await getConnections()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Database className="w-6 h-6 text-brand-400" />
            Database Connections
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Manage registered databases and assigned agents
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Add Connection
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {['Name', 'Type', 'Environment', 'Agent', 'Health', 'Status', 'Actions'].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {connections.map((conn: any) => (
              <tr key={conn.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div>
                      <Link
                        href={`/connections/${conn.id}`}
                        className="font-semibold text-foreground hover:text-brand-400 transition-colors"
                      >
                        {conn.name}
                      </Link>
                      <p className="text-xs text-muted-foreground font-mono">{conn.host}:{conn.port}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-3.5">
                  <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                    {dbTypeLabel(conn.db_type)}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn(
                    'text-xs font-semibold px-2 py-0.5 rounded-full border',
                    conn.environment === 'production'
                      ? 'text-critical bg-critical/10 border-critical/30'
                      : 'text-brand-400 bg-brand-500/10 border-brand-500/30'
                  )}>
                    {conn.environment.toUpperCase()}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-muted-foreground font-medium">
                  {conn.agent_name}
                </td>
                <td className="px-5 py-3.5">
                  {conn.health ? (
                    <div className="flex items-center gap-2">
                      <HealthGauge score={conn.health.score} size={44} />
                      <span className={cn('text-xs font-medium capitalize', healthStatusColor(conn.health.status))}>
                        {conn.health.status}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No scan</span>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  <span className={cn(
                    'flex items-center gap-1.5 text-xs font-medium w-fit',
                    conn.status === 'active' ? 'text-success' : 'text-critical'
                  )}>
                    <span className={cn(
                      'w-2 h-2 rounded-full',
                      conn.status === 'active' ? 'bg-success' : 'bg-critical'
                    )} />
                    {conn.status.charAt(0).toUpperCase() + conn.status.slice(1)}
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/connections/${conn.id}`}
                      className="px-2.5 py-1 rounded text-xs font-medium border border-border hover:bg-muted transition-colors text-foreground"
                    >
                      Details
                    </Link>
                    <button className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-brand-500/40 text-brand-400 hover:bg-brand-500/10 transition-colors">
                      <RefreshCw className="w-3 h-3" /> Scan
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
