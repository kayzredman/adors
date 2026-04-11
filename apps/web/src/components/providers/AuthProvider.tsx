'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/browser'

type UserRole = 'viewer' | 'analyst' | 'dba' | 'super_admin'

interface AuthContextValue {
  session:   Session | null
  user:      User | null
  role:      UserRole | null
  onboarded: boolean | null
  /** Returns the current access token, refreshing if needed */
  getToken:  () => Promise<string | null>
  loading:   boolean
}

const AuthContext = createContext<AuthContextValue>({
  session:   null,
  user:      null,
  role:      null,
  onboarded: null,
  getToken:  async () => null,
  loading:   true,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [role,    setRole]    = useState<UserRole | null>(null)
  const [onboarded, setOnboarded] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

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

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, role, onboarded, getToken, loading }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
