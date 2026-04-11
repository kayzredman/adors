import { Router } from 'express'
import { z } from 'zod'
import { supabase } from '../config/supabase.js'
import { requireAuth, requireDBA } from '../middleware/auth.js'
import { logActivity } from '../services/activityService.js'
import { getAdapter } from '../adapters/index.js'
import { getConnectionById, getConnectionCredentials } from '../services/connectionService.js'
import type { DbCredentials } from '../adapters/types.js'

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

router.post('/', requireAuth, requireDBA, async (req, res) => {
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
router.patch('/:id/verify', requireAuth, requireDBA, async (req, res) => {
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

// POST /api/scripts/:id/execute-prod — run a verified script against a production connection (DBA+)
const execProdSchema = z.object({
  connection_id: z.string().uuid(),
})

router.post('/:id/execute-prod', requireAuth, requireDBA, async (req, res) => {
  const parsed = execProdSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  const user = (req as any).user
  const scriptId    = req.params.id
  const { connection_id } = parsed.data

  try {
    // 1. Load script — must be sandbox-verified
    const { data: script, error: scriptErr } = await supabase
      .from('scripts')
      .select('id, name, sql_content, risk_level, db_type, verified_at')
      .eq('id', scriptId)
      .single()

    if (scriptErr || !script) return res.status(404).json({ error: 'Script not found' })
    if (!script.verified_at) {
      return res.status(422).json({ error: 'Script must be sandbox-verified before production execution' })
    }

    // 2. Load connection — must be production
    const conn = await getConnectionById(connection_id)
    if (!conn) return res.status(404).json({ error: 'Connection not found' })
    if (conn.environment !== 'production') {
      return res.status(403).json({ error: 'execute-prod is only permitted against production connections' })
    }
    if (conn.db_type !== script.db_type) {
      return res.status(422).json({ error: `Script db_type (${script.db_type}) does not match connection db_type (${conn.db_type})` })
    }

    // 3. Get credentials
    const stored = await getConnectionCredentials(connection_id)
    if (!stored) return res.status(422).json({ error: 'No credentials configured for this connection' })

    const creds: DbCredentials = {
      host:     conn.host,
      port:     conn.port,
      database: conn.database_name ?? '',
      username: stored.username,
      password: stored.password,
      options:  conn.oracle_privilege ? { privilege: conn.oracle_privilege } : undefined,
    }

    // 4. Execute via adapter
    const adapter = await getAdapter(conn.db_type)
    const startMs = Date.now()
    const result  = await adapter.executeQuery(creds, script.sql_content, 30_000)
    const execMs  = Date.now() - startMs

    // 5. Audit trail
    await logActivity({
      actorId:    user.id,
      actorName:  user.email,
      action:     'script_execute_prod',
      targetType: 'connection',
      targetId:   connection_id,
      payload:    {
        script_id:   scriptId,
        script_name: script.name,
        connection_name: conn.name,
        risk_level:  script.risk_level,
        exec_ms:     execMs,
        row_count:   result.rowCount,
      },
    })

    res.json({
      data: {
        script_id:       scriptId,
        script_name:     script.name,
        connection_id,
        connection_name: conn.name,
        exec_ms:         execMs,
        row_count:       result.rowCount,
        columns:         result.columns,
        rows:            result.rows.slice(0, 200),
      },
    })
  } catch (err: any) {
    // Audit failure too
    logActivity({
      actorId:   user.id,
      actorName: user.email,
      action:    'script_execute_prod_failed',
      targetType: 'connection',
      targetId:  parsed.data.connection_id,
      payload:   { script_id: scriptId, error: err.message },
    }).catch(() => {})

    res.status(500).json({ error: err.message })
  }
})

// PATCH /api/scripts/:id — update script metadata (DBA+)
// Editing sql_content resets sandbox verification to require re-testing before prod use.
const updateSchema = z.object({
  name:        z.string().min(1).max(120).optional(),
  description: z.string().max(500).optional(),
  db_type:     z.enum(['oracle', 'mssql', 'mariadb']).optional(),
  risk_level:  z.enum(['zero', 'low', 'medium', 'high']).optional(),
  sql_content: z.string().min(1).optional(),
  source:      z.enum(['internal', 'oem']).optional(),
})

router.patch('/:id', requireAuth, requireDBA, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() })

  try {
    const updates: Record<string, unknown> = { ...parsed.data }
    // Reset sandbox verification whenever SQL is changed
    if (parsed.data.sql_content !== undefined) {
      updates.verified_at = null
      updates.verified_by = null
    }

    const { data, error } = await supabase
      .from('scripts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) return res.status(404).json({ error: 'Script not found' })
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

// DELETE /api/scripts/:id — remove script (DBA+)
router.delete('/:id', requireAuth, requireDBA, async (req, res) => {
  try {
    const { error } = await supabase
      .from('scripts')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ message: 'Script deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
