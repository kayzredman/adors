'use client'

import { useState } from 'react'
import { X, RefreshCw, AlertCircle, Loader2, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'

// ─── Shared types & constants ─────────────────────────────────────────────────

export type ConnectionForPanel = {
  id:               string
  name:             string
  db_type:          'oracle' | 'mssql' | 'mariadb'
  environment:      'production' | 'uat' | 'dr'
  host:             string
  port:             number
  database_name?:   string
  agent_name:       string
  has_credentials:  boolean
  oracle_privilege?: 'SYSDBA' | 'SYSOPER'
}

export type FormState = {
  name:             string
  db_type:          'oracle' | 'mssql' | 'mariadb'
  environment:      'production' | 'uat' | 'dr'
  host:             string
  port:             number
  database_name:    string
  agent_name:       string
  username:         string
  password:         string
  oracle_privilege: '' | 'SYSDBA' | 'SYSOPER'
}

export const DB_PORTS: Record<string, number> = { oracle: 1521, mssql: 1433, mariadb: 3306 }

export const DB_PLACEHOLDER: Record<string, string> = {
  oracle:  'ORCL (service name or SID)',
  mssql:   'master (default database)',
  mariadb: 'app_db (schema name)',
}

export const inputCls = 'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed'

export function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
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

// ─── ConnectionPanel ──────────────────────────────────────────────────────────

export function ConnectionPanel({
  mode,
  connection,
  defaultEnvironment = 'production',
  onClose,
  onSaved,
}: {
  mode:               'create' | 'edit'
  connection?:        ConnectionForPanel
  defaultEnvironment?: 'production' | 'uat' | 'dr'
  onClose:            () => void
  onSaved:            (id?: string) => void
}) {
  const [form, setForm] = useState<FormState>({
    name:             connection?.name          ?? '',
    db_type:          connection?.db_type       ?? 'oracle',
    environment:      connection?.environment   ?? defaultEnvironment,
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
        const res = await api.connections.create({
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
        onSaved((res.data as { id?: string })?.id)
        return
      } else {
        await api.connections.update(connection!.id, {
          name:             form.name,
          environment:      form.environment,
          host:             form.host,
          port:             Number(form.port),
          database_name:    form.database_name || undefined,
          agent_name:       form.agent_name,
          oracle_privilege: form.db_type === 'oracle' ? (form.oracle_privilege || null) : undefined,
          username:         (form.username && form.password) ? form.username : undefined,
          password:         (form.username && form.password) ? form.password : undefined,
        })
        onSaved()
      }
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
            <input className={inputCls} placeholder="e.g. UAT_ORA_01" value={form.name} onChange={e => set('name', e.target.value)} />
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
                <option value="dr">DR</option>
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

// ─── DeleteConfirm ────────────────────────────────────────────────────────────

export function DeleteConfirm({ connection, onClose, onDeleted }: {
  connection: ConnectionForPanel
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
            All associated health snapshots and sandbox runs will also be removed.
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
