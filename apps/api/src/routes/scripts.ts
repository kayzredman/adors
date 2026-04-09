import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth, requireDBA } from '../middleware/auth.js'

const router = Router()

// GET /api/scripts — list scripts with optional filters
router.get('/', requireAuth, async (req, res) => {
  try {
    const { db_type, risk_level, source } = req.query as Record<string, string>

    let query = supabase
      .from('scripts')
      .select('*')
      .order('db_type')
      .order('name')

    if (db_type)    query = query.eq('db_type', db_type)
    if (risk_level) query = query.eq('risk_level', risk_level)
    if (source)     query = query.eq('source', source)

    const { data, error } = await query
    if (error) throw error

    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// GET /api/scripts/:id
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !data) return res.status(404).json({ error: 'Script not found' })
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// POST /api/scripts — create script (DBA+)
const createSchema = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  db_type:     z.enum(['oracle', 'mssql', 'mariadb']),
  risk_level:  z.enum(['zero', 'low', 'medium', 'high']),
  sql_content: z.string().min(1),
  source:      z.enum(['internal', 'oem']).default('internal'),
})

router.post('/', requireDBA, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const { data, error } = await supabase
      .from('scripts')
      .insert({ ...parsed.data, created_by: (req as any).user.id })
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/scripts/:id/verify — mark as sandbox-verified (DBA+)
router.patch('/:id/verify', requireDBA, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('scripts')
      .update({ verified_at: new Date().toISOString(), verified_by: (req as any).user.id })
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) return res.status(404).json({ error: 'Script not found' })
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
