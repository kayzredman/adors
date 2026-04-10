import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'
import { streamChat } from '@adors/agents'
import type { BotId, ChatMessage, AgentContext, ConnectionContext, ToolCallRequest } from '@adors/agents'
import { getAdapter } from '../adapters/index.js'
import { getConnectionById, getConnectionCredentials } from '../services/connectionService.js'
import { logActivity } from '../services/activityService.js'
import type { DbCredentials } from '../adapters/types.js'

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

  // ─── Tool executor ─────────────────────────────────────────────────────────
  // Only DBA+ roles may trigger live query execution.
  const canExecuteTools = req.user && ['dba', 'super_admin'].includes(req.user.role)

  const onToolCall = !canExecuteTools ? undefined : async (toolReq: ToolCallRequest) => {
    const { name, arguments: args, id: toolCallId } = toolReq

    if (name === 'get_fleet_health') {
      // Already in context — return a summary of the fleet we built above
      const summary = context?.fleet?.map(c => ({
        name: c.connectionName,
        status: c.healthStatus ?? 'unknown',
        score: c.healthScore,
        alerts: c.activeAlerts ?? 0,
        blockedSessions: c.blockedSessions ?? 0,
      })) ?? []
      return { toolCallId, result: { fleet: summary } }
    }

    if (name === 'execute_query') {
      const connectionName = String(args['connectionName'] ?? '')
      const sql            = String(args['sql'] ?? '')

      if (!connectionName || !sql) {
        return { toolCallId, result: { error: 'connectionName and sql are required' } }
      }

      // Resolve connection from fleet
      const rawConn = context?.fleet
        ? await supabase
            .from('connections')
            .select('id, name, db_type, host, port, database_name, oracle_privilege')
            .eq('name', connectionName)
            .single()
            .then(r => r.data)
        : null

      if (!rawConn) {
        return { toolCallId, result: { error: `Connection "${connectionName}" not found in fleet` } }
      }

      // Fetch encrypted credentials
      const stored = await getConnectionCredentials(rawConn.id)
      if (!stored) {
        return { toolCallId, result: { error: `No credentials stored for "${connectionName}"` } }
      }

      const creds: DbCredentials = {
        host:     rawConn.host,
        port:     rawConn.port,
        database: rawConn.database_name ?? '',
        username: stored.username,
        password: stored.password,
        options:  rawConn.oracle_privilege ? { privilege: rawConn.oracle_privilege } : undefined,
      }

      const adapter = await getAdapter(rawConn.db_type)
      if (!adapter) {
        return { toolCallId, result: { error: `No adapter for db_type "${rawConn.db_type}"` } }
      }

      const actorId   = req.user!.id
      const actorName = req.user!.email

      try {
        const result = await adapter.executeQuery(creds, sql, 10_000)

        // Audit log — every tool query is recorded
        logActivity({
          actorId, actorName,
          action:     'agent_query',
          targetType: 'connection',
          targetId:   rawConn.id,
          payload:    { connectionName, sql, rowCount: result.rowCount, executionMs: result.executionMs },
        }).catch(() => {})

        return { toolCallId, result }
      } catch (err) {
        logActivity({
          actorId, actorName,
          action:     'agent_query_failed',
          targetType: 'connection',
          targetId:   rawConn.id,
          payload:    { connectionName, sql, error: err instanceof Error ? err.message : String(err) },
        }).catch(() => {})
        return { toolCallId, result: { error: err instanceof Error ? err.message : String(err) } }
      }
    }

    if (name === 'get_analytics') {
      const connectionName = String(args['connectionName'] ?? '')
      const days = Math.min(90, Math.max(1, Number(args['days'] ?? 7)))

      const conn = context?.fleet?.find(c => c.connectionName === connectionName)
      if (!conn) {
        return { toolCallId, result: { error: `Connection "${connectionName}" not found in fleet` } }
      }

      const rawConn = await supabase
        .from('connections')
        .select('id')
        .eq('name', connectionName)
        .single()
        .then(r => r.data)

      if (!rawConn) return { toolCallId, result: { error: 'Connection not found' } }

      const since = new Date(Date.now() - days * 86400_000).toISOString()
      const { data: snapshots } = await supabase
        .from('health_snapshots')
        .select('scored_at, score, status')
        .eq('connection_id', rawConn.id)
        .gte('scored_at', since)
        .order('scored_at', { ascending: true })

      return {
        toolCallId,
        result: {
          connectionName,
          days,
          series: (snapshots ?? []).map(s => ({ t: s.scored_at, score: s.score, status: s.status })),
        },
      }
    }

    return { toolCallId, result: { error: `Unknown tool: ${name}` } }
  }

  try {
    const gen = streamChat(botId as BotId, messages as ChatMessage[], context, onToolCall)
    for await (const chunk of gen) {
      const trimmed = chunk.trim()

      // ── Tool-call start token: [TOOL_CALL:name:jsonArgs] ──────────────────
      // Route as a typed SSE event so the client never receives raw JSON in text.
      if (trimmed.startsWith('[TOOL_CALL:')) {
        const body    = trimmed.slice('[TOOL_CALL:'.length, -1)   // strip prefix + outer ]
        const sepIdx  = body.indexOf(':')
        if (sepIdx !== -1) {
          const name    = body.slice(0, sepIdx)
          const argJson = body.slice(sepIdx + 1)
          try {
            const args = JSON.parse(argJson) as Record<string, unknown>
            res.write(`event: tool_start\ndata: ${JSON.stringify({ name, connectionName: args['connectionName'], sql: args['sql'] })}\n\n`)
          } catch {
            res.write(`event: tool_start\ndata: ${JSON.stringify({ name })}\n\n`)
          }
        }
        continue
      }

      // ── Tool-call result token: [TOOL_RESULT:id:jsonResult] ───────────────
      if (trimmed.startsWith('[TOOL_RESULT:')) {
        const body      = trimmed.slice('[TOOL_RESULT:'.length, -1)  // strip prefix + outer ]
        const sepIdx    = body.indexOf(':')
        if (sepIdx !== -1) {
          const id         = body.slice(0, sepIdx)
          const resultJson = body.slice(sepIdx + 1)
          try {
            const result  = JSON.parse(resultJson) as Record<string, unknown>
            const isError = Boolean(result['error'])
            const rawRows = Array.isArray(result['rows']) ? result['rows'] as Record<string, unknown>[] : undefined
            const cols    = Array.isArray(result['columns']) ? result['columns'] as string[] : undefined
            // Send up to 10 rows to the UI; truncate long cell values
            const rows    = rawRows?.slice(0, 10).map(row => {
              const trimmed: Record<string, unknown> = {}
              for (const c of (cols ?? Object.keys(row))) {
                const v = row[c]
                trimmed[c] = typeof v === 'string' && v.length > 100 ? v.slice(0, 100) + '…' : v
              }
              return trimmed
            })
            res.write(`event: tool_result\ndata: ${JSON.stringify({
              id,
              status:      isError ? 'error' : 'done',
              rowCount:    result['rowCount'],
              executionMs: result['executionMs'],
              error:       result['error'] ?? undefined,
              rows,
              columns:     cols,
            })}\n\n`)
          } catch {
            res.write(`event: tool_result\ndata: ${JSON.stringify({ id, status: 'error', error: 'Parse error' })}\n\n`)
          }
        }
        continue
      }

      // ── Normal text delta ─────────────────────────────────────────────────
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
