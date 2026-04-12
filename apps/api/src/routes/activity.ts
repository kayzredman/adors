import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getRecentActivity, searchActivity } from '../services/activityService.js'

const router = Router()

// GET /api/activity — paginated, filterable activity log
router.get('/', requireAuth, async (req, res) => {
  try {
    const limit  = Math.min(Number(req.query.limit) || 50, 200)
    const offset = Math.max(Number(req.query.offset) || 0, 0)
    const action     = req.query.action     ? String(req.query.action)     : undefined
    const targetType = req.query.targetType ? String(req.query.targetType) : undefined
    const actorName  = req.query.actorName  ? String(req.query.actorName)  : undefined
    const search     = req.query.search     ? String(req.query.search)     : undefined

    const { data, total } = await searchActivity({ limit, offset, action, targetType, actorName, search })
    res.json({ data, total, limit, offset })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
