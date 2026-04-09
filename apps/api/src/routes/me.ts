import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// ─── GET /api/me ─────────────────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  res.json({ data: req.user })
})

export default router
