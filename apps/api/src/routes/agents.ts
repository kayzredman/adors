import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { streamChat } from '@adors/agents'
import type { BotId, ChatMessage, AgentContext } from '@adors/agents'

const router = Router()

const BOT_IDS = ['orabot', 'msbot', 'marbot'] as const

const ChatRequestSchema = z.object({
  botId:        z.enum(BOT_IDS),
  messages:     z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string().max(8000),
  })).min(1).max(50),
  connectionId: z.string().uuid().optional(),
})

// ─── POST /api/agents/chat  (SSE streaming) ───────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' })
    return
  }

  const { botId, messages, connectionId } = parsed.data

  // Optionally inject DB context from last health snapshot
  let context: AgentContext | undefined
  if (connectionId) {
    try {
      const [connRes, snapRes] = await Promise.all([
        supabase
          .from('connections')
          .select('name, db_type, environment')
          .eq('id', connectionId)
          .single(),
        supabase
          .from('health_snapshots')
          .select('score, status, metrics, active_alerts')
          .eq('connection_id', connectionId)
          .order('scored_at', { ascending: false })
          .limit(1)
          .single(),
      ])

      if (connRes.data) {
        context = {
          connectionName: connRes.data.name,
          dbType:         connRes.data.db_type,
          environment:    connRes.data.environment,
          ...(snapRes.data ? {
            healthScore:  snapRes.data.score,
            healthStatus: snapRes.data.status,
            activeAlerts: snapRes.data.active_alerts,
            metrics:      snapRes.data.metrics as Record<string, unknown>,
          } : {}),
        }
      }
    } catch {
      // context injection is best-effort — continue without it
    }
  }

  // Set SSE headers
  res.setHeader('Content-Type',  'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection',    'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')    // Nginx: disable proxy buffering
  res.flushHeaders()

  try {
    const gen = streamChat(botId as BotId, messages as ChatMessage[], context)
    for await (const chunk of gen) {
      // SSE data frame
      res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`)
  } finally {
    res.write('data: [DONE]\n\n')
    res.end()
  }
})

export default router
