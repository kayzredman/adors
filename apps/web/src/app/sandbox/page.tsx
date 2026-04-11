'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, Plus, Play, CheckCircle2, XCircle, Clock, RefreshCw, Pencil, Trash2, AlertCircle, Loader2 } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'
import { ConnectionPanel, DeleteConfirm, type ConnectionForPanel } from '@/components/connections/ConnectionPanel'

type SandboxRun = {
  id: string
  connection_id: string
  connection_name: string
  script_id: string
  script_name: string
  db_type: string
  status: 'pending' | 'running' | 'success' | 'failure'
  output_log: string | null
  cpu_impact_pct: number | null
  exec_duration_ms: number | null
  tested_at: string
}

type UatEnv = {
  id: string
  name: string
  db_type: 'oracle' | 'mssql' | 'mariadb'
  host: string
  health_status: string | null
  last_checked_at: string | null
  // Fields required by ConnectionForPanel (for edit/delete)
  environment: 'uat'
  port: number
  database_name?: string
  agent_name: string
  has_credentials: boolean
  oracle_privilege?: 'SYSDBA' | 'SYSOPER'
}

const STATUS_MAP = {
  pending: { label: 'Pending',  cls: 'text-muted-foreground bg-muted/50 border-border',       Icon: Clock },
  running: { label: 'Running',  cls: 'text-warning bg-warning/10 border-warning/30',           Icon: RefreshCw },
  success: { label: 'Passed',   cls: 'text-success bg-success/10 border-success/30',           Icon: CheckCircle2 },
  failure: { label: 'Failed',   cls: 'text-critical bg-critical/10 border-critical/30',        Icon: XCircle },
}

const DB_TYPE_COLORS: Record<string, string> = {
  oracle:  'text-[#F80000] bg-[#F80000]/10 border-[#F80000]/30',
  mssql:   'text-[#0078D4] bg-[#0078D4]/10 border-[#0078D4]/30',
  mariadb: 'text-[#E8940A] bg-[#E8940A]/10 border-[#E8940A]/30',
}

export default function SandboxPage() {
  const { role } = useAuth()
  const canWrite = role === 'dba' || role === 'super_admin'
  const isAdmin  = role === 'super_admin'

  const [runs, setRuns]       = useState<SandboxRun[]>([])
  const [envs, setEnvs]       = useState<UatEnv[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState<string | null>(null)
  const [selected, setSelected] = useState<SandboxRun | null>(null)

  // CRUD state
  const [showCreate,  setShowCreate]  = useState(false)
  const [editEnv,     setEditEnv]     = useState<ConnectionForPanel | null>(null)
  const [deleteEnv,   setDeleteEnv]   = useState<ConnectionForPanel | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [runsRes, envsRes] = await Promise.all([
        api.sandbox.runs().catch(() => ({ data: [] })),
        api.connections.list(true).catch(() => ({ data: [] })),
      ])
      setRuns((runsRes.data as SandboxRun[]) ?? [])
      // Filter to UAT-only and map to UatEnv shape
      const all = (envsRes.data as any[]) ?? []
      const uat = all
        .filter(c => c.environment === 'uat')
        .map(c => ({
          id:              c.id,
          name:            c.name,
          db_type:         c.db_type,
          host:            c.host,
          port:            c.port,
          database_name:   c.database_name,
          agent_name:      c.agent_name,
          has_credentials: c.has_credentials,
          oracle_privilege: c.oracle_privilege,
          environment:     'uat' as const,
          health_status:   c.health?.status ?? null,
          last_checked_at: c.health?.scored_at ?? null,
        }))
      setEnvs(uat)
    } finally {
      setLoading(false)
    }
  }

  async function scan(id: string) {
    setScanning(id)
    try {
      await api.connections.scan(id)
      await load()
    } finally {
      setScanning(null)
    }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <FlaskConical className="w-6 h-6 text-brand-400" />
            UAT Sandbox
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Test remediation scripts on UAT databases before production execution
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canWrite && (
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add UAT Environment
            </button>
          )}
          <button onClick={load} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
          </button>
        </div>
      </div>

      {/* UAT Environments — CRUD */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">UAT Environments</h2>

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 animate-pulse h-28" />
            ))}
          </div>
        ) : envs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center space-y-3">
            <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto" />
            <div>
              <p className="font-semibold text-foreground mb-1">No UAT environments registered</p>
              <p className="text-sm text-muted-foreground">Add a UAT database connection to start testing scripts in a safe environment.</p>
            </div>
            {canWrite && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Add UAT Environment
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {envs.map(env => (
              <div key={env.id} className="rounded-xl border border-border bg-card p-4 space-y-3 group">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{env.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{env.host}</p>
                  </div>
                  <StatusDot status={env.health_status} />
                </div>

                {/* Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide', DB_TYPE_COLORS[env.db_type] ?? 'text-muted-foreground border-border')}>
                    {env.db_type}
                  </span>
                  <span className={cn(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded border',
                    env.health_status === 'healthy' ? 'text-success bg-success/10 border-success/30' :
                    env.health_status === 'warning'  ? 'text-warning bg-warning/10 border-warning/30' :
                    env.health_status === 'critical' ? 'text-critical bg-critical/10 border-critical/30' :
                    'text-muted-foreground bg-muted/50 border-border'
                  )}>
                    {env.health_status ?? 'Unknown'}
                  </span>
                  {env.has_credentials
                    ? <span className="text-[10px] text-success font-medium">🔒 Credentials set</span>
                    : <span className="text-[10px] text-warning font-medium">⚠ Mock mode</span>
                  }
                </div>

                {/* Last scan */}
                <p className="text-[11px] text-muted-foreground">
                  {env.last_checked_at ? `Scanned ${formatRelativeTime(env.last_checked_at)}` : 'Not yet scanned'}
                </p>

                {/* Actions */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    onClick={() => scan(env.id)}
                    disabled={scanning === env.id}
                    className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-brand-500/40 text-brand-400 hover:bg-brand-500/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={cn('w-3 h-3', scanning === env.id && 'animate-spin')} />
                    Scan
                  </button>
                  {canWrite && (
                    <button
                      onClick={() => setEditEnv(env)}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteEnv(env)}
                      className="p-1.5 rounded text-muted-foreground hover:text-critical hover:bg-critical/10 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Runs Table */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Recent Test Runs
        </h2>
        {loading ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
            Loading...
          </div>
        ) : runs.length === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">No sandbox runs yet. Go to Script Library and click "Test in UAT".</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Script</th>
                  <th className="text-left px-4 py-3 font-medium">Target</th>
                  <th className="text-right px-4 py-3 font-medium">Duration</th>
                  <th className="text-right px-4 py-3 font-medium">CPU Impact</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Tested</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {runs.map(run => {
                  const s = STATUS_MAP[run.status] ?? STATUS_MAP.pending
                  return (
                    <tr key={run.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-medium text-foreground">{run.script_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-mono text-muted-foreground">{run.connection_name}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {run.exec_duration_ms != null ? `${run.exec_duration_ms} ms` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                        {run.cpu_impact_pct != null ? `${run.cpu_impact_pct.toFixed(1)} %` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border', s.cls)}>
                          <s.Icon className="w-3 h-3" />{s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatRelativeTime(run.tested_at)}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => setSelected(run)} className="text-xs text-brand-400 hover:underline">Logs</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Log Drawer */}
      {selected && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-end justify-center p-6">
          <div className="w-full max-w-2xl rounded-t-2xl border border-border bg-card shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <p className="font-semibold text-foreground">{selected.script_name}</p>
                <p className="text-xs text-muted-foreground">{selected.connection_name} · {formatRelativeTime(selected.tested_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <pre className="p-5 text-xs font-mono text-muted-foreground max-h-64 overflow-y-auto bg-muted/30">
              {selected.output_log ?? '(no output captured)'}
            </pre>
          </div>
        </div>
      )}

      {/* CRUD modals */}
      {showCreate && (
        <ConnectionPanel
          mode="create"
          defaultEnvironment="uat"
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load() }}
        />
      )}
      {editEnv && (
        <ConnectionPanel
          mode="edit"
          connection={editEnv}
          onClose={() => setEditEnv(null)}
          onSaved={() => { setEditEnv(null); load() }}
        />
      )}
      {deleteEnv && (
        <DeleteConfirm
          connection={deleteEnv}
          onClose={() => setDeleteEnv(null)}
          onDeleted={() => { setDeleteEnv(null); load() }}
        />
      )}
    </div>
  )
}

function StatusDot({ status }: { status: string | null }) {
  const cls = status === 'healthy' ? 'bg-success' : status === 'warning' ? 'bg-warning' : status === 'critical' ? 'bg-critical' : 'bg-muted-foreground'
  return <span className={cn('inline-block w-2 h-2 rounded-full animate-pulse', cls)} />
}
