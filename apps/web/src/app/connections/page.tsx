'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { Plus, Database, RefreshCw, ChevronRight, Loader2, AlertCircle, Pencil, Trash2, Search, X } from 'lucide-react'
import { cn, dbTypeLabel, healthStatusColor } from '@/lib/utils'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { ConnectionPanel, DeleteConfirm } from '@/components/connections/ConnectionPanel'

type Connection = {
  id: string
  name: string
  db_type: 'oracle' | 'mssql' | 'mariadb'
  environment: 'production' | 'uat'
  host: string
  port: number
  database_name?: string
  agent_name: string
  has_credentials: boolean
  oracle_privilege?: 'SYSDBA' | 'SYSOPER'
  status: string
  health?: { score: number; status: string }
}

type EnvTab   = 'all' | 'production' | 'uat'
type DbFilter = 'all' | 'oracle' | 'mssql' | 'mariadb'

const DB_CHIP_COLORS: Record<string, { base: string; active: string }> = {
  oracle:  { base: 'text-[#F80000] border-[#F80000]/30', active: 'bg-[#F80000]/15 border-[#F80000]/50'  },
  mssql:   { base: 'text-[#CC2927] border-[#CC2927]/30', active: 'bg-[#CC2927]/15 border-[#CC2927]/50'  },
  mariadb: { base: 'text-blue-500 border-blue-500/30',   active: 'bg-blue-500/15 border-blue-500/50'    },
}

export default function ConnectionsPage() {
  const { role } = useAuth()
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading,     setLoading]     = useState(true)
  const [fetchError,  setFetchError]  = useState<string | null>(null)
  const [scanning,    setScanning]    = useState<string | null>(null)
  const [showCreate,  setShowCreate]  = useState(false)
  const [editConn,    setEditConn]    = useState<Connection | null>(null)
  const [deleteConn,  setDeleteConn]  = useState<Connection | null>(null)
  const [envTab,      setEnvTab]      = useState<EnvTab>('all')
  const [dbFilter,    setDbFilter]    = useState<DbFilter>('all')
  const [search,      setSearch]      = useState('')

  const isAdmin = role === 'super_admin'
  const canWrite = role === 'dba' || role === 'super_admin'

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const result = await api.connections.list(true)
      setConnections((result.data as Connection[]) ?? [])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load connections')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function scan(id: string) {
    setScanning(id)
    try {
      await api.connections.scan(id)
      await load()
    } finally {
      setScanning(null)
    }
  }

  const prodCount = connections.filter(c => c.environment === 'production').length
  const uatCount  = connections.filter(c => c.environment === 'uat').length

  const visibleConns = useMemo(() => connections.filter(c => {
    if (envTab !== 'all' && c.environment !== envTab) return false
    if (dbFilter !== 'all' && c.db_type !== dbFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.name.toLowerCase().includes(q) && !c.host.toLowerCase().includes(q)) return false
    }
    return true
  }), [connections, envTab, dbFilter, search])

  const showEnvCol = envTab === 'all'

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
        {canWrite && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Connection
          </button>
        )}
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {fetchError}
          <button onClick={load} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      {/* Tabs + Filter + Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Environment tabs */}
        <div className="flex items-center border-b border-border px-2 pt-2">
          {([
            { key: 'all'        as EnvTab, label: 'All',        count: connections.length },
            { key: 'production' as EnvTab, label: 'Production', count: prodCount },
            { key: 'uat'        as EnvTab, label: 'UAT',        count: uatCount  },
          ]).map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => setEnvTab(key)}
              className={cn(
                'relative px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px',
                envTab === key
                  ? 'border-brand-500 text-brand-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
              <span className={cn(
                'ml-2 text-xs font-semibold px-1.5 py-0.5 rounded-full',
                envTab === key
                  ? key === 'production' ? 'bg-critical/15 text-critical' : 'bg-brand-500/15 text-brand-400'
                  : 'bg-muted text-muted-foreground',
              )}>
                {loading ? '–' : count}
              </span>
            </button>
          ))}
        </div>

        {/* Filter toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setDbFilter('all')}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                dbFilter === 'all'
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-400'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              All Types
            </button>
            {(['oracle', 'mssql', 'mariadb'] as DbFilter[]).map((type) => {
              const { base, active } = DB_CHIP_COLORS[type]
              const chipLabel = type === 'mssql' ? 'SQL Server' : type === 'oracle' ? 'Oracle' : 'MariaDB'
              const chipCount = connections.filter(c =>
                c.db_type === type && (envTab === 'all' || c.environment === envTab),
              ).length
              const dotCls = type === 'oracle' ? 'bg-[#F80000]' : type === 'mssql' ? 'bg-[#CC2927]' : 'bg-blue-500'
              return (
                <button
                  key={type}
                  onClick={() => setDbFilter(dbFilter === type ? 'all' : type)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border transition-colors',
                    dbFilter === type ? `${active} ${base}` : 'border-border text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', dotCls)} />
                  {chipLabel}
                  {chipCount > 0 && <span className="opacity-60">({chipCount})</span>}
                </button>
              )
            })}
          </div>
          <div className="flex-1 min-w-0" />
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name or host…"
              className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-brand-500 w-52"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Loading connections…
          </div>
        ) : visibleConns.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            {connections.length === 0 ? (
              <>
                <p className="font-semibold text-foreground mb-1">No connections registered</p>
                <p className="text-sm text-muted-foreground mb-4">Add your first Oracle, SQL Server, or MariaDB instance</p>
                {canWrite && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add First Connection
                  </button>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold text-foreground mb-1">No connections match</p>
                <p className="text-sm text-muted-foreground mb-3">Try adjusting the filters or search term</p>
                <button
                  onClick={() => { setDbFilter('all'); setSearch('') }}
                  className="text-sm text-brand-400 hover:underline"
                >
                  Clear filters
                </button>
              </>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Name / Host', 'Type', ...(showEnvCol ? ['Environment'] : []), 'Agent', 'Health', 'Status', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleConns.map((conn) => (
                <tr key={conn.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <DbIcon type={conn.db_type} />
                      <div>
                        <Link href={`/connections/${conn.id}`} className="font-semibold text-foreground hover:text-brand-400 transition-colors">
                          {conn.name}
                        </Link>
                        <p className="text-xs text-muted-foreground font-mono">{conn.host}:{conn.port}</p>
                        {conn.has_credentials
                          ? <p className="text-[10px] text-success font-medium">🔒 Credentials set</p>
                          : <p className="text-[10px] text-warning font-medium">⚠ Mock mode</p>
                        }
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                      {dbTypeLabel(conn.db_type)}
                    </span>
                  </td>
                  {showEnvCol && (
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        'text-xs font-semibold px-2 py-0.5 rounded-full border',
                        conn.environment === 'production'
                          ? 'text-critical bg-critical/10 border-critical/30'
                          : 'text-brand-400 bg-brand-500/10 border-brand-500/30',
                      )}>
                        {conn.environment.toUpperCase()}
                      </span>
                    </td>
                  )}
                  <td className="px-5 py-3.5 text-muted-foreground text-sm">{conn.agent_name}</td>
                  <td className="px-5 py-3.5">
                    {conn.health ? (
                      <div className="flex items-center gap-2">
                        <HealthGauge score={conn.health.score} size={40} />
                        <span className={cn('text-xs font-medium capitalize', healthStatusColor(conn.health.status))}>
                          {conn.health.status}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">Not scanned</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={cn(
                      'flex items-center gap-1.5 text-xs font-medium',
                      conn.status === 'active' ? 'text-success' : 'text-critical',
                    )}>
                      <span className={cn('w-2 h-2 rounded-full', conn.status === 'active' ? 'bg-success' : 'bg-critical')} />
                      {conn.status.charAt(0).toUpperCase() + conn.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Link href={`/connections/${conn.id}`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-border hover:bg-muted transition-colors text-foreground">
                        Details <ChevronRight className="w-3 h-3" />
                      </Link>
                      <button
                        onClick={() => scan(conn.id)}
                        disabled={scanning === conn.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-brand-500/40 text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw className={cn('w-3 h-3', scanning === conn.id && 'animate-spin')} />
                        Scan
                      </button>
                      {canWrite && (
                        <button
                          onClick={() => setEditConn(conn)}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          title="Edit connection"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={() => setDeleteConn(conn)}
                          className="p-1.5 rounded text-muted-foreground hover:text-critical hover:bg-critical/10 transition-colors"
                          title="Delete connection"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && (
        <ConnectionPanel
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
      {editConn && (
        <ConnectionPanel
          mode="edit"
          connection={editConn}
          onClose={() => setEditConn(null)}
          onSaved={() => { setEditConn(null); load() }}
        />
      )}
      {deleteConn && (
        <DeleteConfirm
          connection={deleteConn}
          onClose={() => setDeleteConn(null)}
          onDeleted={() => { setDeleteConn(null); load() }}
        />
      )}
    </div>
  )
}

function DbIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { oracle: 'bg-[#F80000]', mssql: 'bg-[#CC2927]', mariadb: 'bg-[#E8940A]' }
  return <span className={cn('w-2 h-2 rounded-full shrink-0', colors[type] ?? 'bg-muted-foreground')} />
}
