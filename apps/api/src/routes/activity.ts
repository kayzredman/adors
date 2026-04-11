import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { getRecentActivity } from '../services/activityService.js'

const router = Router()

router.get('/', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 200)
    const data = await getRecentActivity(limit)
    res.json({ data })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
