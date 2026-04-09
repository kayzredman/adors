import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)

  if (diffMins < 1)  return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

export function healthStatusColor(status: string) {
  switch (status) {
    case 'healthy':  return 'text-success'
    case 'warning':  return 'text-warning'
    case 'critical': return 'text-critical'
    default:         return 'text-muted-foreground'
  }
}

export function severityColor(severity: string) {
  switch (severity) {
    case 'critical': return 'text-critical bg-critical/10 border-critical/30'
    case 'warning':  return 'text-warning bg-warning/10 border-warning/30'
    case 'info':     return 'text-info bg-info/10 border-info/30'
    default:         return 'text-muted-foreground'
  }
}

export function dbTypeLabel(type: string) {
  switch (type) {
    case 'oracle':  return 'ORACLE'
    case 'mssql':   return 'MSSQL'
    case 'mariadb': return 'MARIADB'
    default:        return type.toUpperCase()
  }
}
