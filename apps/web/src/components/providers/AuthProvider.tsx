'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session, User, AuthenticatorAssuranceLevels } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/browser'

type UserRole = 'viewer' | 'analyst' | 'dba' | 'super_admin'
type AALevel = 'aal1' | 'aal2'

interface AuthContextValue {
  session:   Session | null
  user:      User | null
  role:      UserRole | null
  onboarded: boolean | null
  /** Current authenticator assurance level */
  aal:       AALevel
  /** True when user has verified TOTP but session is only aal1 (needs step-up) */
  needsAAL2: boolean
  /** Returns the current access token, refreshing if needed */
  getToken:  () => Promise<string | null>
  /** Trigger AAL2 step-up — resolve(true) on success, resolve(false) on cancel/error */
  upgradeAAL: (code: string) => Promise<boolean>
  loading:   boolean
}

const AuthContext = createContext<AuthContextValue>({
  session:      null,
  user:         null,
  role:         null,
  onboarded:    null,
  aal:          'aal1',
  needsAAL2:    false,
  getToken:     async () => null,
  upgradeAAL:   async () => false,
  loading:      true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [role,    setRole]    = useState<UserRole | null>(null)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [aal, setAal] = useState<AALevel>('aal1')
  const [needsAAL2, setNeedsAAL2] = useState(false)
  const [loading, setLoading] = useState(true)

  // Fetch AAL level from Supabase
  const refreshAAL = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (!error && data) {
      setAal((data.currentLevel ?? 'aal1') as AALevel)
      setNeedsAAL2(
        data.currentLevel === 'aal1' && data.nextLevel === 'aal2',
      )
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Hydrate from existing cookie session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    // Keep state in sync with auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check AAL level whenever session changes
  useEffect(() => {
    if (session) {
      refreshAAL()
    } else {
      setAal('aal1')
      setNeedsAAL2(false)
    }
  }, [session, refreshAAL])

  // Fetch role + onboarded from /api/me once session is available
  useEffect(() => {
    if (!session) { setRole(null); setOnboarded(null); return }
    const token = session.access_token
    fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.data?.role) setRole(d.data.role as UserRole)
        if (d?.data != null) setOnboarded(d.data.onboarded ?? true)
      })
      .catch(() => {})
  }, [session])

  const getToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Step-up to AAL2: challenge + verify TOTP code, then refresh session
  const upgradeAAL = useCallback(async (code: string): Promise<boolean> => {
    try {
      const { data: factorsData } = await supabase.auth.mfa.listFactors()
      const factor = factorsData?.totp?.find(f => f.status === 'verified')
      if (!factor) return false

      const { data: challenge, error: challengeErr } = await supabase.auth.mfa.challenge({
        factorId: factor.id,
      })
      if (challengeErr || !challenge) return false

      const { error: verifyErr } = await supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      })
      if (verifyErr) return false

      // Refresh session & AAL state
      await supabase.auth.refreshSession()
      await refreshAAL()
      return true
    } catch {
      return false
    }
  }, [refreshAAL]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        role,
        onboarded,
        aal,
        needsAAL2,
        getToken,
        upgradeAAL,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
