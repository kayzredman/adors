import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import type { UserRole } from '@adors/shared'

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string
        email: string
        role: UserRole
        aal: 'aal1' | 'aal2'
      }
    }
  }
}

// Verify JWTs locally using the shared secret — no GoTrue network round-trip,
// which was adding 2-4 s of latency to every authenticated request.
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET
  ?? 'your-super-secret-jwt-token-with-at-least-32-characters-long'

interface SupabaseJwtPayload {
  sub: string
  email?: string
  role?: string
  aal?: string
  exp?: number
  iat?: number
}

// LRU-style in-process cache: { userId → { role, expiresAt } }
const roleCache = new Map<string, { role: UserRole; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

/** Call this when a user's role or deactivation state changes so the next
 *  request re-fetches from DB instead of serving a stale cached role. */
export function invalidateRoleCache(userId: string): void {
  roleCache.delete(userId)
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)

  let payload: SupabaseJwtPayload
  try {
    payload = jwt.verify(token, JWT_SECRET) as SupabaseJwtPayload
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  const userId = payload.sub
  const email  = payload.email ?? ''
  const aal    = (payload.aal === 'aal2' ? 'aal2' : 'aal1') as 'aal1' | 'aal2'

  // Check role cache first
  const cached = roleCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    req.user = { id: userId, email, role: cached.role, aal }
    return next()
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role, deactivated_at')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      // Auto-create: any valid Supabase-authenticated user gets a default
      // viewer profile — least-privilege default, admin can grant more.
      const { data: newProfile, error: upsertErr } = await supabase
        .from('user_profiles')
        .upsert({ id: userId, role: 'viewer' }, { onConflict: 'id' })
        .select('role, deactivated_at')
        .single()
      if (upsertErr || !newProfile) {
        res.status(403).json({ error: 'User profile not found' })
        return
      }
      const role = newProfile.role as UserRole
      roleCache.set(userId, { role, expiresAt: Date.now() + CACHE_TTL_MS })
      req.user = { id: userId, email, role, aal }
      next()
      return
    }

    // Block deactivated users at the auth layer, not just /api/me
    if ((profile as any).deactivated_at) {
      res.status(403).json({ error: 'Account has been deactivated' })
      return
    }

    const role = profile.role as UserRole
    roleCache.set(userId, { role, expiresAt: Date.now() + CACHE_TTL_MS })

    req.user = { id: userId, email, role, aal }
    next()
  } catch {
    res.status(500).json({ error: 'Authentication service error' })
  }
}

// ─── AAL2 Enforcement ────────────────────────────────────────────────────────
// Users who have enrolled TOTP must present an aal2 session for sensitive ops.
// Users without TOTP (aal1-only) pass through — AAL2 is only enforced when the
// user *has* enrolled MFA but the current session hasn't been verified yet.

export function requireAAL2(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  // aal2 sessions always pass
  if (req.user.aal === 'aal2') return next()

  // For aal1 sessions, we need to check if the user has TOTP enrolled.
  // If they do, they must step-up to aal2. If they don't, aal1 is fine.
  checkUserHasTOTP(req.user.id)
    .then((hasTOTP) => {
      if (hasTOTP) {
        res.status(403).json({
          error: 'MFA verification required',
          code: 'aal2_required',
        })
      } else {
        next()
      }
    })
    .catch(() => {
      // On error, fail open — don't lock the user out due to a transient issue
      next()
    })
}

// Cache TOTP enrollment status per user (short TTL)
const totpCache = new Map<string, { hasTOTP: boolean; expiresAt: number }>()
const TOTP_CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes

async function checkUserHasTOTP(userId: string): Promise<boolean> {
  const cached = totpCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) return cached.hasTOTP

  const { createClient } = await import('@supabase/supabase-js')
  const adminClient = createClient(
    process.env.SUPABASE_URL ?? 'http://localhost:8000',
    process.env.SUPABASE_SERVICE_KEY ?? '',
  )
  const { data } = await adminClient.auth.admin.getUserById(userId)
  const factors = (data?.user as any)?.factors ?? []
  const hasTOTP = factors.some(
    (f: any) => f.factor_type === 'totp' && f.status === 'verified',
  )
  totpCache.set(userId, { hasTOTP, expiresAt: Date.now() + TOTP_CACHE_TTL_MS })
  return hasTOTP
}

// ─── RBAC Middleware Factory ─────────────────────────────────────────────────

const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer:      1,
  analyst:     2,
  dba:         3,
  super_admin: 4,
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }

    const userLevel = ROLE_HIERARCHY[req.user.role]
    const requiredLevel = Math.min(...roles.map((r) => ROLE_HIERARCHY[r]))

    if (userLevel < requiredLevel) {
      res.status(403).json({
        error: `Insufficient permissions. Required: ${roles.join(' or ')}. Your role: ${req.user.role}`,
      })
      return
    }

    next()
  }
}

// Convenience shorthands
export const requireDBA         = requireRole('dba', 'super_admin')
export const requireSuperAdmin  = requireRole('super_admin')
export const requireAnalyst     = requireRole('analyst', 'dba', 'super_admin')
