'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { createClient } from '@/lib/supabase/browser'
import { api } from '@/lib/api'
import {
  User,
  Lock,
  ShieldCheck,
  ShieldOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Check,
  ChevronDown,
  Search,
  UserCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Reusable styles ─────────────────────────────────────────────────────────
const inputCls =
  'w-full px-3.5 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500'
const btnPrimary =
  'flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors disabled:opacity-60'
const btnDanger =
  'flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-critical hover:bg-critical/90 text-white font-semibold text-sm transition-colors disabled:opacity-60'
const sectionCls = 'rounded-xl border border-border bg-card p-6'

type Toast = { type: 'success' | 'error'; message: string }

interface UserEntry {
  id: string
  email: string
  full_name: string
  role: string
  onboarded: boolean
  deactivated_at: string | null
}

export default function SettingsPage() {
  const { user, role } = useAuth()
  const isAdmin = role === 'super_admin'

  const [toast, setToast] = useState<Toast | null>(null)
  const [users, setUsers] = useState<UserEntry[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // The target user being managed (null = self)
  const targetUserId = selectedUserId && selectedUserId !== user?.id ? selectedUserId : undefined
  const isSelf = !targetUserId
  const targetUser = useMemo(
    () => (targetUserId ? users.find((u) => u.id === targetUserId) : null),
    [targetUserId, users],
  )

  function showToast(t: Toast) {
    setToast(t)
    setTimeout(() => setToast(null), 4000)
  }

  // Load user list for admin
  useEffect(() => {
    if (!isAdmin) return
    setUsersLoading(true)
    api.admin
      .listUsers()
      .then((res) => setUsers(res.data))
      .catch(() => {})
      .finally(() => setUsersLoading(false))
  }, [isAdmin])

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-8 px-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin
            ? 'Manage user profiles, passwords, and authentication.'
            : 'Manage your profile, security, and authentication preferences.'}
        </p>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
            toast.type === 'success'
              ? 'border-success/30 bg-success/5 text-success'
              : 'border-critical/30 bg-critical/5 text-critical',
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {toast.message}
        </div>
      )}

      {/* ── Admin: User Picker ── */}
      {isAdmin && (
        <UserPicker
          users={users}
          loading={usersLoading}
          selectedId={selectedUserId ?? user?.id ?? ''}
          currentUserId={user?.id ?? ''}
          onSelect={setSelectedUserId}
        />
      )}

      {/* ── Managing another user banner ── */}
      {targetUser && (
        <div className="flex items-center gap-3 rounded-lg border border-brand-500/30 bg-brand-500/5 px-4 py-3">
          <UserCircle2 className="w-5 h-5 text-brand-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              Managing: {targetUser.full_name || targetUser.email}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {targetUser.email} &middot;{' '}
              {{ viewer: 'Viewer', analyst: 'Analyst', dba: 'DBA', super_admin: 'Super Admin' }[
                targetUser.role
              ] ?? targetUser.role}
            </p>
          </div>
          <button
            onClick={() => setSelectedUserId(null)}
            className="ml-auto text-xs text-brand-400 hover:text-brand-500 font-medium shrink-0"
          >
            Back to self
          </button>
        </div>
      )}

      <ProfileSection
        email={targetUser?.email ?? user?.email ?? ''}
        currentName={targetUser?.full_name ?? user?.user_metadata?.full_name ?? ''}
        targetUserId={targetUserId}
        isSelf={isSelf}
        onToast={showToast}
      />
      <PasswordSection
        targetUserId={targetUserId}
        isSelf={isSelf}
        onToast={showToast}
      />
      <TotpSection
        targetUserId={targetUserId}
        isSelf={isSelf}
        onToast={showToast}
      />
    </div>
  )
}

// ─── User Picker (admin only) ────────────────────────────────────────────────
function UserPicker({
  users,
  loading,
  selectedId,
  currentUserId,
  onSelect,
}: {
  users: UserEntry[]
  loading: boolean
  selectedId: string
  currentUserId: string
  onSelect: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) =>
        u.email.toLowerCase().includes(q) ||
        (u.full_name ?? '').toLowerCase().includes(q),
    )
  }, [users, search])

  const selectedUser = users.find((u) => u.id === selectedId)
  const displayLabel = selectedUser
    ? selectedUser.id === currentUserId
      ? `You (${selectedUser.email})`
      : selectedUser.full_name || selectedUser.email
    : 'Select a user...'

  if (loading) {
    return (
      <div className={cn(sectionCls, 'flex items-center gap-3 py-4')}>
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading users...</span>
      </div>
    )
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          sectionCls,
          'w-full flex items-center gap-3 py-3.5 cursor-pointer hover:border-brand-500/40 transition-colors',
        )}
      >
        <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center shrink-0">
          <UserCircle2 className="w-4 h-4 text-brand-400" />
        </div>
        <div className="text-left min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">Manage settings for</p>
          <p className="text-sm font-semibold text-foreground truncate">{displayLabel}</p>
        </div>
        <ChevronDown
          className={cn(
            'w-4 h-4 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="absolute z-30 top-full mt-1.5 left-0 right-0 rounded-xl border border-border bg-card shadow-lg overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users..."
                autoFocus
                className={cn(inputCls, 'pl-9 py-2 text-xs')}
              />
            </div>
          </div>

          {/* User list */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.map((u) => {
              const isYou = u.id === currentUserId
              const active = u.id === selectedId
              return (
                <button
                  key={u.id}
                  onClick={() => {
                    onSelect(u.id)
                    setOpen(false)
                    setSearch('')
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted/50 transition-colors',
                    active && 'bg-brand-500/5',
                  )}
                >
                  <div
                    className={cn(
                      'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                      active
                        ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {(u.full_name || u.email)[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">
                      {u.full_name || u.email.split('@')[0]}
                      {isYou && (
                        <span className="ml-1.5 text-[10px] font-semibold text-brand-400 uppercase">
                          You
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground uppercase font-medium shrink-0">
                    {u.role.replace('_', ' ')}
                  </span>
                </button>
              )
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">
                No users found
              </p>
            )}
          </div>
        </div>
      )}

      {/* Click-away */}
      {open && (
        <div className="fixed inset-0 z-20" onClick={() => { setOpen(false); setSearch('') }} />
      )}
    </div>
  )
}

// ─── Profile Section ─────────────────────────────────────────────────────────
function ProfileSection({
  email,
  currentName,
  targetUserId,
  isSelf,
  onToast,
}: {
  email: string
  currentName: string
  targetUserId: string | undefined
  isSelf: boolean
  onToast: (t: Toast) => void
}) {
  const [name, setName] = useState(currentName)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(currentName)
  }, [currentName])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.settings.updateProfile(name.trim(), targetUserId)
      onToast({ type: 'success', message: 'Display name updated' })
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Failed to update name' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={sectionCls}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
          <User className="w-4.5 h-4.5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Profile</h2>
          <p className="text-xs text-muted-foreground">
            {isSelf ? 'Your display name and email' : 'Edit this user\'s display name'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            disabled
            className={cn(inputCls, 'opacity-60 cursor-not-allowed')}
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            className={inputCls}
          />
        </div>

        <div className="flex justify-end">
          <button type="submit" disabled={saving || !name.trim()} className={btnPrimary}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Name'}
          </button>
        </div>
      </form>
    </section>
  )
}

// ─── Password Section ────────────────────────────────────────────────────────
function PasswordSection({
  targetUserId,
  isSelf,
  onToast,
}: {
  targetUserId: string | undefined
  isSelf: boolean
  onToast: (t: Toast) => void
}) {
  const [pw, setPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reset form when switching users
  useEffect(() => {
    setPw('')
    setConfirm('')
  }, [targetUserId])

  const mismatch = confirm.length > 0 && pw !== confirm
  const tooShort = pw.length > 0 && pw.length < 8

  async function handleChange(e: React.FormEvent) {
    e.preventDefault()
    if (pw !== confirm || pw.length < 8) return
    setSaving(true)
    try {
      await api.settings.changePassword(pw, targetUserId)
      onToast({
        type: 'success',
        message: isSelf ? 'Password updated successfully' : 'Password reset for user',
      })
      setPw('')
      setConfirm('')
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Failed to update password' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={sectionCls}>
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-warning/10 flex items-center justify-center">
          <Lock className="w-4.5 h-4.5 text-warning" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">Password</h2>
          <p className="text-xs text-muted-foreground">
            {isSelf ? 'Change your login password' : 'Reset this user\'s password'}
          </p>
        </div>
      </div>

      <form onSubmit={handleChange} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            {isSelf ? 'New Password' : 'New Password for User'}
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className={cn(inputCls, 'pr-10')}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {tooShort && (
            <p className="text-[11px] text-critical mt-1">Must be at least 8 characters</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Confirm Password
          </label>
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            className={inputCls}
          />
          {mismatch && (
            <p className="text-[11px] text-critical mt-1">Passwords do not match</p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving || mismatch || tooShort || pw.length === 0}
            className={btnPrimary}
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isSelf ? (
              'Update Password'
            ) : (
              'Reset Password'
            )}
          </button>
        </div>
      </form>
    </section>
  )
}

// ─── TOTP / MFA Section ─────────────────────────────────────────────────────
function TotpSection({
  targetUserId,
  isSelf,
  onToast,
}: {
  targetUserId: string | undefined
  isSelf: boolean
  onToast: (t: Toast) => void
}) {
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [enrolled, setEnrolled] = useState(false)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enrolledAt, setEnrolledAt] = useState<string | null>(null)

  // Enrol flow state (self only)
  const [enrolling, setEnrolling] = useState(false)
  const [qrUri, setQrUri] = useState<string | null>(null)
  const [secret, setSecret] = useState<string | null>(null)
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [copied, setCopied] = useState(false)

  // Unenrol state
  const [removing, setRemoving] = useState(false)

  useEffect(() => {
    loadMfaStatus()
    // Reset enrol UI when switching users
    setEnrolling(false)
    setQrUri(null)
    setSecret(null)
    setPendingFactorId(null)
    setVerifyCode('')
  }, [targetUserId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMfaStatus() {
    setLoading(true)
    try {
      const res = await api.settings.getMfa(targetUserId)
      setEnrolled(res.data.enrolled)
      setFactorId(res.data.factor_id)
      setEnrolledAt(res.data.created_at)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  // ── Begin TOTP enrolment (self only — uses Supabase JS SDK) ──
  async function handleEnrol() {
    setEnrolling(true)
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'ADORS Authenticator',
      })
      if (error) throw error

      setQrUri(data.totp.uri)
      setSecret(data.totp.secret)
      setPendingFactorId(data.id)
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Failed to start TOTP enrolment' })
      setEnrolling(false)
    }
  }

  // ── Verify the TOTP code to complete enrolment ──
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!pendingFactorId || verifyCode.length < 6) return
    setVerifying(true)
    try {
      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: pendingFactorId,
      })
      if (challengeErr) throw challengeErr

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: pendingFactorId,
        challengeId: challenge.id,
        code: verifyCode,
      })
      if (verifyErr) throw verifyErr

      onToast({ type: 'success', message: 'Two-factor authentication enabled' })
      setEnrolling(false)
      setQrUri(null)
      setSecret(null)
      setPendingFactorId(null)
      setVerifyCode('')
      await loadMfaStatus()
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Invalid code — try again' })
    } finally {
      setVerifying(false)
    }
  }

  // ── Remove TOTP factor ──
  async function handleRemove() {
    if (!factorId) return
    setRemoving(true)
    try {
      await api.settings.removeMfa(factorId, targetUserId)
      onToast({
        type: 'success',
        message: isSelf
          ? 'Two-factor authentication disabled'
          : 'TOTP disabled for this user',
      })
      setEnrolled(false)
      setFactorId(null)
      setEnrolledAt(null)
    } catch (err: any) {
      onToast({ type: 'error', message: err.message ?? 'Failed to remove TOTP' })
    } finally {
      setRemoving(false)
    }
  }

  function copySecret() {
    if (!secret) return
    navigator.clipboard.writeText(secret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <section className={sectionCls}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    )
  }

  return (
    <section className={sectionCls}>
      <div className="flex items-center gap-3 mb-5">
        <div
          className={cn(
            'w-9 h-9 rounded-lg flex items-center justify-center',
            enrolled ? 'bg-success/10' : 'bg-muted',
          )}
        >
          {enrolled ? (
            <ShieldCheck className="w-4.5 h-4.5 text-success" />
          ) : (
            <ShieldOff className="w-4.5 h-4.5 text-muted-foreground" />
          )}
        </div>
        <div>
          <h2 className="text-base font-semibold text-foreground">
            Two-Factor Authentication (TOTP)
          </h2>
          <p className="text-xs text-muted-foreground">
            {enrolled
              ? isSelf
                ? 'Your account is protected with an authenticator app'
                : 'This user has TOTP enabled'
              : isSelf
                ? 'Add an extra layer of security to your account'
                : 'This user does not have TOTP enabled'}
          </p>
        </div>
      </div>

      {/* ── Already enrolled ── */}
      {enrolled && !enrolling && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="w-4 h-4" />
            <span>
              TOTP enabled
              {enrolledAt && (
                <span className="text-muted-foreground ml-1">
                  since {new Date(enrolledAt).toLocaleDateString()}
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-end">
            <button onClick={handleRemove} disabled={removing} className={btnDanger}>
              {removing ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable TOTP'}
            </button>
          </div>
        </div>
      )}

      {/* ── Not enrolled ── */}
      {!enrolled && !enrolling && (
        <div>
          {isSelf ? (
            <div className="flex justify-end">
              <button onClick={handleEnrol} className={btnPrimary}>
                Enable TOTP
              </button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              TOTP can only be enrolled by the user themselves from their own settings page.
            </p>
          )}
        </div>
      )}

      {/* ── Enrolment flow — QR code + verify (self only) ── */}
      {enrolling && qrUri && isSelf && (
        <div className="space-y-5">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground mb-3">
              1. Scan this QR code with your authenticator app
            </p>
            <div className="flex justify-center mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUri)}`}
                alt="TOTP QR Code"
                width={200}
                height={200}
                className="rounded-lg"
              />
            </div>
            {secret && (
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  Or enter manually:{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded text-foreground font-mono text-xs">
                    {secret}
                  </code>
                </p>
                <button
                  onClick={copySecret}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                2. Enter the 6-digit code from your app
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                autoFocus
                className={cn(
                  inputCls,
                  'text-center text-xl font-mono tracking-[0.4em] max-w-xs',
                )}
              />
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => {
                  setEnrolling(false)
                  setQrUri(null)
                  setSecret(null)
                  setPendingFactorId(null)
                  setVerifyCode('')
                }}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={verifying || verifyCode.length < 6}
                className={btnPrimary}
              >
                {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify & Enable'}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  )
}
