import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireDBA, requireSuperAdmin } from '../middleware/auth.js'
import {
  getAllConnections,
  getConnectionById,
  createConnection,
  updateConnection,
  deleteConnection,
  getConnectionsWithHealth,
  getLatestHealthSnapshot,
  bustSnapshotCache,
} from '../services/connectionService.js'
import { triggerManualScan } from '../services/healthScanner.js'
import { logActivity } from '../services/activityService.js'
import { getAdapter } from '../adapters/index.js'

const router = Router()

// ─── POST /api/connections/test — test credentials before saving ─────────────
const testSchema = z.object({
  db_type:          z.enum(['oracle', 'mssql', 'mariadb']),
  host:             z.string().min(1),
  port:             z.number().int().min(1).max(65535),
  database_name:    z.string().optional(),
  username:         z.string().min(1),
  password:         z.string().min(1),
  oracle_privilege: z.enum(['SYSDBA', 'SYSOPER']).optional(),
})

router.post('/test', requireAuth, async (req, res) => {
  const parsed = testSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  const { db_type, host, port, database_name, username, password, oracle_privilege } = parsed.data
  try {
    const adapter = await getAdapter(db_type)
    const result  = await adapter.testConnection({
      host,
      port,
      database: database_name ?? '',
      username,
      password,
      options: oracle_privilege ? { privilege: oracle_privilege } : undefined,
    })
    res.json({ data: result })
  } catch (err: any) {
    res.json({ data: { ok: false, latency_ms: 0, error: err.message } })
  }
})

// ─── GET /api/connections ────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    const withHealth = req.query.health === 'true'
    const data = withHealth
      ? await getConnectionsWithHealth()
      : await getAllConnections()
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── GET /api/connections/:id ────────────────────────────────────────────────
// Returns connection + latest snapshot in a single round-trip so the detail
// page only needs one fetch (auth check happens once, Redis serves the snap).
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const [conn, snapshot] = await Promise.all([
      getConnectionById(req.params.id),
      getLatestHealthSnapshot(req.params.id),
    ])
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }
    res.json({ data: { ...conn, snapshot: snapshot ?? null } })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── POST /api/connections ───────────────────────────────────────────────────
const createSchema = z.object({
  name:             z.string().min(1).max(100),
  db_type:          z.enum(['oracle', 'mssql', 'mariadb']),
  environment:      z.enum(['production', 'uat']),
  host:             z.string().min(1),
  port:             z.number().int().min(1).max(65535),
  database_name:    z.string().optional(),
  agent_name:       z.string().min(1),
  username:         z.string().optional(),
  password:         z.string().optional(),
  oracle_privilege: z.enum(['SYSDBA', 'SYSOPER']).optional(),
})

router.post('/', requireAuth, requireDBA, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }

  try {
    const conn = await createConnection(parsed.data)
    await logActivity({
      actorId:    req.user!.id,
      actorName:  req.user!.email,
      action:     'connection.created',
      targetType: 'connection',
      targetId:   conn.id,
      payload:    { name: conn.name, db_type: conn.db_type },
    })
    res.status(201).json({ data: conn })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── POST /api/connections/:id/scan ─────────────────────────────────────────
router.post('/:id/scan', requireAuth, requireDBA, async (req, res) => {
  try {
    const conn = await getConnectionById(req.params.id)
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }

    const snapshot = await triggerManualScan(conn)
    await bustSnapshotCache(conn.id)   // fresh data — invalidate Redis
    await logActivity({
      actorId:    req.user!.id,
      actorName:  req.user!.email,
      action:     'health_scan.manual',
      targetType: 'connection',
      targetId:   conn.id,
      payload:    { score: snapshot.score, status: snapshot.status },
    })

    res.json({ data: snapshot })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── GET /api/connections/:id/snapshots/latest ───────────────────────────────
router.get('/:id/snapshots/latest', requireAuth, async (req, res) => {
  try {
    const snapshot = await getLatestHealthSnapshot(req.params.id)
    if (!snapshot) {
      res.status(404).json({ error: 'No snapshot found' })
      return
    }
    res.json({ data: snapshot })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── PATCH /api/connections/:id ──────────────────────────────────────────────
const updateSchema = z.object({
  name:             z.string().min(1).max(100).optional(),
  environment:      z.enum(['production', 'uat']).optional(),
  host:             z.string().min(1).optional(),
  port:             z.number().int().min(1).max(65535).optional(),
  database_name:    z.string().optional(),
  agent_name:       z.string().min(1).optional(),
  username:         z.string().optional(),
  password:         z.string().optional(),
  oracle_privilege: z.enum(['SYSDBA', 'SYSOPER']).nullable().optional(),
})

router.patch('/:id', requireAuth, requireDBA, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const conn = await getConnectionById(req.params.id)
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }
    const updated = await updateConnection(req.params.id, parsed.data)
    await logActivity({
      actorId:    req.user!.id,
      actorName:  req.user!.email,
      action:     'connection.updated',
      targetType: 'connection',
      targetId:   conn.id,
      payload:    { name: conn.name, changes: Object.keys(parsed.data) },
    })
    res.json({ data: updated })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── DELETE /api/connections/:id ─────────────────────────────────────────────
router.delete('/:id', requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const conn = await getConnectionById(req.params.id)
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }

    await deleteConnection(req.params.id)
    await logActivity({
      actorId:    req.user!.id,
      actorName:  req.user!.email,
      action:     'connection.deleted',
      targetType: 'connection',
      targetId:   req.params.id,
      payload:    { name: conn.name },
    })

    res.json({ message: 'Connection deleted' })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
