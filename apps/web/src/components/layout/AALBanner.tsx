'use client'

import { useState } from 'react'
import { useAuth } from '@/components/providers/AuthProvider'
import { MfaGate } from '@/components/ui/MfaGate'
import { ShieldAlert } from 'lucide-react'

/**
 * Shows a persistent warning banner when the user has TOTP enrolled
 * but the current session is only aal1 (hasn't verified yet this session).
 * Provides a one-click step-up to aal2.
 */
export function AALBanner() {
  const { needsAAL2 } = useAuth()
  const [showGate, setShowGate] = useState(false)

  if (!needsAAL2) return null

  return (
    <>
      <div className="flex items-center gap-3 bg-warning/10 border-b border-warning/20 px-4 py-2.5 text-sm">
        <ShieldAlert className="w-4 h-4 text-warning shrink-0" />
        <span className="text-warning">
          Your session hasn't been MFA-verified. Some actions may be restricted.
        </span>
        <button
          onClick={() => setShowGate(true)}
          className="ml-auto text-xs font-semibold text-warning hover:text-warning/80 underline underline-offset-2 shrink-0"
        >
          Verify now
        </button>
      </div>
      <MfaGate open={showGate} onClose={() => setShowGate(false)} />
    </>
  )
}
