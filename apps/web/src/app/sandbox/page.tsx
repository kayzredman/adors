'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, Play, CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'

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
}

const STATUS_MAP = {
  pending: { label: 'Pending',  cls: 'text-muted-foreground bg-muted/50 border-border',       Icon: Clock },
  running: { label: 'Running',  cls: 'text-warning bg-warning/10 border-warning/30',           Icon: RefreshCw },
  success: { label: 'Passed',   cls: 'text-success bg-success/10 border-success/30',           Icon: CheckCircle2 },
  failure: { label: 'Failed',   cls: 'text-critical bg-critical/10 border-critical/30',        Icon: XCircle },
}

export default function SandboxPage() {
  const { role } = useAuth()
  const canRun   = role === 'dba' || role === 'super_admin'
  const [runs, setRuns]       = useState<SandboxRun[]>([])
  const [envs, setEnvs]       = useState<UatEnv[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<SandboxRun | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [runsRes, envsRes] = await Promise.all([
        api.sandbox.runs().catch(() => ({ data: [] })),
        api.sandbox.envs().catch(() => ({ data: [] })),
      ])
      setRuns((runsRes.data as SandboxRun[]) ?? [])
      setEnvs((envsRes.data as UatEnv[])    ?? [])
    } finally {
      setLoading(false)
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
        <button onClick={load} className="flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} /> Refresh
        </button>
      </div>

      {/* UAT Environment Status */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">UAT Environments</h2>
        <div className="grid grid-cols-3 gap-4">
          {envs.map(env => (
            <div key={env.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-sm text-foreground">{env.name}</span>
                <StatusDot status={env.health_status} />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{env.host}</p>
              <div className="mt-2 text-[11px] text-muted-foreground">
                {env.last_checked_at ? `Scanned ${formatRelativeTime(env.last_checked_at)}` : 'Not yet scanned'}
              </div>
            </div>
          ))}
        </div>
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
    </div>
  )
}

function StatusDot({ status }: { status: string | null }) {
  const cls = status === 'healthy' ? 'bg-success' : status === 'warning' ? 'bg-warning' : status === 'critical' ? 'bg-critical' : 'bg-muted-foreground'
  return <span className={cn('inline-block w-2 h-2 rounded-full', cls)} />
}
