'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/providers/AuthProvider'
import { ShieldOff, Loader2 } from 'lucide-react'

type UserRole = 'viewer' | 'analyst' | 'dba' | 'super_admin'

const ROLE_LEVEL: Record<UserRole, number> = {
  viewer: 1, analyst: 2, dba: 3, super_admin: 4,
}

interface RoleGuardProps {
  children: React.ReactNode
  /** Minimum role required to view this content */
  minRole: UserRole
}

export function RoleGuard({ children, minRole }: RoleGuardProps) {
  const { role, loading } = useAuth()
  const router = useRouter()

  const userLevel = ROLE_LEVEL[role as UserRole] ?? 0
  const required  = ROLE_LEVEL[minRole]
  const allowed   = userLevel >= required

  useEffect(() => {
    if (!loading && role !== null && !allowed) {
      router.replace('/')
    }
  }, [loading, role, allowed, router])

  if (loading || role === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
        <ShieldOff className="w-10 h-10" />
        <p className="text-sm font-medium">You don't have permission to access this page.</p>
      </div>
    )
  }

  return <>{children}</>
}
