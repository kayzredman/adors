'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/browser'
import { AdorsLogo } from '@/components/brand/AdorsLogo'
import { Loader2, ShieldCheck, CheckCircle2, AlertCircle, ArrowRight, Smartphone } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function MFASetupPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [step,      setStep]      = useState<'loading' | 'setup' | 'verify' | 'done'>('loading')
  const [qrUrl,     setQrUrl]     = useState<string | null>(null)
  const [secret,    setSecret]    = useState<string | null>(null)
  const [factorId,  setFactorId]  = useState<string | null>(null)
  const [code,      setCode]      = useState('')
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const codeInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.replace('/login'); return }

      // Check if already enrolled
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const verified = factors?.totp?.find(f => f.status === 'verified')
      if (verified) { router.replace('/'); return }

      // Enrol a new TOTP factor
      const { data, error: enrollErr } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'ADORS Authenticator' })
      if (enrollErr || !data) {
        setError(enrollErr?.message ?? 'Failed to start MFA setup')
        setStep('setup')
        return
      }
      setQrUrl(data.totp.qr_code)
      setSecret(data.totp.secret)
      setFactorId(data.id)
      setStep('setup')
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus code input when we move to verify step
  useEffect(() => {
    if (step === 'verify') codeInputRef.current?.focus()
  }, [step])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (!factorId || code.length !== 6) return
    setError(null)
    setLoading(true)

    try {
      // Create a challenge then verify
      const { data: challengeData, error: challengeErr } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeErr) throw challengeErr

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code,
      })
      if (verifyErr) throw verifyErr

      setStep('done')
      setTimeout(() => { router.push('/'); router.refresh() }, 1800)
    } catch (err: any) {
      setError(err.message ?? 'Invalid code — please try again')
      setCode('')
      codeInputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  async function handleSkip() {
    // Unenroll the pending (unverified) factor if one was created
    if (factorId) {
      await supabase.auth.mfa.unenroll({ factorId }).catch(() => {})
    }
    router.push('/')
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top_left,_#0f172a_0%,_#020617_60%)]">
        <Loader2 className="w-8 h-8 text-brand-400 animate-spin" />
      </div>
    )
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
          <h1 className="text-3xl font-bold tracking-tight mb-1">Secure</h1>
          <p className="text-xs text-white/60 uppercase tracking-[0.2em] mb-1">Mission Control</p>
          <p className="text-[10px] text-white/40 uppercase tracking-widest mb-8">Two-Factor Authentication</p>

          <div className="w-full max-w-xs space-y-3 text-sm text-white/70">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-cyan-300 shrink-0" />
              <span>Use any authenticator app</span>
            </div>
            <div className="flex items-center gap-2 text-white/50 text-xs mt-1 pl-6">
              Google Authenticator, Authy, 1Password, Bitwarden…
            </div>
          </div>
        </div>

        {/* ── Content panel ── */}
        <div className="flex-1 bg-card flex flex-col justify-center px-10 py-12 rounded-r-2xl">

          {step === 'done' ? (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 className="w-9 h-9 text-success" />
              </div>
              <div>
                <p className="text-lg font-semibold text-foreground">MFA enabled!</p>
                <p className="text-sm text-muted-foreground mt-1">Your account is now secured with two-factor authentication.</p>
              </div>
              <Loader2 className="w-5 h-5 text-muted-foreground animate-spin mt-2" />
            </div>

          ) : step === 'setup' ? (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-brand-400" />
                  Set up two-factor auth
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Scan the QR code with your authenticator app, then confirm a code.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-critical bg-critical/10 border border-critical/20 rounded-lg px-4 py-3 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              {qrUrl && (
                <div className="flex flex-col items-center gap-4 mb-5">
                  <div className="p-3 rounded-xl border border-border bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrUrl} alt="TOTP QR code" width={160} height={160} />
                  </div>
                  {secret && (
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground mb-1">Or enter this key manually:</p>
                      <code className="text-xs font-mono bg-muted px-2 py-1 rounded text-foreground tracking-widest">
                        {secret.match(/.{1,4}/g)?.join(' ')}
                      </code>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleSkip}
                  className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
                <button
                  onClick={() => setStep('verify')}
                  disabled={!factorId}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                >
                  <ArrowRight className="w-4 h-4" />
                  I've scanned it
                </button>
              </div>
            </>

          ) : (
            <>
              <div className="mb-5">
                <h2 className="text-xl font-semibold text-foreground">Confirm your authenticator</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the 6-digit code from your authenticator app to complete setup.
                </p>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-critical bg-critical/10 border border-critical/20 rounded-lg px-4 py-3 mb-4">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleVerify} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Verification code</label>
                  <input
                    ref={codeInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000 000"
                    className={cn(
                      'w-full px-4 py-3 rounded-lg border bg-background text-foreground text-xl font-mono text-center tracking-[0.4em]',
                      'border-border focus:outline-none focus:ring-2 focus:ring-brand-500/50 focus:border-brand-500',
                      'placeholder:text-muted-foreground placeholder:tracking-normal placeholder:text-base',
                    )}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => { setStep('setup'); setCode(''); setError(null) }}
                    className="flex-1 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={loading || code.length !== 6}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors disabled:opacity-50"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify & Enable
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
