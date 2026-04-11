'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Users, Plus, Shield, Loader2, AlertCircle, Mail, UserX,
  ChevronDown, Pencil, Check, X as XIcon, RefreshCw, RotateCcw, Copy, Link,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'

type UserProfile = {
  id:             string
  email:          string
  full_name:      string
  role:           string
  onboarded:      boolean
  deactivated_at: string | null
  created_at:     string
}

const ROLES = ['viewer', 'analyst', 'dba', 'super_admin'] as const
type Role = typeof ROLES[number]

const ROLE_LABELS: Record<Role, string> = {
  viewer:      'Viewer',
  analyst:     'Analyst',
  dba:         'DBA',
  super_admin: 'Super Admin',
}

const ROLE_COLORS: Record<Role, string> = {
  viewer:      'text-muted-foreground bg-muted border-border',
  analyst:     'text-brand-400 bg-brand-500/10 border-brand-500/30',
  dba:         'text-warning bg-warning/10 border-warning/30',
  super_admin: 'text-critical bg-critical/10 border-critical/30',
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000)
    return () => clearTimeout(t)
  }, [onDone])
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-border bg-card shadow-xl px-4 py-3 text-sm text-foreground animate-in slide-in-from-bottom-4">
      <Check className="w-4 h-4 text-success shrink-0" />
      {message}
    </div>
  )
}

// ── Copy-link modal ──────────────────────────────────────────────────────────
function CopyLinkModal({ link, onClose }: { link: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
            <Link className="w-5 h-5 text-warning" />
          </div>
          <div>
            <h3 className="font-bold text-foreground">Email not sent — copy this invite link</h3>
            <p className="text-xs text-muted-foreground">
              No verified sender domain is configured. Share this link directly with the user.
            </p>
          </div>
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground text-lg leading-none">×</button>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
          <p className="flex-1 text-xs text-muted-foreground truncate font-mono">{link}</p>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium transition-colors shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          To enable email sending, set <code className="bg-muted px-1 py-0.5 rounded">RESEND_FROM</code> in your API environment to a verified Resend sender domain.
        </p>
      </div>
    </div>
  )
}
function TableHead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-border bg-muted/30">
        {cols.map(h => (
          <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {h}
          </th>
        ))}
      </tr>
    </thead>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users,        setUsers]        = useState<UserProfile[]>([])
  const [loading,      setLoading]      = useState(true)
  const [fetchError,   setFetchError]   = useState<string | null>(null)
  const [toastMsg,     setToastMsg]     = useState<string | null>(null)
  const [showInvite,   setShowInvite]   = useState(false)
  const [busyId,       setBusyId]       = useState<string | null>(null)
  const [copyLink,     setCopyLink]     = useState<string | null>(null)

  // Inline name edit
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Invite form
  const [inviteEmail,   setInviteEmail]   = useState('')
  const [inviteRole,    setInviteRole]    = useState<Role>('analyst')
  const [inviteName,    setInviteName]    = useState('')
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError,   setInviteError]   = useState<string | null>(null)
  const [inviteSuccess, setInviteSuccess] = useState(false)

  const toast = (msg: string) => setToastMsg(msg)

  const load = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const result = await api.admin.listUsers()
      setUsers(result.data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + poll every 30 s so pending → active transitions show automatically
  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  // Focus input when edit starts
  useEffect(() => {
    if (editingId) nameInputRef.current?.focus()
  }, [editingId])

  // ── Invite ──────────────────────────────────────────────────────────────────
  async function handleInvite(e: React.FormEvent) {
    e.preventDefault()
    setInviteError(null)
    setInviteLoading(true)
    try {
      const result = await api.admin.invite({ email: inviteEmail, role: inviteRole, full_name: inviteName || undefined })
      setInviteSuccess(true)
      setInviteEmail('')
      setInviteName('')
      if (result.inviteLink) {
        setTimeout(() => { setShowInvite(false); setInviteSuccess(false); load(); setCopyLink(result.inviteLink!) }, 400)
      } else {
        setTimeout(() => { setShowInvite(false); setInviteSuccess(false); load() }, 1500)
      }
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setInviteLoading(false)
    }
  }

  // ── Role change ─────────────────────────────────────────────────────────────
  async function handleRoleChange(userId: string, role: string) {
    setBusyId(userId)
    try {
      await api.admin.updateRole(userId, role)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
      toast('Role updated')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update role')
    } finally {
      setBusyId(null)
    }
  }

  // ── Inline name edit ────────────────────────────────────────────────────────
  function startEdit(u: UserProfile) {
    setEditingId(u.id)
    setEditingName(u.full_name || '')
  }

  async function commitEdit(userId: string) {
    const trimmed = editingName.trim()
    setEditingId(null)
    if (!trimmed) return
    setBusyId(userId)
    try {
      await api.admin.updateName(userId, trimmed)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, full_name: trimmed } : u))
      toast('Name updated')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update name')
    } finally {
      setBusyId(null)
    }
  }

  // ── Resend invite ───────────────────────────────────────────────────────────
  async function handleReinvite(userId: string) {
    setBusyId(userId)
    try {
      const result = await api.admin.reinvite(userId)
      if (result.inviteLink) {
        setCopyLink(result.inviteLink)
      } else {
        toast('Invite resent')
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to resend invite')
    } finally {
      setBusyId(null)
    }
  }

  // ── Deactivate ──────────────────────────────────────────────────────────────
  async function handleDeactivate(userId: string) {
    if (!confirm('Deactivate this user? They will lose access immediately.')) return
    setBusyId(userId)
    try {
      await api.admin.deactivate(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, deactivated_at: new Date().toISOString() } : u))
      toast('User deactivated')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to deactivate user')
    } finally {
      setBusyId(null)
    }
  }

  // ── Reactivate ──────────────────────────────────────────────────────────────
  async function handleReactivate(userId: string) {
    setBusyId(userId)
    try {
      await api.admin.reactivate(userId)
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, deactivated_at: null } : u))
      toast('User reactivated')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to reactivate user')
    } finally {
      setBusyId(null)
    }
  }

  const active      = users.filter(u => !u.deactivated_at)
  const deactivated = users.filter(u => u.deactivated_at)
  const pending     = active.filter(u => !u.onboarded)

  return (
    <div className="p-6 space-y-6">
      {/* Toast */}
      {toastMsg && <Toast message={toastMsg} onDone={() => setToastMsg(null)} />}

      {/* Copy-link modal (when Resend is not configured) */}
      {copyLink && <CopyLinkModal link={copyLink} onClose={() => setCopyLink(null)} />}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Users className="w-6 h-6 text-brand-400" />
            User Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Invite team members, manage roles, and control access
          </p>
        </div>
        <button
          onClick={() => {
            setShowInvite(true)
            setInviteError(null)
            setInviteSuccess(false)
            setInviteEmail('')
            setInviteName('')
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Invite User
        </button>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
          title="Refresh"
        >
          <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Users',    value: active.length,                                                              cls: '' },
          { label: 'Pending Setup',  value: pending.length,                                                             cls: 'text-warning' },
          { label: 'Admins',         value: active.filter(u => u.role === 'super_admin' || u.role === 'dba').length,    cls: 'text-critical' },
          { label: 'Deactivated',    value: deactivated.length,                                                         cls: 'text-muted-foreground' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground mb-1">{label}</p>
            <p className={cn('text-2xl font-bold', cls || 'text-foreground')}>{loading ? '–' : value}</p>
          </div>
        ))}
      </div>

      {fetchError && (
        <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {fetchError}
          <button onClick={load} className="ml-auto underline text-xs">Retry</button>
        </div>
      )}

      {/* Active users table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {loading ? (
          <div className="p-10 flex flex-col items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="w-6 h-6 animate-spin" />
            Loading users…
          </div>
        ) : (
          <table className="w-full text-sm">
            <TableHead cols={['User', 'Role', 'Status', 'Invited', '']} />
            <tbody className="divide-y divide-border">
              {active.map(u => {
                const isBusy    = busyId === u.id
                const isEditing = editingId === u.id
                return (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors group">
                    {/* User cell */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold shrink-0">
                          {(u.full_name || u.email).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                ref={nameInputRef}
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') commitEdit(u.id)
                                  if (e.key === 'Escape') setEditingId(null)
                                }}
                                className="w-36 px-2 py-0.5 rounded border border-brand-500 bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-brand-500"
                              />
                              <button onClick={() => commitEdit(u.id)} className="p-1 text-success hover:bg-success/10 rounded" title="Save">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingId(null)} className="p-1 text-muted-foreground hover:bg-muted rounded" title="Cancel">
                                <XIcon className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-foreground truncate">
                                {u.full_name || <span className="text-muted-foreground italic">No name</span>}
                              </p>
                              {u.id !== me?.id && (
                                <button
                                  onClick={() => startEdit(u)}
                                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground transition-all"
                                  title="Edit name"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                        </div>
                        {u.id === me?.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-semibold shrink-0">You</span>
                        )}
                      </div>
                    </td>

                    {/* Role cell */}
                    <td className="px-5 py-3.5">
                      {u.id === me?.id ? (
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full border', ROLE_COLORS[u.role as Role])}>
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                      ) : (
                        <div className="relative inline-block">
                          <select
                            value={u.role}
                            disabled={isBusy}
                            onChange={e => handleRoleChange(u.id, e.target.value)}
                            className={cn(
                              'text-xs font-semibold px-2 py-0.5 pr-6 rounded-full border appearance-none cursor-pointer bg-transparent focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50',
                              ROLE_COLORS[u.role as Role],
                            )}
                          >
                            {ROLES.map(r => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none" />
                        </div>
                      )}
                    </td>

                    {/* Status cell */}
                    <td className="px-5 py-3.5">
                      {u.onboarded ? (
                        <span className="flex items-center gap-1.5 text-xs text-success font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-success" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-xs text-warning font-medium">
                          <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" /> Invite pending
                        </span>
                      )}
                    </td>

                    {/* Invited date */}
                    <td className="px-5 py-3.5 text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      {u.id !== me?.id && (
                        <div className="flex items-center gap-1">
                          {isBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              {!u.onboarded && (
                                <button
                                  onClick={() => handleReinvite(u.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:text-brand-400 hover:bg-brand-500/10 transition-all"
                                  title="Resend invite"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeactivate(u.id)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 rounded text-muted-foreground hover:text-critical hover:bg-critical/10 transition-all"
                                title="Deactivate user"
                              >
                                <UserX className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
              {active.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No active users</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Deactivated users section */}
      {!loading && deactivated.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Deactivated Users</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden opacity-70">
            <table className="w-full text-sm">
              <TableHead cols={['User', 'Role', 'Deactivated', '']} />
              <tbody className="divide-y divide-border">
                {deactivated.map(u => {
                  const isBusy = busyId === u.id
                  return (
                    <tr key={u.id} className="hover:bg-muted/20 transition-colors group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground text-xs font-bold shrink-0">
                            {(u.full_name || u.email).slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-muted-foreground line-through">{u.full_name || u.email}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full border text-muted-foreground bg-muted border-border">
                          {ROLE_LABELS[u.role as Role] ?? u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-muted-foreground">
                        {u.deactivated_at ? new Date(u.deactivated_at).toLocaleDateString() : '–'}
                      </td>
                      <td className="px-5 py-3.5">
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <button
                            onClick={() => handleReactivate(u.id)}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-success hover:bg-success/10 transition-all"
                            title="Reactivate user"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-brand-500/15 flex items-center justify-center">
                <Mail className="w-5 h-5 text-brand-400" />
              </div>
              <div>
                <h3 className="font-bold text-foreground">Invite a team member</h3>
                <p className="text-xs text-muted-foreground">They'll receive a magic-link email</p>
              </div>
              <button
                onClick={() => { setShowInvite(false); setInviteError(null); setInviteSuccess(false) }}
                className="ml-auto text-muted-foreground hover:text-foreground text-lg leading-none"
              >
                ×
              </button>
            </div>

            {inviteSuccess ? (
              <div className="py-8 text-center space-y-2">
                <Shield className="w-10 h-10 text-success mx-auto" />
                <p className="font-semibold text-foreground">Invite sent!</p>
                <p className="text-sm text-muted-foreground">They'll get an email with a link to set up their account.</p>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                {inviteError && (
                  <div className="rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
                    {inviteError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Email Address *</label>
                  <input
                    type="email" required value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="user@company.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Full Name (optional)</label>
                  <input
                    type="text" value={inviteName}
                    onChange={e => setInviteName(e.target.value)}
                    placeholder="Jane Doe"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Role</label>
                  <select
                    value={inviteRole}
                    onChange={e => setInviteRole(e.target.value as Role)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {inviteRole === 'viewer'      && 'Read-only access to dashboards and alerts'}
                    {inviteRole === 'analyst'     && 'Can view metrics, acknowledge alerts, run scripts in UAT'}
                    {inviteRole === 'dba'         && 'Full access — connections, scripts, sandbox, health scans'}
                    {inviteRole === 'super_admin' && 'Everything including user management and system config'}
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button type="button" onClick={() => setShowInvite(false)}
                    className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={inviteLoading}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-60">
                    {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                    Send Invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
