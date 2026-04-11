import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// ─── GET /api/me ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const { supabase } = await import('../config/supabase.js')
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('onboarded, deactivated_at')
      .eq('id', req.user!.id)
      .single()

    if (profile?.deactivated_at) {
      res.status(403).json({ error: 'Account deactivated' })
      return
    }

    res.json({ data: { ...req.user, onboarded: profile?.onboarded ?? true } })
  } catch {
    res.json({ data: { ...req.user, onboarded: true } })
  }
})

// ─── PATCH /api/me ───────────────────────────────────────────────────────────
router.patch('/', requireAuth, async (req, res) => {
  const { full_name } = req.body as { full_name?: string }

  try {
    const { supabase } = await import('../config/supabase.js')

    const updates: Record<string, unknown> = { onboarded: true }
    if (full_name?.trim()) updates.full_name = full_name.trim()

    const { data, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', req.user!.id)
      .select('id, full_name, role, onboarded')
      .single()

    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update profile' })
  }
})

export default router
