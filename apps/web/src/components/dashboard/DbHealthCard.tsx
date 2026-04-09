import { cn, dbTypeLabel } from '@/lib/utils'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { AlertTriangle, CheckCircle2, Database } from 'lucide-react'
import type { DbConnection, HealthSnapshot } from '@adors/shared'

interface DbHealthCardProps {
  connection: DbConnection & { health: HealthSnapshot | null }
  className?: string
}

export function DbHealthCard({ connection, className }: DbHealthCardProps) {
  const { health } = connection
  const score  = health?.score ?? 0
  const status = health?.status ?? 'unknown'

  const borderColor =
    status === 'healthy'  ? 'border-l-success' :
    status === 'warning'  ? 'border-l-warning' :
    status === 'critical' ? 'border-l-critical' :
    'border-l-muted-foreground'

  const statusIcon =
    status === 'healthy'  ? <CheckCircle2 className="w-4 h-4 text-success" /> :
    status === 'critical' ? <AlertTriangle className="w-4 h-4 text-critical" /> :
    <AlertTriangle className="w-4 h-4 text-warning" />

  return (
    <div
      className={cn(
        'rounded-xl bg-card border border-border border-l-4 p-5 flex flex-col gap-4 transition-all hover:border-border/80',
        borderColor,
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="font-semibold text-sm text-foreground">{connection.name}</p>
            <span className="inline-block text-[10px] font-mono font-bold tracking-wider px-1.5 py-0.5 rounded border border-border text-muted-foreground mt-0.5">
              {dbTypeLabel(connection.db_type)}
            </span>
          </div>
        </div>
        {statusIcon}
      </div>

      {/* Gauge */}
      <div className="flex items-center justify-between">
        <HealthGauge score={score} size={88} />
        <div className="text-right space-y-2">
          <div>
            <p className="text-xs text-muted-foreground">Active Alerts</p>
            <p className={cn(
              'text-lg font-bold',
              (health?.active_alerts ?? 0) > 0 ? 'text-critical' : 'text-muted-foreground'
            )}>
              {health?.active_alerts ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Blocked Sessions</p>
            <p className={cn(
              'text-lg font-bold',
              (health?.blocked_sessions ?? 0) > 0 ? 'text-warning' : 'text-muted-foreground'
            )}>
              {health?.blocked_sessions ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Status pill */}
      <div className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium text-center',
        status === 'healthy'  ? 'bg-success/10 text-success' :
        status === 'critical' ? 'bg-critical/10 text-critical' :
        status === 'warning'  ? 'bg-warning/10 text-warning' :
        'bg-muted text-muted-foreground'
      )}>
        {status === 'healthy'
          ? 'All systems nominal'
          : `Issue: ${health?.metrics?.tablespace_usage_pct ? 'Tablespace Near Limit' : 'High Memory Usage'}`}
      </div>
    </div>
  )
}
