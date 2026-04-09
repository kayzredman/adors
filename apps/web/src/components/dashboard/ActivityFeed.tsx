import { formatRelativeTime } from '@/lib/utils'
import { Zap, AlertTriangle, Activity, CheckCircle2 } from 'lucide-react'

interface ActivityEntry {
  id: string
  action: string
  actor_name: string
  target_type: string
  payload: Record<string, unknown>
  created_at: string
}

interface ActivityFeedProps {
  entries: ActivityEntry[]
}

function activityIcon(action: string) {
  if (action.includes('heal') || action.includes('kill') || action.includes('exec')) return <Zap className="w-4 h-4 text-brand-400" />
  if (action.includes('alert') && action.includes('critical'))                         return <AlertTriangle className="w-4 h-4 text-critical" />
  if (action.includes('scan'))                                                          return <Activity className="w-4 h-4 text-success" />
  if (action.includes('sandbox') || action.includes('passed'))                         return <CheckCircle2 className="w-4 h-4 text-success" />
  return <Activity className="w-4 h-4 text-muted-foreground" />
}

function actionLabel(entry: ActivityEntry): { title: string; description: string } {
  const p = entry.payload ?? {}
  switch (entry.action) {
    case 'health_scan.manual':
      return {
        title:       'Manual health scan triggered',
        description: `Score: ${p.score ?? '—'} — Status: ${p.status ?? '—'}`,
      }
    case 'alert.acknowledged':
      return { title: 'Alert acknowledged', description: `By ${entry.actor_name}` }
    case 'alert.resolved':
      return { title: 'Alert resolved',     description: `By ${entry.actor_name}` }
    case 'connection.created':
      return { title: `Connection added: ${p.name ?? ''}`, description: String(p.db_type ?? '').toUpperCase() }
    case 'connection.deleted':
      return { title: `Connection removed: ${p.name ?? ''}`, description: '' }
    default:
      return { title: entry.action, description: entry.actor_name }
  }
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  if (!entries.length) {
    return <p className="text-sm text-muted-foreground text-center py-8">No recent activity</p>
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => {
        const { title, description } = actionLabel(entry)
        return (
          <div key={entry.id} className="flex gap-3 text-sm">
            <div className="mt-0.5 shrink-0">
              {activityIcon(entry.action)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{title}</p>
              {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
            </div>
            <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
              {formatRelativeTime(entry.created_at)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
