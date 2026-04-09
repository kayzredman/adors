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
  exp?: number
  iat?: number
}

// LRU-style in-process cache: { userId → { role, expiresAt } }
const roleCache = new Map<string, { role: UserRole; expiresAt: number }>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

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

  // Check role cache first
  const cached = roleCache.get(userId)
  if (cached && Date.now() < cached.expiresAt) {
    req.user = { id: userId, email, role: cached.role }
    return next()
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      res.status(403).json({ error: 'User profile not found' })
      return
    }

    const role = profile.role as UserRole
    roleCache.set(userId, { role, expiresAt: Date.now() + CACHE_TTL_MS })

    req.user = { id: userId, email, role }
    next()
  } catch {
    res.status(500).json({ error: 'Authentication service error' })
  }
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
