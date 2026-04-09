import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireDBA } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { logActivity } from '../services/activityService.js'

const router = Router()

// ─── GET /api/alerts ─────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    let query = supabase
      .from('alerts')
      .select('*, connections(name, db_type, environment)')
      .order('created_at', { ascending: false })

    if (req.query.status) {
      query = query.eq('status', req.query.status as string)
    }
    if (req.query.severity) {
      query = query.eq('severity', req.query.severity as string)
    }
    if (req.query.connection_id) {
      query = query.eq('connection_id', req.query.connection_id as string)
    }

    const limit = Number(req.query.limit) || 50
    query = query.limit(limit)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── GET /api/alerts/counts ──────────────────────────────────────────────────
router.get('/counts', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .select('severity, status')
      .eq('status', 'active')

    if (error) throw new Error(error.message)

    const counts = { critical: 0, warning: 0, info: 0, total: 0 }
    for (const alert of data ?? []) {
      counts[alert.severity as keyof typeof counts]++
      counts.total++
    }

    res.json({ data: counts })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── PATCH /api/alerts/:id/acknowledge ───────────────────────────────────────
router.patch('/:id/acknowledge', requireAuth, requireDBA, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({
        status:           'acknowledged',
        acknowledged_by:  req.user!.id,
        acknowledged_at:  new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('status', 'active')
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Alert not found or already actioned' })
      return
    }

    await logActivity({
      actorId:    req.user!.id,
      actorName:  req.user!.email,
      action:     'alert.acknowledged',
      targetType: 'alert',
      targetId:   req.params.id,
    })

    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── PATCH /api/alerts/:id/resolve ───────────────────────────────────────────
router.patch('/:id/resolve', requireAuth, requireDBA, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('alerts')
      .update({
        status:      'resolved',
        resolved_by: req.user!.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .neq('status', 'resolved')
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Alert not found or already resolved' })
      return
    }

    await logActivity({
      actorId:    req.user!.id,
      actorName:  req.user!.email,
      action:     'alert.resolved',
      targetType: 'alert',
      targetId:   req.params.id,
    })

    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
