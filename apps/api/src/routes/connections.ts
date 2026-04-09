import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireDBA, requireSuperAdmin } from '../middleware/auth.js'
import {
  getAllConnections,
  getConnectionById,
  createConnection,
  deleteConnection,
  getConnectionsWithHealth,
  getLatestHealthSnapshot,
} from '../services/connectionService.js'
import { triggerManualScan } from '../services/healthScanner.js'
import { logActivity } from '../services/activityService.js'

const router = Router()

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
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const conn = await getConnectionById(req.params.id)
    if (!conn) {
      res.status(404).json({ error: 'Connection not found' })
      return
    }
    res.json({ data: conn })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ─── POST /api/connections ───────────────────────────────────────────────────
const createSchema = z.object({
  name:            z.string().min(1).max(100),
  db_type:         z.enum(['oracle', 'mssql', 'mariadb']),
  environment:     z.enum(['production', 'uat']),
  host:            z.string().min(1),
  port:            z.number().int().min(1).max(65535),
  database_name:   z.string().optional(),
  agent_name:      z.string().min(1),
  credentials_ref: z.string().optional(),
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
