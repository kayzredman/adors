// ─── ADORS Agent Core ─────────────────────────────────────────────────────────
// Wraps OpenAI-compatible client (GitHub Models or OpenAI).
// GitHub Models endpoint: https://models.inference.ai.azure.com
// Set GITHUB_TOKEN in apps/api/.env to enable.  Falls back to a clear message when
// the key is absent so the UI degrades gracefully rather than throwing.

import OpenAI from 'openai'

export type BotId = 'orabot' | 'msbot' | 'marbot'

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

// A single connection's live state as injected into the system prompt.
export interface ConnectionContext {
  connectionName:   string
  dbType:           string
  environment:      string
  healthScore?:     number
  healthStatus?:    string
  activeAlerts?:    number
  blockedSessions?: number
  metrics?:         Record<string, unknown>
}

export interface AgentContext {
  // Full fleet of connections this bot is responsible for — always populated.
  fleet?: ConnectionContext[]
  // Optionally, one specific connection the user is looking at in the UI.
  focusedConnection?: ConnectionContext
}

// ─── System prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<BotId, string> = {
  orabot: `You are OraBot, an expert Oracle Database AI assistant embedded in ADORS (Automated Database Operations & Response System).

ADORS gives you REAL live data: connection names, health scores, active alerts, blocked sessions, and current metrics for every Oracle instance this system monitors. This data will appear in a [Live data from ADORS] block below. You MUST use it.

Rules:
- Always refer to connections by their exact name (e.g. PROD_ORA_01, UAT_ORA_01).
- If the user asks about a metric that is present in the live data, quote the actual value.
- If the data shows a problem (critical score, blocked sessions, alerts), proactively call it out even if not asked.
- If a metric the user asks about is NOT in the live data (e.g. backup trends — not currently tracked), say so explicitly and offer the SQL they can run on that specific connection.
- Never fabricate metric values.

Your expertise: Oracle 11g–23c, AWR/ASH, wait events, tablespace management, undo/redo pressure, blocking sessions, deadlocks, ORA-errors, Data Guard replication, SYSDBA operations.
When suggesting remediation, confirm risk level before proposing destructive commands (ALTER SYSTEM KILL SESSION etc.).
Be concise — 3–6 sentences unless asked to elaborate.`,

  msbot: `You are MsBot, an expert SQL Server AI assistant embedded in ADORS (Automated Database Operations & Response System).

ADORS gives you REAL live data: connection names, health scores, active alerts, blocked sessions, and current metrics for every SQL Server instance this system monitors. This data will appear in a [Live data from ADORS] block below. You MUST use it.

Rules:
- Always refer to connections by their exact name (e.g. PROD_SQL_01, UAT_SQL_01).
- If the user asks about a metric that is present in the live data, quote the actual value.
- If the data shows a problem (critical score, blocking spids, memory pressure), proactively call it out.
- If a metric the user asks about is NOT in the live data, say so and offer the T-SQL/DMV query for that specific instance.
- Never fabricate metric values.

Your expertise: SQL Server 2012–2022, Azure SQL, DMVs, wait stats, buffer pool, plan cache, Always On AG, blocking chains, CXPACKET/PAGEIOLATCH waits, index fragmentation, query store.
Be concise — 3–6 sentences unless asked to elaborate.`,

  marbot: `You are MarBot, an expert MariaDB AI assistant embedded in ADORS (Automated Database Operations & Response System).

ADORS gives you REAL live data: connection names, health scores, active alerts, blocked sessions, and current metrics for every MariaDB instance this system monitors. This data will appear in a [Live data from ADORS] block below. You MUST use it.

Rules:
- Always refer to connections by their exact name (e.g. PROD_MAR_01, UAT_MAR_01).
- If the user asks about a metric that is present in the live data, quote the actual value.
- If the data shows a problem (critical score, replication lag, low buffer pool hit ratio), proactively call it out.
- If a metric the user asks about is NOT in the live data, say so and offer the SQL/config query for that specific server.
- Never fabricate metric values.

Your expertise: MariaDB 10.4+, MySQL-compatible, InnoDB buffer pool, replication lag, slow query log, Galera cluster, connection pool saturation, max_connections tuning.
Be concise — 3–6 sentences unless asked to elaborate.`,
}

// ─── Model selection ─────────────────────────────────────────────────────────

const GITHUB_MODELS_URL  = 'https://models.inference.ai.azure.com'
const PREFERRED_MODEL    = 'gpt-4o-mini'           // fast + cheap for chat
const FALLBACK_MODEL     = 'Meta-Llama-3.1-8B-Instruct'

// ─── Client factory ──────────────────────────────────────────────────────────

function makeClient(): OpenAI | null {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  return new OpenAI({
    baseURL: GITHUB_MODELS_URL,
    apiKey:  token,
  })
}

// ─── Context injection ───────────────────────────────────────────────────────
// Selects the most diagnostically relevant metrics per DB type so we don't
// waste token budget on sparkline arrays or redundant fields.

const KEY_METRICS: Record<string, string[]> = {
  oracle: [
    'db_version', 'uptime_days', 'tablespace_usage_pct',
    'sessions_active', 'sessions_blocked', 'sessions_total',
    'num_clients', 'avg_response_ms',
    'execution_rate', 'parse_rate',
    'redo_log_switches_per_hr', 'undo_usage_pct',
    'data_guard_lag_sec',
  ],
  mssql: [
    'db_version', 'uptime_days',
    'active_connections', 'max_connections',
    'buffer_pool_memory_pct', 'page_life_expectancy_sec',
    'blocking_spids', 'deadlocks_per_min',
    'log_space_used_pct', 'ag_sync_state', 'ag_queue_hardened',
  ],
  mariadb: [
    'db_version', 'uptime_days',
    'active_connections', 'max_connections',
    'buffer_pool_hit_ratio', 'buffer_pool_memory_pct',
    'replication_lag_sec', 'slave_io_running', 'slave_sql_running',
    'slow_queries_per_min', 'long_running_txn_count',
  ],
}

function formatConnectionBlock(c: ConnectionContext, focused = false): string {
  const header = focused
    ? `▶ ${c.connectionName} [${c.environment.toUpperCase()}] ← FOCUSED`
    : `• ${c.connectionName} [${c.environment.toUpperCase()}]`

  const lines = [header]

  if (c.healthScore !== undefined) {
    const badge = c.healthStatus === 'critical' ? '🔴' : c.healthStatus === 'warning' ? '🟡' : '🟢'
    lines.push(`  Health: ${badge} ${c.healthScore}/100 (${c.healthStatus ?? 'unknown'})`)
  } else {
    lines.push(`  Health: ⚪ no snapshot yet`)
  }

  if (c.activeAlerts)    lines.push(`  Active alerts: ${c.activeAlerts}`)
  if (c.blockedSessions) lines.push(`  Blocked sessions: ${c.blockedSessions}`)

  if (c.metrics && Object.keys(c.metrics).length) {
    const allowedKeys = KEY_METRICS[c.dbType] ?? []
    const relevant = Object.entries(c.metrics)
      .filter(([k, v]) =>
        allowedKeys.includes(k) &&
        v !== null && v !== undefined &&
        !Array.isArray(v) &&         // skip sparkline arrays
        typeof v !== 'object',        // skip nested objects
      )
    if (relevant.length) {
      lines.push(`  Metrics:`)
      relevant.forEach(([k, v]) => lines.push(`    ${k}: ${v}`))
    }
  }

  return lines.join('\n')
}

function buildContextBlock(ctx: AgentContext): string {
  const parts: string[] = []

  if (ctx.fleet && ctx.fleet.length > 0) {
    parts.push(`[Live data from ADORS — ${ctx.fleet.length} monitored connection(s)]`)
    for (const conn of ctx.fleet) {
      const isFocused = ctx.focusedConnection?.connectionName === conn.connectionName
      parts.push(formatConnectionBlock(conn, isFocused))
    }
    parts.push(
      `\nThis is REAL live data. Reference these connections and metrics directly in your answers.`,
      `If a metric is absent from a connection's snapshot, say so — do not fabricate values.`,
    )
  } else if (ctx.focusedConnection) {
    parts.push(`[Live data from ADORS]`)
    parts.push(formatConnectionBlock(ctx.focusedConnection, true))
  }

  return parts.join('\n')
}

// ─── Main: streaming chat ─────────────────────────────────────────────────────

export async function* streamChat(
  botId: BotId,
  history: ChatMessage[],
  context?: AgentContext,
): AsyncGenerator<string> {
  const client = makeClient()

  if (!client) {
    yield '⚠️ GITHUB_TOKEN is not configured. Add it to apps/api/.env to enable AI responses.'
    return
  }

  const systemPrompt = SYSTEM_PROMPTS[botId]
  const contextBlock  = context ? buildContextBlock(context) : ''

  const messages: ChatMessage[] = [
    { role: 'system', content: contextBlock ? `${systemPrompt}\n\n${contextBlock}` : systemPrompt },
    ...history,
  ]

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  try {
    const stream = await client.chat.completions.create(
      { model: PREFERRED_MODEL, messages, stream: true },
      { signal: controller.signal },
    )

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  } catch (err: unknown) {
    const isAborted = err instanceof Error && err.name === 'AbortError'
    const msg       = err instanceof Error ? err.message : String(err)
    const status    = (err as { status?: number }).status

    if (isAborted) {
      yield '⚠️ Agent request timed out after 30 seconds.'
      return
    }

    if (status === 401) {
      yield '⚠️ GitHub token does not have the **models** permission.\n\n' +
            'Generate a new token at https://github.com/settings/tokens/new\n' +
            '→ Token type: **Classic**  (or Fine-grained with Models • Read)\n' +
            '→ Copy the token into `GITHUB_TOKEN` in `apps/api/.env` and restart the API.'
      return
    }

    // Fallback model on 404 / model-not-found
    if (status === 404 || msg.includes('model') || msg.includes('404')) {
      try {
        const ctrl2 = new AbortController()
        const t2    = setTimeout(() => ctrl2.abort(), 30_000)
        const stream2 = await client.chat.completions.create(
          { model: FALLBACK_MODEL, messages, stream: true },
          { signal: ctrl2.signal },
        )
        for await (const chunk of stream2) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) yield delta
        }
        clearTimeout(t2)
        return
      } catch {
        // fall through to generic error
      }
    }

    yield `⚠️ Agent error: ${msg}`
  } finally {
    clearTimeout(timeout)
  }
}
