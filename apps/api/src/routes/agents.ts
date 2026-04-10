import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { streamChat } from '@adors/agents'
import type { BotId, ChatMessage, AgentContext, ConnectionContext } from '@adors/agents'

const router = Router()

const BOT_IDS = ['orabot', 'msbot', 'marbot'] as const

// Maps each bot to the db_type it monitors so we can auto-fetch fleet context.
const BOT_DB_TYPE: Record<string, string> = {
  orabot: 'oracle',
  msbot:  'mssql',
  marbot: 'mariadb',
}

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
  const dbType = BOT_DB_TYPE[botId]

  // ─── Build fleet context ───────────────────────────────────────────────────
  // Always inject all active connections this bot is responsible for, so the
  // bot can answer questions by referencing real connection names and metrics
  // — even when no specific connectionId is provided by the UI.
  let context: AgentContext | undefined
  try {
    const { data: connections } = await supabase
      .from('connections')
      .select('id, name, db_type, environment')
      .eq('db_type', dbType)
      .eq('status', 'active')

    if (connections && connections.length > 0) {
      // Fetch each connection's latest health snapshot in parallel
      const snapshots = await Promise.all(
        connections.map(conn =>
          supabase
            .from('health_snapshots')
            .select('connection_id, score, status, metrics, active_alerts, blocked_sessions, scored_at')
            .eq('connection_id', conn.id)
            .order('scored_at', { ascending: false })
            .limit(1)
            .single()
            .then(r => r.data)
            .catch(() => null),
        ),
      )
      const snapMap = new Map(
        snapshots.filter(Boolean).map(s => [s!.connection_id, s!]),
      )

      const fleet: ConnectionContext[] = connections.map(conn => {
        const snap = snapMap.get(conn.id)
        return {
          connectionName:   conn.name,
          dbType:           conn.db_type,
          environment:      conn.environment,
          ...(snap ? {
            healthScore:     snap.score,
            healthStatus:    snap.status,
            activeAlerts:    snap.active_alerts,
            blockedSessions: snap.blocked_sessions,
            metrics:         snap.metrics as Record<string, unknown>,
          } : {}),
        }
      })

      context = { fleet }

      // If the user pinged a specific connection, surface it as focusedConnection
      if (connectionId) {
        const focused = fleet.find(c =>
          connections.find(raw => raw.id === connectionId && raw.name === c.connectionName),
        )
        if (focused) context.focusedConnection = focused
      }
    }
  } catch {
    // context injection is best-effort — continue without it
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
