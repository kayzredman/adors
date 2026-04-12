import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, requireSuperAdmin, requireAAL2 } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { dispatchAlertNotifications } from '../services/notificationService.js'

const router = Router()

// All notification channel routes require super_admin
router.use(requireAuth, requireSuperAdmin)

// ─── GET /api/notifications/channels ─────────────────────────────────────────
router.get('/channels', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('notification_channels')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw error
    res.json({ data: data ?? [] })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to list channels' })
  }
})

// ─── POST /api/notifications/channels ────────────────────────────────────────
const createSchema = z.object({
  type: z.enum(['whatsapp', 'teams', 'email']),
  name: z.string().min(1).max(100).trim(),
  config: z.record(z.unknown()).default({}),
  enabled: z.boolean().default(true),
})

router.post('/channels', requireAAL2, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const { data, error } = await supabase
      .from('notification_channels')
      .insert(parsed.data)
      .select()
      .single()

    if (error) throw error
    res.status(201).json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to create channel' })
  }
})

// ─── PATCH /api/notifications/channels/:id ───────────────────────────────────
const updateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
})

router.patch('/channels/:id', requireAAL2, async (req, res) => {
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }

  try {
    const { data, error } = await supabase
      .from('notification_channels')
      .update(parsed.data)
      .eq('id', req.params.id)
      .select()
      .single()

    if (error || !data) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }
    res.json({ data })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to update channel' })
  }
})

// ─── DELETE /api/notifications/channels/:id ──────────────────────────────────
router.delete('/channels/:id', requireAAL2, async (req, res) => {
  try {
    const { error } = await supabase
      .from('notification_channels')
      .delete()
      .eq('id', req.params.id)

    if (error) throw error
    res.json({ message: 'Channel deleted' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to delete channel' })
  }
})

// ─── POST /api/notifications/channels/:id/test ──────────────────────────────
router.post('/channels/:id/test', async (req, res) => {
  try {
    const { data: channel, error } = await supabase
      .from('notification_channels')
      .select('*')
      .eq('id', req.params.id)
      .single()

    if (error || !channel) {
      res.status(404).json({ error: 'Channel not found' })
      return
    }

    const testAlert = {
      severity: 'info' as const,
      type: 'test_notification',
      message: 'This is a test notification from ADORS Mission Control.',
      connection_name: 'Test Connection',
      details: {},
    }

    await dispatchAlertNotifications([testAlert], 'test-' + Date.now())
    res.json({ message: 'Test notification sent' })
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Failed to send test' })
  }
})

export default router
