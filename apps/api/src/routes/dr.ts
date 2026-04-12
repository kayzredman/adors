import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth, requireDBA, requireAAL2 } from '../middleware/auth.js'
import { logActivity } from '../services/activityService.js'

const router = Router()

// ─── DR Pairs ────────────────────────────────────────────────────────────────

// GET /api/dr/pairs — list all DR pairs with joined connection names
router.get('/pairs', requireAuth, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('dr_pairs')
      .select(`
        *,
        prod_connection:connections!dr_pairs_prod_connection_id_fkey(id, name, db_type, environment, host, port, status),
        dr_connection:connections!dr_pairs_dr_connection_id_fkey(id, name, db_type, environment, host, port, status)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/dr/pairs/:id — single pair with drills
router.get('/pairs/:id', requireAuth, async (req, res) => {
  try {
    const { data: pair, error: pairErr } = await supabase
      .from('dr_pairs')
      .select(`
        *,
        prod_connection:connections!dr_pairs_prod_connection_id_fkey(id, name, db_type, environment, host, port, status),
        dr_connection:connections!dr_pairs_dr_connection_id_fkey(id, name, db_type, environment, host, port, status)
      `)
      .eq('id', req.params.id)
      .single()

    if (pairErr || !pair) return res.status(404).json({ error: 'DR pair not found' })

    const { data: drills } = await supabase
      .from('dr_drills')
      .select('*, run_by_profile:user_profiles!dr_drills_run_by_fkey(full_name)')
      .eq('pair_id', req.params.id)
      .order('started_at', { ascending: false })
      .limit(50)

    const drillsFlat = (drills ?? []).map((d: any) => ({
      ...d,
      run_by_name: d.run_by_profile?.full_name ?? null,
      run_by_profile: undefined,
    }))

    res.json({ data: { ...pair, drills: drillsFlat } })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/dr/pairs — create a DR pair (DBA+)
const createPairSchema = z.object({
  prod_connection_id: z.string().uuid(),
  dr_connection_id:   z.string().uuid(),
  rpo_target_minutes: z.number().int().min(1).default(15),
  rto_target_minutes: z.number().int().min(1).default(60),
  notes:              z.string().max(500).optional(),
})

router.post('/pairs', requireAuth, requireDBA, async (req, res) => {
  const parsed = createPairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const user = (req as any).user

  try {
    // Validate connections exist and have correct environments
    const { data: prodConn } = await supabase
      .from('connections')
      .select('id, name, environment, db_type')
      .eq('id', parsed.data.prod_connection_id)
      .single()

    if (!prodConn) return res.status(404).json({ error: 'Production connection not found' })
    if (prodConn.environment !== 'production') {
      return res.status(422).json({ error: 'First connection must be a production environment' })
    }

    const { data: drConn } = await supabase
      .from('connections')
      .select('id, name, environment, db_type')
      .eq('id', parsed.data.dr_connection_id)
      .single()

    if (!drConn) return res.status(404).json({ error: 'DR connection not found' })
    if (drConn.environment !== 'dr') {
      return res.status(422).json({ error: 'Second connection must be a DR environment' })
    }

    if (prodConn.db_type !== drConn.db_type) {
      return res.status(422).json({ error: `DB type mismatch: ${prodConn.db_type} ≠ ${drConn.db_type}` })
    }

    const { data, error } = await supabase
      .from('dr_pairs')
      .insert({ ...parsed.data, created_by: user.id })
      .select()
      .single()

    if (error) throw error

    await logActivity({
      actorId: user.id,
      actorName: user.email,
      action: 'dr_pair_created',
      targetType: 'dr_pair',
      targetId: data.id,
      payload: { prod: prodConn.name, dr: drConn.name },
    })

    res.status(201).json({ data })
  } catch (err: any) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'This DR pair already exists' })
    }
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/dr/pairs/:id — update targets / notes (DBA+)
const updatePairSchema = z.object({
  rpo_target_minutes: z.number().int().min(1).optional(),
  rto_target_minutes: z.number().int().min(1).optional(),
  notes:              z.string().max(500).optional(),
})

router.patch('/pairs/:id', requireAuth, requireDBA, async (req, res) => {
  const parsed = updatePairSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const { data, error } = await supabase
      .from('dr_pairs')
      .update({ ...parsed.data, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) return res.status(404).json({ error: 'DR pair not found' })
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/dr/pairs/:id — remove a pair (DBA+)
router.delete('/pairs/:id', requireAuth, requireDBA, requireAAL2, async (req, res) => {
  try {
    const { error } = await supabase
      .from('dr_pairs')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error

    await logActivity({
      actorId: (req as any).user.id,
      actorName: (req as any).user.email,
      action: 'dr_pair_deleted',
      targetType: 'dr_pair',
      targetId: req.params.id,
    })

    res.json({ message: 'DR pair deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// ─── DR Drills ───────────────────────────────────────────────────────────────

// GET /api/dr/drills — all drills with optional pair_id filter
router.get('/drills', requireAuth, async (req, res) => {
  try {
    let query = supabase
      .from('dr_drills')
      .select('*, run_by_profile:user_profiles!dr_drills_run_by_fkey(full_name)')
      .order('started_at', { ascending: false })
      .limit(100)

    if (req.query.pair_id) {
      query = query.eq('pair_id', req.query.pair_id as string)
    }

    const { data, error } = await query
    if (error) throw error

    const flat = (data ?? []).map((d: any) => ({
      ...d,
      run_by_name: d.run_by_profile?.full_name ?? null,
      run_by_profile: undefined,
    }))

    res.json({ data: flat })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/dr/drills — record a drill (DBA+)
const createDrillSchema = z.object({
  pair_id:        z.string().uuid(),
  result:         z.enum(['pass', 'fail', 'partial', 'aborted']),
  started_at:     z.string().datetime(),
  completed_at:   z.string().datetime().optional(),
  duration_min:   z.number().int().min(0).optional(),
  rpo_actual_min: z.number().int().min(0).optional(),
  rto_actual_min: z.number().int().min(0).optional(),
  notes:          z.string().max(2000).optional(),
})

router.post('/drills', requireAuth, requireDBA, async (req, res) => {
  const parsed = createDrillSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const user = (req as any).user

  try {
    // Validate pair exists
    const { data: pair } = await supabase
      .from('dr_pairs')
      .select('id')
      .eq('id', parsed.data.pair_id)
      .single()

    if (!pair) return res.status(404).json({ error: 'DR pair not found' })

    const { data, error } = await supabase
      .from('dr_drills')
      .insert({ ...parsed.data, run_by: user.id })
      .select()
      .single()

    if (error) throw error

    await logActivity({
      actorId: user.id,
      actorName: user.email,
      action: 'dr_drill_recorded',
      targetType: 'dr_pair',
      targetId: parsed.data.pair_id,
      payload: { result: parsed.data.result, duration_min: parsed.data.duration_min },
    })

    res.status(201).json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/dr/drills/:id — update drill record (DBA+)
const updateDrillSchema = z.object({
  result:         z.enum(['pass', 'fail', 'partial', 'aborted']).optional(),
  completed_at:   z.string().datetime().optional(),
  duration_min:   z.number().int().min(0).optional(),
  rpo_actual_min: z.number().int().min(0).optional(),
  rto_actual_min: z.number().int().min(0).optional(),
  notes:          z.string().max(2000).optional(),
})

router.patch('/drills/:id', requireAuth, requireDBA, async (req, res) => {
  const parsed = updateDrillSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const { data, error } = await supabase
      .from('dr_drills')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) return res.status(404).json({ error: 'Drill not found' })
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/dr/drills/:id — remove a drill record (DBA+)
router.delete('/drills/:id', requireAuth, requireDBA, async (req, res) => {
  try {
    const { error } = await supabase
      .from('dr_drills')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ message: 'Drill record deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
