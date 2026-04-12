'use client'

import { useEffect, useState, useCallback } from 'react'
import { ClipboardList, Search, ChevronLeft, ChevronRight, Filter, RefreshCw, Zap, AlertTriangle, Activity, CheckCircle2, Database, Shield, FileText, User, X } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { api } from '@/lib/api'

// ─── Types ──────────────────────────────────────────────────────────────────
interface ActivityEntry {
  id:          string
  action:      string
  actor_name:  string
  target_type: string
  target_id:   string | null
  payload:     Record<string, unknown>
  created_at:  string
}

const PAGE_SIZE = 30

// ─── Icon resolver ──────────────────────────────────────────────────────────
function activityIcon(action: string, targetType: string) {
  if (action.includes('heal') || action.includes('kill') || action.includes('agent_query'))
    return <Zap className="w-4 h-4 text-brand-400" />
  if (action.includes('alert') && action.includes('critical'))
    return <AlertTriangle className="w-4 h-4 text-critical" />
  if (action.includes('alert'))
    return <AlertTriangle className="w-4 h-4 text-warning" />
  if (action.includes('scan'))
    return <Activity className="w-4 h-4 text-success" />
  if (action.includes('sandbox') || action.includes('passed'))
    return <CheckCircle2 className="w-4 h-4 text-success" />
  if (action.includes('fail'))
    return <AlertTriangle className="w-4 h-4 text-critical" />
  if (targetType === 'connection')
    return <Database className="w-4 h-4 text-brand-400" />
  if (targetType === 'dr_pair' || targetType === 'dr_drill')
    return <Shield className="w-4 h-4 text-brand-400" />
  if (targetType === 'script')
    return <FileText className="w-4 h-4 text-brand-400" />
  return <Activity className="w-4 h-4 text-muted-foreground" />
}

// ─── Human-friendly label ───────────────────────────────────────────────────
function actionLabel(action: string): string {
  return action
    .replace(/[._]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Badge color for target_type ────────────────────────────────────────────
const TARGET_COLORS: Record<string, string> = {
  connection: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  script:     'bg-purple-500/15 text-purple-400 border-purple-500/30',
  sandbox:    'bg-amber-500/15 text-amber-400 border-amber-500/30',
  dr_pair:    'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  dr_drill:   'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  alert:      'bg-red-500/15 text-red-400 border-red-500/30',
  user:       'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
}

// ─── Payload detail renderer ────────────────────────────────────────────────
function PayloadDetail({ payload }: { payload: Record<string, unknown> }) {
  const entries = Object.entries(payload).filter(([, v]) => v != null && v !== '')
  if (entries.length === 0) return null
  return (
    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5">
      {entries.slice(0, 6).map(([k, v]) => (
        <span key={k} className="text-xs text-muted-foreground">
          <span className="text-muted-foreground/60">{k}:</span>{' '}
          <span className="text-foreground/70">{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
        </span>
      ))}
      {entries.length > 6 && (
        <span className="text-xs text-muted-foreground/50">+{entries.length - 6} more</span>
      )}
    </div>
  )
}

// ─── Main page ──────────────────────────────────────────────────────────────
export default function ActivityPage() {
  const [entries,  setEntries]  = useState<ActivityEntry[]>([])
  const [total,    setTotal]    = useState(0)
  const [page,     setPage]     = useState(0)
  const [loading,  setLoading]  = useState(true)
  const [search,   setSearch]   = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterType,   setFilterType]   = useState('')
  const [showFilters,  setShowFilters]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        limit:  PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (search.trim())    params.search     = search.trim()
      if (filterAction)     params.action      = filterAction
      if (filterType)       params.targetType  = filterType

      const res = await api.activity.search(params)
      setEntries(res.data as ActivityEntry[])
      setTotal(res.total)
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [page, search, filterAction, filterType])

  useEffect(() => { load() }, [load])

  // Reset to page 0 when filters change
  useEffect(() => { setPage(0) }, [search, filterAction, filterType])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = Boolean(search || filterAction || filterType)

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <ClipboardList className="w-6 h-6 text-brand-400" />
            Audit Log
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Full history of actions across connections, scripts, alerts, and DR operations
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:bg-card text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search input */}
        <div className="flex-1 flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder="Search actions, actors, types…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} className="text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(f => !f)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors',
            showFilters || hasFilters
              ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-card'
          )}
        >
          <Filter className="w-4 h-4" />
          Filters
          {hasFilters && (
            <span className="w-2 h-2 rounded-full bg-brand-400" />
          )}
        </button>
      </div>

      {/* Filter chips */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground font-medium">Action:</label>
            <select
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
              className="bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All</option>
              <option value="connection">Connection</option>
              <option value="health_scan">Health Scan</option>
              <option value="alert">Alert</option>
              <option value="sandbox">Sandbox</option>
              <option value="script">Script</option>
              <option value="agent_query">Agent Query</option>
              <option value="dr_">DR</option>
              <option value="invite">Invite</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground font-medium">Target:</label>
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="bg-card border border-border rounded-lg px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All</option>
              <option value="connection">Connection</option>
              <option value="script">Script</option>
              <option value="sandbox">Sandbox</option>
              <option value="alert">Alert</option>
              <option value="dr_pair">DR Pair</option>
              <option value="dr_drill">DR Drill</option>
              <option value="user">User</option>
            </select>
          </div>

          {hasFilters && (
            <button
              onClick={() => { setSearch(''); setFilterAction(''); setFilterType('') }}
              className="text-xs text-brand-400 hover:text-brand-300 transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total > 0
            ? `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total} entries`
            : loading ? 'Loading…' : 'No entries found'}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground w-10" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Action</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Actor</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Target</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Details</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground w-36">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {loading && entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No activity entries found
                </td>
              </tr>
            ) : entries.map(entry => (
              <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  {activityIcon(entry.action, entry.target_type)}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-foreground">
                    {actionLabel(entry.action)}
                  </span>
                  <span className="md:hidden block text-xs text-muted-foreground mt-0.5">
                    {entry.actor_name}
                  </span>
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-muted-foreground/60" />
                    <span className="text-foreground/80 truncate max-w-[180px]">{entry.actor_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className={cn(
                    'text-[11px] font-semibold px-2 py-0.5 rounded-full border',
                    TARGET_COLORS[entry.target_type] ?? 'bg-muted text-muted-foreground border-border'
                  )}>
                    {entry.target_type}
                  </span>
                </td>
                <td className="px-4 py-3 hidden xl:table-cell max-w-xs">
                  <PayloadDetail payload={entry.payload} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {formatRelativeTime(entry.created_at)}
                  </div>
                  <div className="text-[10px] text-muted-foreground/50 tabular-nums">
                    {new Date(entry.created_at).toLocaleString()}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Prev
          </button>
          <span className="text-sm text-muted-foreground tabular-nums px-2">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-card disabled:opacity-30 transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
