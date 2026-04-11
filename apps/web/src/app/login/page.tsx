'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { AdorsLogo } from '@/components/brand/AdorsLogo'
import { Eye, EyeOff, Loader2, Shield, Zap, Bot, ArrowRight, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Feature pills shown on the branded panel ────────────────────────────────
const FEATURES = [
  { icon: Shield, label: 'Role-based access control' },
  { icon: Zap,    label: 'Real-time health monitoring' },
  { icon: Bot,    label: 'AI-assisted DB operations'  },
]

type Mode = 'login' | 'mfa'

export default function LoginPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [mode, setMode] = useState<Mode>('login')

  // Sign-in state
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  // MFA state
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null)
  const [mfaCode,     setMfaCode]     = useState('')

  // ─── Sign in ──────────────────────────────────────────────────────────────
  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Check for an enrolled + verified TOTP factor
    const { data: factorsData } = await supabase.auth.mfa.listFactors()
    const totpFactor = factorsData?.totp?.find(f => f.status === 'verified')

    if (totpFactor) {
      setMfaFactorId(totpFactor.id)
      setMode('mfa')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  // ─── MFA challenge verify ─────────────────────────────────────────────────
  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!mfaFactorId) return
    setError(null)
    setLoading(true)

    const { data: challengeData, error: challengeErr } =
      await supabase.auth.mfa.challenge({ factorId: mfaFactorId })

    if (challengeErr || !challengeData) {
      setError(challengeErr?.message ?? 'Failed to initiate challenge')
      setLoading(false)
      return
    }

    const { error: verifyErr } = await supabase.auth.mfa.verify({
      factorId:    mfaFactorId,
      challengeId: challengeData.id,
      code:        mfaCode,
    })

    if (verifyErr) {
      setError('Invalid code. Please try again.')
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  // ─── Layout helpers ───────────────────────────────────────────────────────
  const isMfa = mode === 'mfa'

  return (
    <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#0f172a_0%,_#020617_60%)] px-4">
      {/*
        ── Outer card: fixed 900px wide, two halves side by side
        ── The branded (blue) panel order flips between modes via CSS order
      */}
      <div className="relative w-full max-w-[900px] min-h-[540px] rounded-2xl overflow-hidden shadow-2xl flex">

        {/* ── Branded / blue panel ─────────────────────────────────────── */}
        <div
          className={cn(
            'relative flex flex-col justify-center items-center px-10 py-12 text-white z-10 overflow-hidden',
            'transition-all duration-700 ease-in-out w-1/2 shrink-0',
            isMfa ? 'order-2 rounded-r-2xl' : 'order-1 rounded-l-2xl',
          )}
          style={{ background: 'linear-gradient(135deg, #1a3a6b 0%, #1565C0 40%, #0D47A1 70%, #0a1a3d 100%)' }}
        >
          {/* Decorative glow blobs */}
          <div className="absolute top-[-60px] left-[-60px] w-48 h-48 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />
          <div className="absolute bottom-[-40px] right-[-40px] w-40 h-40 rounded-full bg-cyan-400/15 blur-2xl pointer-events-none" />
          <div className="absolute top-[40%] right-[-20px] w-24 h-24 rounded-full bg-white/5 blur-2xl pointer-events-none" />

          <AdorsLogo size={72} darkBg className="mb-5" />
          <h1 className="text-3xl font-bold tracking-tight mb-1">ADORS</h1>
          <p className="text-xs text-white/60 uppercase tracking-[0.2em] mb-1">Mission Control</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-8">Agentic Database Observability</p>

          {!isMfa ? (
            // Login mode — feature pills
            <div className="space-y-3 w-full max-w-xs">
              {FEATURES.map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-3 bg-white/10 rounded-lg px-4 py-2.5">
                  <Icon className="w-4 h-4 shrink-0 text-white/80" />
                  <span className="text-sm text-white/90">{label}</span>
                </div>
              ))}
            </div>
          ) : (
            // MFA mode — explanation
            <div className="text-center space-y-3 max-w-xs">
              <ShieldCheck className="w-10 h-10 text-white/80 mx-auto" />
              <p className="text-lg font-semibold">Two-factor authentication</p>
              <p className="text-sm text-white/75 leading-relaxed">
                Open your authenticator app and enter the 6-digit code for ADORS.
              </p>
            </div>
          )}
        </div>

        {/* ── Form panel ────────────────────────────────────────────────── */}
        <div
          className={cn(
            'flex flex-col justify-center px-10 py-12 bg-card w-1/2 shrink-0',
            'transition-all duration-700 ease-in-out',
            isMfa ? 'order-1 rounded-l-2xl' : 'order-2 rounded-r-2xl',
          )}
        >
          {!isMfa ? (
            // ── Sign In form
            <div className="w-full max-w-sm mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-1">Sign In</h2>
              <p className="text-sm text-muted-foreground mb-7">
                Enter your credentials to access Mission Control.
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">
                  {error}
                </div>
              )}

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5" htmlFor="email">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><span>SIGN IN</span><ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              {/* Invite-only notice */}
              <div className="mt-6 rounded-lg border border-border bg-muted/40 px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  <span className="text-foreground">New to ADORS?</span> Access is by invitation only.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Ask your system administrator to send you an invite link.
                </p>
              </div>
            </div>
          ) : (
            // ── MFA challenge form
            <div className="w-full max-w-sm mx-auto">
              <h2 className="text-2xl font-bold text-foreground mb-1">Verify your identity</h2>
              <p className="text-sm text-muted-foreground mb-7">
                Enter the 6-digit code from your authenticator app.
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-critical/30 bg-critical/5 px-4 py-3 text-sm text-critical">
                  {error}
                </div>
              )}

              <form onSubmit={handleMfaVerify} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Authenticator Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    autoComplete="one-time-code"
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-3.5 py-3 rounded-lg border border-input bg-background text-foreground text-2xl font-mono tracking-[0.5em] text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || mfaCode.length < 6}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors disabled:opacity-60"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <><span>VERIFY</span><ShieldCheck className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => { setMode('login'); setMfaCode(''); setError(null) }}
                className="mt-4 w-full text-xs text-muted-foreground hover:text-foreground text-center"
              >
                ← Back to sign in
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
