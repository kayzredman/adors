'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Database, RefreshCw, X, ChevronRight, Loader2, AlertCircle, Pencil, Trash2 } from 'lucide-react'
import { cn, dbTypeLabel, healthStatusColor } from '@/lib/utils'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'

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

const DB_PORTS: Record<string, number> = { oracle: 1521, mssql: 1433, mariadb: 3306 }
const DB_PLACEHOLDER: Record<string, string> = {
  oracle:  'ORCL (service name or SID)',
  mssql:   'master (default database)',
  mariadb: 'app_db (schema name)',
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
            <p className={cn('text-2xl font-bold', cls || 'text-foreground')}>{loading ? '–' : value}</p>
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
            {canWrite && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Add First Connection
              </button>
            )}
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
  const colors: Record<string, string> = { oracle: 'bg-[#F80000]', mssql: 'bg-[#CC2927]', mariadb: 'bg-blue-500' }
  return <span className={cn('w-2 h-2 rounded-full shrink-0', colors[type] ?? 'bg-muted-foreground')} />
}

// ─── Delete Confirmation Dialog ───────────────────────────────────────────────

function DeleteConfirm({ connection, onClose, onDeleted }: {
  connection: Connection
  onClose:    () => void
  onDeleted:  () => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [error,    setError]    = useState('')

  async function confirm() {
    setDeleting(true)
    setError('')
    try {
      await api.connections.delete(connection.id)
      onDeleted()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setDeleting(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-critical/30 bg-card shadow-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-critical/10 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-critical" />
            </div>
            <div>
              <h2 className="font-bold text-foreground">Delete Connection</h2>
              <p className="text-sm text-muted-foreground">This action cannot be undone</p>
            </div>
          </div>

          <p className="text-sm text-foreground">
            Are you sure you want to delete <strong>{connection.name}</strong>?{' '}
            All associated health snapshots and alerts will also be removed.
          </p>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-1">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors text-foreground">
              Cancel
            </button>
            <button onClick={confirm} disabled={deleting}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-critical hover:bg-critical/80 text-white font-medium transition-colors disabled:opacity-50">
              {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
              {deleting ? 'Deleting…' : 'Delete Connection'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── Add / Edit Connection Panel ─────────────────────────────────────────────

type FormState = {
  name:             string
  db_type:          'oracle' | 'mssql' | 'mariadb'
  environment:      'production' | 'uat'
  host:             string
  port:             number
  database_name:    string
  agent_name:       string
  username:         string
  password:         string
  oracle_privilege: '' | 'SYSDBA' | 'SYSOPER'
}

function ConnectionPanel({ mode, connection, onClose, onSaved }: {
  mode:        'create' | 'edit'
  connection?: Connection
  onClose:     () => void
  onSaved:     () => void
}) {
  const [form, setForm] = useState<FormState>({
    name:             connection?.name          ?? '',
    db_type:          connection?.db_type       ?? 'oracle',
    environment:      connection?.environment   ?? 'production',
    host:             connection?.host          ?? '',
    port:             connection?.port          ?? 1521,
    database_name:    connection?.database_name ?? '',
    agent_name:       connection?.agent_name    ?? '',
    username:         '',
    password:         '',
    oracle_privilege: (connection?.oracle_privilege ?? '') as '' | 'SYSDBA' | 'SYSOPER',
  })
  const [saving, setSaving]         = useState(false)
  const [error,  setError]          = useState('')
  const [testResult, setTestResult] = useState<{ ok: boolean; latency_ms: number } | null>(null)
  const [testing, setTesting]       = useState(false)

  function set(field: keyof FormState, value: string | number) {
    setError('')
    setTestResult(null)
    if (field === 'db_type') {
      setForm(f => ({ ...f, db_type: value as FormState['db_type'], port: DB_PORTS[value as string] ?? 1521 }))
    } else {
      setForm(f => ({ ...f, [field]: value }))
    }
  }

  async function testConnection() {
    if (!form.host || !form.username || !form.password) {
      setError('Host, username and password are required to test.')
      return
    }
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.connections.test({
        db_type:          form.db_type,
        host:             form.host,
        port:             form.port,
        database_name:    form.database_name || undefined,
        username:         form.username,
        password:         form.password,
        oracle_privilege: (form.db_type === 'oracle' && form.oracle_privilege) ? form.oracle_privilege : undefined,
      } as unknown as Record<string, unknown>)
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
      if (mode === 'create') {
        await api.connections.create({
          name:             form.name,
          db_type:          form.db_type,
          environment:      form.environment,
          host:             form.host,
          port:             Number(form.port),
          database_name:    form.database_name || undefined,
          agent_name:       form.agent_name,
          username:         form.username || undefined,
          password:         form.password || undefined,
          oracle_privilege: (form.db_type === 'oracle' && form.oracle_privilege) ? form.oracle_privilege : undefined,
        })
      } else {
        await api.connections.update(connection!.id, {
          name:             form.name,
          environment:      form.environment,
          host:             form.host,
          port:             Number(form.port),
          database_name:    form.database_name || undefined,
          agent_name:       form.agent_name,
          oracle_privilege: form.db_type === 'oracle' ? (form.oracle_privilege || null) : undefined,
          // Only send password update if both fields are filled
          username:         (form.username && form.password) ? form.username : undefined,
          password:         (form.username && form.password) ? form.password : undefined,
        })
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const isEdit = mode === 'edit'

  return (
    <>
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40" onClick={onClose} />
      <aside className="fixed top-0 right-0 h-full w-[480px] bg-card border-l border-border shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div>
            <h2 className="font-bold text-lg text-foreground">{isEdit ? 'Edit Connection' : 'Add Connection'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEdit ? `Editing ${connection!.name}` : 'Register a new database in ADORS'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

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
              <select className={inputCls} value={form.db_type} onChange={e => set('db_type', e.target.value)} disabled={isEdit}>
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

          {form.db_type === 'oracle' && (
            <Field label="Oracle Connection Privilege" hint="Required when connecting as SYS. Leave as Default for normal accounts.">
              <select className={inputCls} value={form.oracle_privilege} onChange={e => set('oracle_privilege', e.target.value)}>
                <option value="">Default (normal user)</option>
                <option value="SYSDBA">SYSDBA</option>
                <option value="SYSOPER">SYSOPER</option>
              </select>
            </Field>
          )}

          <Field label="Agent Name" required hint="Which bot monitors this connection (OraBot / MsBot / MarBot)">
            <input className={inputCls} placeholder="e.g. OraBot" value={form.agent_name} onChange={e => set('agent_name', e.target.value)} />
          </Field>

          <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Database Credentials</p>
            <Field label="Username" hint={isEdit ? 'Leave blank to keep existing credentials' : undefined}>
              <input
                className={inputCls}
                placeholder={isEdit ? '(unchanged)' : 'e.g. adors_monitor'}
                autoComplete="off"
                value={form.username}
                onChange={e => set('username', e.target.value)}
              />
            </Field>
            <Field label="Password">
              <input
                className={inputCls}
                type="password"
                placeholder={isEdit ? '(unchanged)' : 'Enter password'}
                autoComplete="new-password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
              />
            </Field>
            {isEdit && connection?.has_credentials && !form.username && !form.password && (
              <p className="text-[11px] text-success">✓ Credentials stored — leave blank to keep them</p>
            )}
          </div>

          {form.username && form.password && (
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

        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {(connection?.has_credentials || form.username) ? '🔒 Credentials encrypted server-side' : 'No credentials — mock adapter will be used'}
          </p>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted transition-colors text-foreground">
              Cancel
            </button>
            <button onClick={submit} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-medium transition-colors disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Connection'}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed'

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
