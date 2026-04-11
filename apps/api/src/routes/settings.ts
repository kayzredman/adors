import { Router } from 'express'
import { requireAuth, requireAAL2 } from '../middleware/auth.js'
import { z } from 'zod'

const router = Router()

const ADMIN_ROLES = ['super_admin']

/** Resolve target user ID: if `?user_id=` is provided, require admin role. */
function resolveTarget(req: any, res: any): string | null {
  const qid = req.query.user_id as string | undefined
  if (qid) {
    if (!ADMIN_ROLES.includes(req.user!.role)) {
      res.status(403).json({ error: 'Only admins can manage other users' })
      return null
    }
    return qid
  }
  return req.user!.id
}

// ─── PATCH /api/settings/profile ─────────────────────────────────────────────
const profileSchema = z.object({
  full_name: z.string().min(1).max(200).trim(),
})

router.patch('/profile', requireAuth, async (req, res) => {
  const targetId = resolveTarget(req, res)
  if (!targetId) return

  const parsed = profileSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data, error } = await supabase
      .from('user_profiles')
      .update({ full_name: parsed.data.full_name })
      .eq('id', targetId)
      .select('id, full_name, role')
      .single()

    if (error) throw error

    await supabase.auth.admin.updateUserById(targetId, {
      user_metadata: { full_name: parsed.data.full_name },
    })

    res.json({ data, message: 'Display name updated' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update profile' })
  }
})

// ─── POST /api/settings/password ─────────────────────────────────────────────
const passwordSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

router.post('/password', requireAuth, requireAAL2, async (req, res) => {
  const targetId = resolveTarget(req, res)
  if (!targetId) return

  const parsed = passwordSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { error } = await supabase.auth.admin.updateUserById(targetId, {
      password: parsed.data.password,
    })
    if (error) throw error

    res.json({ message: 'Password updated successfully' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update password' })
  }
})

// ─── GET /api/settings/mfa ──────────────────────────────────────────────────
router.get('/mfa', requireAuth, async (req, res) => {
  const targetId = resolveTarget(req, res)
  if (!targetId) return

  try {
    const { supabase } = await import('../config/supabase.js')
    const { data: user, error } = await supabase.auth.admin.getUserById(targetId)
    if (error) throw error

    const factors = user.user?.factors ?? []
    const totp = factors.find((f: any) => f.factor_type === 'totp' && f.status === 'verified')

    res.json({
      data: {
        enrolled: !!totp,
        factor_id: totp?.id ?? null,
        created_at: totp?.created_at ?? null,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to check MFA status' })
  }
})

// ─── DELETE /api/settings/mfa ────────────────────────────────────────────────
router.delete('/mfa', requireAuth, requireAAL2, async (req, res) => {
  const targetId = resolveTarget(req, res)
  if (!targetId) return

  const { factor_id } = req.body as { factor_id?: string }
  if (!factor_id) {
    res.status(400).json({ error: 'factor_id is required' })
    return
  }

  try {
    const { supabase } = await import('../config/supabase.js')
    const { error } = await supabase.auth.admin.mfa.deleteFactor({
      id: factor_id,
      userId: targetId,
    })
    if (error) throw error

    res.json({ message: 'TOTP factor removed successfully' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to remove MFA factor' })
  }
})

export default router
