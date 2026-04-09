import { createClient } from '@supabase/supabase-js'
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

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_SERVICE_KEY!

// Anon client for verifying user JWTs
const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
})

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)

  try {
    const { data, error } = await supabaseAuth.auth.getUser(token)
    if (error || !data.user) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }

    // Fetch role from user_profiles
    const { supabase } = await import('../config/supabase.js')
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', data.user.id)
      .single()

    if (profileError || !profile) {
      res.status(403).json({ error: 'User profile not found' })
      return
    }

    req.user = {
      id: data.user.id,
      email: data.user.email ?? '',
      role: profile.role as UserRole,
    }

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
