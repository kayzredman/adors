'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { AdorsLogo } from '@/components/brand/AdorsLogo'
import { Eye, EyeOff, Loader2, CheckCircle2, ArrowRight, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Password strength ─────────────────────────────────────────────────────────
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: '', color: '' }
  let score = 0
  if (pw.length >= 8)  score++
  if (pw.length >= 12) score++
  if (/[A-Z]/.test(pw)) score++
  if (/[0-9]/.test(pw)) score++
  if (/[^A-Za-z0-9]/.test(pw)) score++
  if (score <= 1) return { score, label: 'Weak',   color: 'bg-critical' }
  if (score <= 2) return { score, label: 'Fair',   color: 'bg-warning' }
  if (score <= 3) return { score, label: 'Good',   color: 'bg-brand-400' }
  return               { score, label: 'Strong', color: 'bg-success' }
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#0f172a_0%,_#020617_60%)] px-4">
      <div className="w-full max-w-[900px] min-h-[520px] rounded-2xl overflow-hidden shadow-2xl flex animate-pulse">
        <div className="w-1/2 shrink-0 rounded-l-2xl bg-blue-900/40" />
        <div className="flex-1 bg-card rounded-r-2xl p-10 space-y-5">
          <div className="h-5 w-40 bg-muted rounded" />
          <div className="h-3 w-56 bg-muted/60 rounded" />
          <div className="h-10 bg-muted/40 rounded-lg mt-6" />
          <div className="h-10 bg-muted/40 rounded-lg" />
          <div className="h-10 bg-muted/40 rounded-lg" />
          <div className="h-11 bg-brand-500/20 rounded-lg mt-2" />
        </div>
      </div>
    </div>
  )
}

export default function OnboardingProfilePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [fullName,     setFullName]     = useState('')
  const [password,     setPassword]     = useState('')
  const [confirmPw,    setConfirmPw]    = useState('')
  const [showPw,       setShowPw]       = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [success,      setSuccess]      = useState(false)
  const [email,        setEmail]        = useState<string | null>(null)
  const [ready,        setReady]        = useState(false)
  const [tokenTimeout, setTokenTimeout] = useState(false)

  useEffect(() => {
    const hash   = window.location.hash
    const params = new URLSearchParams(hash.slice(1))
    const type         = params.get('type')
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token') ?? ''
    const hasInviteToken = (type === 'invite' || type === 'recovery') && !!accessToken

    if (hasInviteToken) {
      // Exchange the hash tokens directly — avoids onAuthStateChange race condition
      // where @supabase/ssr may fire INITIAL_SESSION instead of SIGNED_IN.
      supabase.auth.setSession({ access_token: accessToken!, refresh_token: refreshToken })
        .then(({ data, error }) => {
          if (error || !data.session?.user) {
            setTokenTimeout(true)
            return
          }
          const user = data.session.user
          setEmail(user.email ?? null)
          const meta = user.user_metadata
          if (meta?.full_name) setFullName(meta.full_name as string)
          // Remove hash from URL so tokens aren't re-processed on refresh
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
          setReady(true)
        })
    } else {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session?.user) {
          setEmail(data.session.user.email ?? null)
          const meta = data.session.user.user_metadata
          if (meta?.full_name) setFullName(meta.full_name as string)
          setReady(true)
        } else {
          router.replace('/login')
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8)    { setError('Password must be at least 8 characters'); return }
    if (password !== confirmPw) { setError('Passwords do not match'); return }

    setLoading(true)

    // 1. Set the password + update GoTrue user metadata
    const { error: pwErr } = await supabase.auth.updateUser({
      password,
      data: { full_name: fullName },
    })
    if (pwErr) { setError(pwErr.message); setLoading(false); return }

    // 2. Get the refreshed session (updateUser invalidates the old JWT)
    const { data: { session: freshSession } } = await supabase.auth.getSession()
    const freshToken = freshSession?.access_token

    // 3. Mark onboarded in user_profiles
    if (freshToken) {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'
        const profileRes = await fetch(`${API_URL}/api/me`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${freshToken}`,
          },
          body: JSON.stringify({ full_name: fullName }),
        })
        // If MFA is required for their role, redirect to MFA setup
        if (profileRes.ok) {
          const profileData = await profileRes.json().catch(() => null)
          const role = profileData?.data?.role ?? ''
          const mfaRoles = (process.env.NEXT_PUBLIC_MFA_REQUIRED_ROLES ?? '').split(',').map(r => r.trim()).filter(Boolean)
          if (mfaRoles.includes(role)) {
            setSuccess(true)
            setTimeout(() => router.push('/onboarding/mfa'), 1000)
            return
          }
        }
      } catch {
        // Non-fatal
      }
    }

    setSuccess(true)
    setTimeout(() => { router.push('/'); router.refresh() }, 1800)
  }

  const strength = getStrength(password)

  if (!ready) {
    if (tokenTimeout) return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#0f172a_0%,_#020617_60%)] px-4">
        <div className="text-center space-y-3">
          <p className="text-white font-semibold">Invite link expired or already used.</p>
          <p className="text-white/50 text-sm">Ask your administrator to send a new invite.</p>
          <button onClick={() => router.replace('/login')} className="mt-4 text-sm text-brand-400 hover:text-brand-300 underline">
            Back to sign in
          </button>
        </div>
      </div>
    )
    return <Skeleton />
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#0f172a_0%,_#020617_60%)] px-4">
      <div className="w-full max-w-[900px] min-h-[520px] rounded-2xl overflow-hidden shadow-2xl flex">

        {/* ── Branded panel ── */}
        <div
          className="relative flex flex-col justify-center items-center px-10 py-12 text-white w-1/2 shrink-0 rounded-l-2xl"
          style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #1565C0 40%, #0D47A1 70%, #0a1a3d 100%)' }}
        >
          <div className="absolute top-[-60px] left-[-60px] w-48 h-48 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-40px] right-[-40px] w-40 h-40 rounded-full bg-cyan-400/15 blur-2xl pointer-events-none" />

          <AdorsLogo size={72} darkBg className="mb-5" />
          <h1 className="text-3xl font-bold tracking-tight mb-1">Welcome</h1>
          <p className="text-xs text-white/60 uppercase tracking-[0.2em] mb-1">Mission Control</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-8">Agentic Database Observability</p>

          <div className="w-full max-w-xs space-y-2 text-sm text-white/70">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>Invite-only access</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>Role-based permissions</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>Set your password securely</span>
            </div>
          </div>
        </div>

        {/* ── Form panel ── */}
        <div className="flex-1 bg-card flex flex-col justify-center px-10 py-12 rounded-r-2xl">

          {success ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-success" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">You're all set{fullName ? `, ${fullName.split(' ')[0]}` : ''}!</p>
                <p className="text-sm text-muted-foreground mt-1">Taking you to Mission Control…</p>
              </div>
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mt-2" />
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-foreground">Set your password</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  You've been invited as{' '}
                  {fullName && <span className="text-foreground font-medium">{fullName} · </span>}
                  <span className="text-brand-400 font-medium">{email}</span>
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="text-sm text-critical bg-critical/10 border border-critical/20 rounded-lg px-4 py-3">
                    {error}
                  </div>
                )}

                {/* Password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">New password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Min. 8 characters"
                      autoFocus
                      className={cn(
                        'w-full px-3 py-2.5 pr-10 rounded-lg border bg-background text-foreground text-sm',
                        'border-border focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
                        'placeholder:text-muted-foreground',
                      )}
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {/* Strength meter */}
                  {password && (
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex gap-1 flex-1">
                        {[1,2,3,4,5].map(i => (
                          <div key={i} className={cn(
                            'h-1 flex-1 rounded-full transition-all',
                            i <= strength.score ? strength.color : 'bg-muted',
                          )} />
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground w-10 text-right">{strength.label}</span>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Confirm password</label>
                  <div className="relative">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Repeat your password"
                      className={cn(
                        'w-full px-3 py-2.5 pr-10 rounded-lg border bg-background text-foreground text-sm',
                        'border-border focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
                        'placeholder:text-muted-foreground',
                        confirmPw && confirmPw !== password && 'border-critical/50 focus:ring-critical/30',
                        confirmPw && confirmPw === password && 'border-success/50 focus:ring-success/30',
                      )}
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPw && confirmPw !== password && (
                    <p className="text-[11px] text-critical mt-1">Passwords don't match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading || (!!confirmPw && confirmPw !== password)}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold mt-2',
                    'bg-brand-600 hover:bg-brand-500 text-white transition-colors',
                    'disabled:opacity-60 disabled:cursor-not-allowed',
                  )}
                >
                  {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up…</>
                    : <><ArrowRight className="w-4 h-4" /> Enter Mission Control</>
                  }
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
