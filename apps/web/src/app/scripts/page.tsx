'use client'

import { useState, useEffect, useRef } from 'react'
import { BookOpen, Shield, ShieldAlert, ShieldCheck, ShieldX, FlaskConical, X, Loader2, Play, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'

type Script = {
  id: string
  name: string
  description: string
  db_type: 'oracle' | 'mssql' | 'mariadb'
  risk_level: 'zero' | 'low' | 'medium' | 'high'
  source: 'internal' | 'oem'
  sql_content?: string
  verified_at: string | null
  created_at: string
}

type UatEnv = {
  id: string
  name: string
  db_type: 'oracle' | 'mssql' | 'mariadb'
  host: string
  health_status: string | null
}

const RISK_CONFIG = {
  zero:   { label: 'Zero Risk', icon: ShieldCheck, cls: 'text-success bg-success/10 border-success/30' },
  low:    { label: 'Low',       icon: Shield,      cls: 'text-brand-400 bg-brand-500/10 border-brand-500/30' },
  medium: { label: 'Medium',    icon: ShieldAlert, cls: 'text-warning bg-warning/10 border-warning/30' },
  high:   { label: 'High',      icon: ShieldX,     cls: 'text-critical bg-critical/10 border-critical/30' },
}

const DB_COLORS = {
  oracle:  'text-[#F80000] bg-[#F80000]/10 border-[#F80000]/30',
  mssql:   'text-[#CC2927] bg-[#CC2927]/10 border-[#CC2927]/30',
  mariadb: 'text-[#003545] bg-[#003545]/10 border-[#003545]/20 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-700/30',
}

export default function ScriptsPage() {
  const { role } = useAuth()
  const canRun   = role === 'dba' || role === 'super_admin'
  const [scripts, setScripts] = useState<Script[]>([])
  const [loading, setLoading] = useState(true)
  const [testScript, setTestScript] = useState<Script | null>(null)

  useEffect(() => {
    api.scripts.list()
      .then(r => setScripts((r.data as Script[]) ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const byType = {
    oracle:  scripts.filter(s => s.db_type === 'oracle'),
    mssql:   scripts.filter(s => s.db_type === 'mssql'),
    mariadb: scripts.filter(s => s.db_type === 'mariadb'),
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <BookOpen className="w-6 h-6 text-brand-400" />
            Script Library
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Remediation scripts — UAT-verified before production execution
          </p>
        </div>
        <div className="flex gap-3 text-sm text-muted-foreground">
          {loading ? (
            <span className="text-muted-foreground text-xs animate-pulse">Loading…</span>
          ) : (
            <>
              <span><strong className="text-foreground">{scripts.length}</strong> scripts</span>
              <span><strong className="text-success">{scripts.filter(s => s.verified_at).length}</strong> verified</span>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-xl border border-border bg-card animate-pulse" />
          ))}
        </div>
      ) : (
        /* Grid by DB type */
        (Object.entries(byType) as [keyof typeof byType, Script[]][]).map(([type, list]) => (
          <section key={type}>
            <div className="flex items-center gap-2 mb-3">
              <span className={cn('text-xs font-bold px-2 py-0.5 rounded border font-mono', DB_COLORS[type])}>
                {type.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground">{list.length} scripts</span>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
              {list.map(script => (
                <ScriptCard
                  key={script.id}
                  script={script}
                  canRun={canRun}
                  onTestInUat={canRun ? () => setTestScript(script) : undefined}
                />
              ))}
            </div>
          </section>
        ))
      )}

      {/* UAT picker modal */}
      {testScript && (
        <TestInUatModal
          script={testScript}
          onClose={() => setTestScript(null)}
        />
      )}
    </div>
  )
}

function ScriptCard({ script, canRun, onTestInUat }: { script: Script; canRun: boolean; onTestInUat?: () => void }) {
  const risk = RISK_CONFIG[script.risk_level]
  const RiskIcon = risk.icon

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-border/60 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground text-sm leading-snug">{script.name}</p>
        <span className={cn('shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide', risk.cls)}>
          <RiskIcon className="w-3 h-3" />{risk.label}
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{script.description}</p>

      {/* SQL preview */}
      <pre className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
        {script.sql_content?.split('\n').slice(0, 2).join('\n')}
      </pre>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', script.source === 'oem' ? 'text-brand-400 border-brand-500/30 bg-brand-500/10' : 'text-muted-foreground border-border')}>
            {script.source.toUpperCase()}
          </span>
          {script.verified_at && (
            <span className="flex items-center gap-1 text-[10px] text-success">
              <ShieldCheck className="w-3 h-3" /> Sandbox verified
            </span>
          )}
        </div>
        {canRun ? (
          <button
            onClick={onTestInUat}
            className="flex items-center gap-1 text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
          >
            <FlaskConical className="w-3 h-3" /> Test in UAT →
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground/50">DBA role required</span>
        )}
      </div>
    </div>
  )
}

// ─── UAT env picker modal ────────────────────────────────────────────────────
type RunStatus = 'pending' | 'running' | 'success' | 'failure' | 'error'

function TestInUatModal({ script, onClose }: { script: Script; onClose: () => void }) {
  const [envs, setEnvs]         = useState<UatEnv[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr]           = useState<string | null>(null)

  // Polling state
  const [runId, setRunId]         = useState<string | null>(null)
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null)
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [runMs, setRunMs]         = useState<number | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.sandbox.envs()
      .then(r => {
        const all = (r.data as UatEnv[]) ?? []
        const compatible = all.filter(e => e.db_type === script.db_type)
        setEnvs(compatible)
        if (compatible.length === 1) setSelected(compatible[0].id)
      })
      .catch(() => setErr('Failed to load UAT environments'))
  }, [script.db_type])

  // Start polling when runId is set
  useEffect(() => {
    if (!runId) return

    const poll = async () => {
      try {
        const res = await api.sandbox.getRun(runId)
        const run = res.data as any
        setRunStatus(run.status as RunStatus)
        setRunOutput(run.output_log ?? null)
        setRunMs(run.exec_duration_ms ?? null)
        if (run.status === 'success' || run.status === 'failure' || run.status === 'error') {
          clearInterval(pollRef.current!)
          pollRef.current = null
        }
      } catch {
        // transient — keep polling
      }
    }

    poll() // immediate first check
    pollRef.current = setInterval(poll, 2000)

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [runId])

  async function submit() {
    if (!selected) return
    setSubmitting(true)
    setErr(null)
    try {
      const res = await api.sandbox.run(script.id, selected)
      setRunId(res.data.id)
      setRunStatus('pending')
    } catch (e: any) {
      setErr(e.message ?? 'Failed to queue run')
    } finally {
      setSubmitting(false)
    }
  }

  const isTerminal = runStatus === 'success' || runStatus === 'failure' || runStatus === 'error'

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-brand-400" />
            <p className="font-semibold text-foreground text-sm">Test in UAT</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Script</p>
            <p className="font-semibold text-foreground">{script.name}</p>
          </div>

          {/* ── Polling / status view ── */}
          {runStatus ? (
            <div className="space-y-3">
              {/* Status badge */}
              <div className={cn(
                'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium',
                runStatus === 'success'  ? 'text-success border-success/30 bg-success/10' :
                runStatus === 'failure' || runStatus === 'error'
                                         ? 'text-critical border-critical/30 bg-critical/10' :
                                           'text-muted-foreground border-border bg-muted/30'
              )}>
                {runStatus === 'success'  ? <CheckCircle2 className="w-4 h-4 shrink-0" /> :
                 runStatus === 'failure' || runStatus === 'error'
                                          ? <XCircle className="w-4 h-4 shrink-0" /> :
                 runStatus === 'running'  ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" /> :
                                           <Clock className="w-4 h-4 shrink-0" />}
                <span className="capitalize">{runStatus}</span>
                {runMs != null && isTerminal && (
                  <span className="ml-auto text-xs font-normal text-muted-foreground">{runMs}ms</span>
                )}
              </div>

              {/* Output log (terminal states) */}
              {runOutput && isTerminal && (
                <pre className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {runOutput}
                </pre>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-1">
                {isTerminal && (
                  <button
                    onClick={() => { setRunId(null); setRunStatus(null); setRunOutput(null); setRunMs(null) }}
                    className="text-sm px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Run Again
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="text-sm px-4 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-400 transition-colors"
                >
                  {isTerminal ? 'Done' : 'Close'}
                </button>
              </div>
            </div>
          ) : (
            /* ── Env picker ── */
            <>
              <div>
                <p className="text-xs text-muted-foreground mb-2">Select UAT environment ({script.db_type.toUpperCase()})</p>
                {envs.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic">
                    {err ?? `No UAT ${script.db_type.toUpperCase()} environments found.`}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {envs.map(env => (
                      <label
                        key={env.id}
                        className={cn(
                          'flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                          selected === env.id
                            ? 'border-brand-500 bg-brand-500/10'
                            : 'border-border hover:border-border/80 bg-card'
                        )}
                      >
                        <input
                          type="radio"
                          name="env"
                          value={env.id}
                          checked={selected === env.id}
                          onChange={() => setSelected(env.id)}
                          className="accent-brand-500"
                        />
                        <div>
                          <p className="text-sm font-medium text-foreground">{env.name}</p>
                          <p className="text-[11px] font-mono text-muted-foreground">{env.host}</p>
                        </div>
                        <span className={cn(
                          'ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded',
                          env.health_status === 'healthy' ? 'text-success bg-success/10' :
                          env.health_status === 'warning' ? 'text-warning bg-warning/10' :
                          'text-muted-foreground bg-muted/50'
                        )}>
                          {env.health_status ?? 'unknown'}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {err && <p className="text-xs text-critical">{err}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!selected || submitting || envs.length === 0}
                  className="flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg bg-brand-500 text-white hover:bg-brand-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                  Run in UAT
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
