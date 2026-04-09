'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Database, RefreshCw, X, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { cn, dbTypeLabel, healthStatusColor } from '@/lib/utils'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { api } from '@/lib/api'

type Connection = {
  id: string
  name: string
  db_type: 'oracle' | 'mssql' | 'mariadb'
  environment: 'production' | 'uat'
  host: string
  port: number
  agent_name: string
  status: string
  health?: { score: number; status: string }
}

const DB_PORTS: Record<string, number> = { oracle: 1521, mssql: 1433, mariadb: 3306 }
const DB_PLACEHOLDER: Record<string, string> = {
  oracle:  'ORCL (service name or SID)',
  mssql:   'master (default database)',
  mariadb: 'app_db (schema name)',
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([])
  const [loading, setLoading]         = useState(true)
  const [scanning, setScanning]       = useState<string | null>(null)
  const [showForm, setShowForm]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.connections.list(true)
      setConnections((result.data as Connection[]) ?? [])
    } catch {
      // silently ignore — keeps empty state
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
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Connection
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total',      value: connections.length,                                               cls: '' },
          { label: 'Production', value: connections.filter(c => c.environment === 'production').length,  cls: 'text-critical' },
          { label: 'UAT',        value: connections.filter(c => c.environment === 'uat').length,         cls: 'text-brand-400' },
          { label: 'Active',     value: connections.filter(c => c.status === 'active').length,           cls: 'text-success' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn('text-2xl font-bold', cls || 'text-foreground')}>{value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            Loading connections…
          </div>
        ) : connections.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-semibold text-foreground mb-1">No connections registered</p>
            <p className="text-sm text-muted-foreground mb-4">Add your first Oracle, SQL Server, or MariaDB instance</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add First Connection
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {['Name / Host', 'Type', 'Environment', 'Agent', 'Health', 'Status', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {connections.map((conn) => (
                <tr key={conn.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <DbIcon type={conn.db_type} />
                      <div>
                        <Link href={`/connections/${conn.id}`} className="font-semibold text-foreground hover:text-brand-400 transition-colors">
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
                        : 'text-brand-400 bg-brand-500/10 border-brand-500/30',
                    )}>
                      {conn.environment.toUpperCase()}
                    </span>
                  </td>
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
                    <div className="flex items-center gap-2 opacity-70 group-hover:opacity-100 transition-opacity">
                      <Link href={`/connections/${conn.id}`} className="flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium border border-border hover:bg-muted transition-colors text-foreground">
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
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && <AddConnectionPanel onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function DbIcon({ type }: { type: string }) {
  const colors: Record<string, string> = { oracle: 'bg-[#F80000]', mssql: 'bg-[#CC2927]', mariadb: 'bg-blue-500' }
  return <span className={cn('w-2 h-2 rounded-full shrink-0', colors[type] ?? 'bg-muted-foreground')} />
}

function AddConnectionPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name:            '',
    db_type:         'oracle' as 'oracle' | 'mssql' | 'mariadb',
    environment:     'production' as 'production' | 'uat',
    host:            '',
    port:            1521,
    database_name:   '',
    agent_name:      '',
    credentials_ref: '',
  })
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number } | null>(null)
  const [testing, setTesting]   = useState(false)

  function set(field: string, value: string | number) {
    setError('')
    setTestResult(null)
    if (field === 'db_type') {
      setForm(f => ({ ...f, db_type: value as any, port: DB_PORTS[value as string] ?? 1521 }))
    } else {
      setForm(f => ({ ...f, [field]: value }))
    }
  }

  async function testConnection() {
    if (!form.host || !form.credentials_ref) {
      setError('Host and Credentials Ref are required to test the connection.')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.connections.test(form as unknown as Record<string, unknown>)
      setTestResult(result.data ?? { ok: false, latency_ms: 0 })
    } catch {
      setTestResult({ ok: false, latency_ms: 0 })
    } finally {
      setTesting(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.host || !form.agent_name) {
      setError('Name, host, and agent name are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.connections.create({
        name:            form.name,
        db_type:         form.db_type,
        environment:     form.environment,
        host:            form.host,
        port:            Number(form.port),
        database_name:   form.database_name || undefined,
        agent_name:      form.agent_name,
        credentials_ref: form.credentials_ref || undefined,
      })
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[480px] bg-card border-l border-border shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-bold text-lg text-foreground">Add Connection</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Register a new database in ADORS</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2.5 text-sm text-critical">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}
            </div>
          )}

          <Field label="Connection Name" required>
            <input className={inputCls} placeholder="e.g. PROD_ORA_01" value={form.name} onChange={e => set('name', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Database Type" required>
              <select className={inputCls} value={form.db_type} onChange={e => set('db_type', e.target.value)}>
                <option value="oracle">Oracle</option>
                <option value="mssql">SQL Server</option>
                <option value="mariadb">MariaDB</option>
              </select>
            </Field>
            <Field label="Environment" required>
              <select className={inputCls} value={form.environment} onChange={e => set('environment', e.target.value)}>
                <option value="production">Production</option>
                <option value="uat">UAT</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Host / IP" required>
                <input className={inputCls} placeholder="db.internal or 10.0.0.100" value={form.host} onChange={e => set('host', e.target.value)} />
              </Field>
            </div>
            <Field label="Port" required>
              <input className={inputCls} type="number" value={form.port} onChange={e => set('port', Number(e.target.value))} />
            </Field>
          </div>

          <Field label={form.db_type === 'oracle' ? 'Service Name / SID' : 'Default Database'}>
            <input className={inputCls} placeholder={DB_PLACEHOLDER[form.db_type]} value={form.database_name} onChange={e => set('database_name', e.target.value)} />
          </Field>

          <Field label="Agent Name" required hint="Which bot monitors this connection (OraBot / MsBot / MarBot)">
            <input className={inputCls} placeholder="e.g. OraBot" value={form.agent_name} onChange={e => set('agent_name', e.target.value)} />
          </Field>

          <Field label="Credentials Ref" hint='Format: ENV:PREFIX — set PREFIX_USER and PREFIX_PASSWORD in environment. Leave blank to use mock adapter.'>
            <input className={inputCls} placeholder="ENV:ORACLE_PROD  (blank = mock mode)" value={form.credentials_ref} onChange={e => set('credentials_ref', e.target.value)} />
          </Field>

          {form.credentials_ref.startsWith('ENV:') && (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/5 px-3 py-2.5 text-xs text-brand-400 space-y-1">
              <p className="font-semibold">Required env vars for <code className="font-mono">{form.credentials_ref}</code>:</p>
              {['USER', 'PASSWORD', 'HOST', 'PORT', 'DATABASE'].map(k => (
                <p key={k} className="font-mono text-[11px] text-muted-foreground">{form.credentials_ref.slice(4)}_{k}</p>
              ))}
            </div>
          )}

          {form.credentials_ref && (
            <div className="flex items-center gap-3">
              <button type="button" onClick={testConnection} disabled={testing}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors disabled:opacity-50">
                <RefreshCw className={cn('w-3.5 h-3.5', testing && 'animate-spin')} />
                {testing ? 'Testing…' : 'Test Connection'}
              </button>
              {testResult && (
                <span className={cn('text-xs font-medium', testResult.ok ? 'text-success' : 'text-critical')}>
                  {testResult.ok ? `✓ Connected — ${testResult.latency_ms}ms` : '✗ Connection failed'}
                </span>
              )}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {form.credentials_ref ? 'Live adapter will be used' : 'Mock adapter — no credentials needed'}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors text-foreground">
              Cancel
            </button>
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save Connection'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40'

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-foreground">
        {label}{required && <span className="text-critical ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
    </div>
  )
}
