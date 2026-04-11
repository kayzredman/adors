'use client'

import { useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { ShieldCheck, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MfaGateProps {
  /** Show the modal */
  open: boolean
  /** Called when user dismisses or completes — success=true means AAL2 achieved */
  onClose: (success: boolean) => void
}

/**
 * Modal that prompts the user to verify their TOTP code to step up to AAL2.
 * Use this when an API call returns `{ code: 'aal2_required' }`.
 */
export function MfaGate({ open, onClose }: MfaGateProps) {
  const { upgradeAAL } = useAuth()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    if (code.length < 6) return
    setError(null)
    setLoading(true)

    const success = await upgradeAAL(code)
    setLoading(false)

    if (success) {
      setCode('')
      setError(null)
      onClose(true)
    } else {
      setError('Invalid code — please try again')
    }
  }

  function handleDismiss() {
    setCode('')
    setError(null)
    onClose(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-2xl">
        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-lg bg-brand-500/10 flex items-center justify-center">
            <ShieldCheck className="w-4.5 h-4.5 text-brand-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Verify your identity</h2>
            <p className="text-xs text-muted-foreground">
              This action requires MFA verification
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-critical/30 bg-critical/5 px-3 py-2 text-sm text-critical">
            {error}
          </div>
        )}

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Authenticator Code
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              maxLength={6}
              autoFocus
              className="w-full px-3.5 py-3 rounded-lg border border-input bg-background text-foreground text-2xl font-mono tracking-[0.5em] text-center placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading || code.length < 6}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white font-semibold text-sm transition-colors disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <span>Verify</span>
                <ShieldCheck className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

/**
 * Hook to handle aal2_required errors from API calls.
 * Returns { mfaGateOpen, showMfaGate, onMfaResult, MfaGateModal }
 *
 * Usage:
 *   const { showMfaGate, onMfaResult, MfaGateModal } = useMfaGate()
 *
 *   async function doSensitiveAction() {
 *     try {
 *       await api.someAction()
 *     } catch (err: any) {
 *       if (err.code === 'aal2_required') {
 *         showMfaGate()
 *         return
 *       }
 *       throw err
 *     }
 *   }
 */
export function useMfaGate(onSuccess?: () => void) {
  const [open, setOpen] = useState(false)

  function showMfaGate() {
    setOpen(true)
  }

  function onMfaResult(success: boolean) {
    setOpen(false)
    if (success && onSuccess) onSuccess()
  }

  function MfaGateModal() {
    return <MfaGate open={open} onClose={onMfaResult} />
  }

  return { mfaGateOpen: open, showMfaGate, onMfaResult, MfaGateModal }
}
