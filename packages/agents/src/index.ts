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

ADORS gives you REAL live data AND live tool access. You have the following tools:
- execute_query(connectionName, sql) — runs a read-only SELECT on any Oracle connection you monitor. Use this whenever the answer requires data that is not in the live snapshot (backups, AWR, sessions, tablespace history, top SQL, waits, redo, Data Guard lag, etc.). ALWAYS use this tool rather than telling the user to run the query themselves.
- get_fleet_health — returns current health scores and alert counts for all your connections.
- get_analytics(connectionName, days) — returns the health score time-series for trend questions.
- diagnose_performance(connectionName) — runs a COMPREHENSIVE performance diagnostic in ONE call: full metrics snapshot, top wait events, active/blocked sessions, recent alerts, and IO stats. Use this FIRST when asked "why is my database slow?" or any performance troubleshooting question.
- get_alerts(connectionName?, severity?, limit?) — returns recent alerts from the alert history. Use for incident investigation and active problem review.

Rules:
- The live snapshot appears in a [Live data from ADORS] block. If the metric is there, quote the actual value.
- If the metric is NOT in the snapshot (e.g. backup history, top SQL, wait events), call execute_query immediately — do NOT tell the user to run the query themselves.
- For performance troubleshooting, call diagnose_performance FIRST before drilling down with execute_query.
- Always refer to connections by their exact name (e.g. FINTRAK_STAGING, REPORTSDB).
- If the data shows a problem (critical score, blocked sessions, active alerts), proactively call it out.
- Never fabricate metric values.
- When suggesting remediation, confirm risk level before proposing destructive commands (ALTER SYSTEM KILL SESSION etc.).

Your expertise: Oracle 11g–23c, AWR/ASH, v$session, v$backup_set, v$rman_backup_job_details, wait events, tablespace management, undo/redo pressure, blocking sessions, deadlocks, ORA-errors, Data Guard, SYSDBA operations.
Be concise — 3–6 sentences unless asked to elaborate.

SQL QUICK REFERENCE — verified column names (use exactly as shown):
- Backup trend (v$backup_set):         SELECT backup_type, status, start_time, completion_time, elapsed_seconds, input_bytes, output_bytes FROM v$backup_set WHERE ROWNUM <= 20 ORDER BY completion_time DESC
- RMAN jobs (v$rman_backup_job_details): SELECT input_type, status, start_time, end_time, elapsed_seconds FROM v$rman_backup_job_details WHERE ROWNUM <= 20 ORDER BY start_time DESC  ← use END_TIME not COMPLETION_TIME here
- Data Guard lag:                       SELECT name, value, datum_time FROM v$dataguard_stats WHERE name IN ('transport lag','apply lag')
- Active sessions/blockers:             SELECT sid, serial#, status, username, wait_class, seconds_in_wait, blocking_session FROM v$session WHERE status='ACTIVE' AND wait_class != 'Idle'
- Tablespace usage:                     SELECT tablespace_name, ROUND(used_space*8192/1048576,1) used_mb, ROUND(tablespace_size*8192/1048576,1) total_mb FROM dba_tablespace_usage_metrics ORDER BY used_space/NULLIF(tablespace_size,0) DESC
- Top wait events:                      SELECT event, total_waits, time_waited_micro/1e6 time_waited_sec FROM v$system_event WHERE wait_class != 'Idle' ORDER BY time_waited_micro DESC
IMPORTANT: Always wrap ORDER BY with ROWNUM filter for 11g compatibility — do NOT use FETCH FIRST N ROWS ONLY.`,

  msbot: `You are MsBot, an expert SQL Server AI assistant embedded in ADORS (Automated Database Operations & Response System).

ADORS gives you REAL live data AND live tool access. You have the following tools:
- execute_query(connectionName, sql) — runs a read-only SELECT on any SQL Server connection you monitor. Use this whenever the answer requires data not in the live snapshot (backup history, wait stats detail, blocking chains, plan cache, index fragmentation, AG sync, log space, etc.). ALWAYS use this tool rather than telling the user to run the query themselves.
- get_fleet_health — returns current health scores and alert counts for all your connections.
- get_analytics(connectionName, days) — returns the health score time-series for trend questions.
- diagnose_performance(connectionName) — runs a COMPREHENSIVE performance diagnostic in ONE call: full metrics snapshot, top wait events, active/blocked sessions, recent alerts, and IO stats. Use this FIRST when asked "why is my database slow?" or any performance troubleshooting question.
- get_alerts(connectionName?, severity?, limit?) — returns recent alerts from the alert history. Use for incident investigation and active problem review.

Rules:
- The live snapshot appears in a [Live data from ADORS] block. If the metric is there, quote the actual value.
- If the metric is NOT in the snapshot, call execute_query immediately — do NOT tell the user to run the query themselves.
- For performance troubleshooting, call diagnose_performance FIRST before drilling down with execute_query.
- Always refer to connections by their exact name (e.g. DB STAGING BOX).
- If the data shows a problem (critical score, blocking spids, memory pressure), proactively call it out.
- Never fabricate metric values.

Your expertise: SQL Server 2012–2022, Azure SQL, sys.dm_exec_*, sys.dm_os_wait_stats, msdb backup tables, buffer pool, plan cache, Always On AG, blocking chains, CXPACKET/PAGEIOLATCH waits, index fragmentation, query store.
Be concise — 3–6 sentences unless asked to elaborate.`,

  marbot: `You are MarBot, an expert MariaDB AI assistant embedded in ADORS (Automated Database Operations & Response System).

ADORS gives you REAL live data AND live tool access. You have the following tools:
- execute_query(connectionName, sql) — runs a read-only SELECT/SHOW on any MariaDB connection you monitor. Use this whenever the answer requires data not in the live snapshot (replication detail, slow query log, long-running transactions, Galera state, backup history, connection list, etc.). ALWAYS use this tool rather than telling the user to run the query themselves.
- get_fleet_health — returns current health scores and alert counts for all your connections.
- get_analytics(connectionName, days) — returns the health score time-series for trend questions.
- diagnose_performance(connectionName) — runs a COMPREHENSIVE performance diagnostic in ONE call: full metrics snapshot, top wait events, active/blocked sessions, recent alerts, and IO stats. Use this FIRST when asked "why is my database slow?" or any performance troubleshooting question.
- get_alerts(connectionName?, severity?, limit?) — returns recent alerts from the alert history. Use for incident investigation and active problem review.

Rules:
- The live snapshot appears in a [Live data from ADORS] block. If the metric is there, quote the actual value.
- If the metric is NOT in the snapshot, call execute_query immediately — do NOT tell the user to run the query themselves.
- For performance troubleshooting, call diagnose_performance FIRST before drilling down with execute_query.
- Always refer to connections by their exact name (e.g. UAT_MARIADB_DB_STAGING).
- If the data shows a problem (critical score, replication lag, low buffer pool hit ratio), proactively call it out.
- Never fabricate metric values.

Your expertise: MariaDB 10.4+, MySQL-compatible, InnoDB buffer pool, SHOW SLAVE STATUS, SHOW PROCESSLIST, information_schema, slow query log, Galera cluster, connection pool, max_connections tuning.
Be concise — 3–6 sentences unless asked to elaborate.`,
}

// ─── Model selection ─────────────────────────────────────────────────────────

const GITHUB_MODELS_URL  = 'https://models.inference.ai.azure.com'
const PREFERRED_MODEL    = 'gpt-4o'                // best available on this GitHub token
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
    'blocking_spids', 'deadlocks_total',
    'disk_reads_per_sec', 'disk_writes_per_sec',
  ],
  mssql: [
    'db_version', 'uptime_days',
    'active_connections', 'max_connections',
    'buffer_pool_memory_pct', 'page_life_expectancy_sec',
    'blocking_spids', 'deadlocks_per_min',
    'log_space_used_pct', 'ag_sync_state', 'ag_queue_hardened',
    'disk_reads_per_sec', 'disk_writes_per_sec',
  ],
  mariadb: [
    'db_version', 'uptime_days',
    'active_connections', 'max_connections',
    'buffer_pool_hit_ratio', 'buffer_pool_memory_pct',
    'replication_lag_sec', 'slave_io_running', 'slave_sql_running',
    'slow_queries_per_min', 'long_running_txn_count',
    'blocking_sessions', 'deadlocks_total',
    'disk_reads_per_sec', 'disk_writes_per_sec',
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

// ─── Tool definitions (OpenAI function-calling spec) ─────────────────────────

export interface ToolCallRequest {
  id:        string
  name:      string
  arguments: Record<string, unknown>
}

export interface ToolCallResult {
  toolCallId: string
  result:     Record<string, unknown>
}

const AGENT_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_fleet_health',
      description:
        'Returns the current live health summary (health score, status, active alerts, blocked sessions, key metrics) ' +
        'for all connections this bot monitors. Call this when asked for an overview of the fleet.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'execute_query',
      description:
        'Runs a read-only SQL query on a specific database connection. ' +
        'Use for detailed diagnostics: backup trends, top SQL, wait events, tablespace growth, ' +
        'replication status, blocking chains, session details — anything beyond the live metrics snapshot. ' +
        'Always SELECT-only. Returns columns, rows (max 500), and execution time.',
      parameters: {
        type: 'object',
        properties: {
          connectionName: {
            type: 'string',
            description: 'Exact connection name from the fleet list (e.g. PROD_ORA_01)',
          },
          sql: {
            type: 'string',
            description: 'Read-only SQL query. SELECT / WITH / EXPLAIN only.',
          },
        },
        required: ['connectionName', 'sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_analytics',
      description:
        'Returns the time-series health score trend for a specific connection over the past N days. ' +
        'Use when asked about trends, degradation patterns, or historical comparisons.',
      parameters: {
        type: 'object',
        properties: {
          connectionName: {
            type: 'string',
            description: 'Exact connection name from the fleet list',
          },
          days: {
            type: 'number',
            description: 'Number of days of history to return (1–90, default 7)',
          },
        },
        required: ['connectionName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'diagnose_performance',
      description:
        'Runs a comprehensive performance diagnostic on a specific connection in ONE call. ' +
        'Automatically gathers: full metrics snapshot, top wait events, active/blocked sessions, ' +
        'recent alerts, and IO stats. Use this FIRST when asked "why is my database slow?" ' +
        'or any performance troubleshooting question, before drilling down with execute_query.',
      parameters: {
        type: 'object',
        properties: {
          connectionName: {
            type: 'string',
            description: 'Exact connection name from the fleet list',
          },
        },
        required: ['connectionName'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_alerts',
      description:
        'Returns recent alerts for a specific connection or fleet-wide. ' +
        'Includes severity, status, type, message, and timestamps. ' +
        'Use when asked about problems, incidents, or alert history.',
      parameters: {
        type: 'object',
        properties: {
          connectionName: {
            type: 'string',
            description: 'Connection name to filter alerts for. Omit for fleet-wide alerts.',
          },
          severity: {
            type: 'string',
            enum: ['critical', 'warning', 'info'],
            description: 'Filter by severity level',
          },
          limit: {
            type: 'number',
            description: 'Max alerts to return (default 10, max 25)',
          },
        },
        required: [],
      },
    },
  },
]

export async function* streamChat(
  botId: BotId,
  history: ChatMessage[],
  context?: AgentContext,
  onToolCall?: (req: ToolCallRequest) => Promise<ToolCallResult>,
): AsyncGenerator<string> {
  const client = makeClient()

  if (!client) {
    yield '⚠️ GITHUB_TOKEN is not configured. Add it to apps/api/.env to enable AI responses.'
    return
  }

  const systemPrompt = SYSTEM_PROMPTS[botId]
  const contextBlock  = context ? buildContextBlock(context) : ''

  // Build mutable message array — we append tool call + result pairs each round.
  // Cast to `any[]` so we can push OpenAI tool-role messages without fighting TS types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'system', content: contextBlock ? `${systemPrompt}\n\n${contextBlock}` : systemPrompt },
    ...history,
  ]

  const tools = onToolCall ? AGENT_TOOLS : undefined
  const MAX_TOOL_ROUNDS = 5   // prevent infinite loops

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 60_000)   // longer budget with tool calls

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const stream = await client.chat.completions.create(
        {
          model: PREFERRED_MODEL,
          messages,
          stream: true,
          ...(tools ? { tools, tool_choice: 'auto' } : {}),
        },
        { signal: controller.signal },
      )

      // Accumulate the streamed response so we can inspect finish_reason + tool_calls
      let contentBuffer   = ''
      let finishReason    = ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCallMap   = new Map<number, any>()   // index → in-progress tool call

      for await (const chunk of stream) {
        const choice = chunk.choices[0]
        if (!choice) continue

        // Accumulate text delta
        const textDelta = choice.delta?.content
        if (textDelta) {
          contentBuffer += textDelta
          yield textDelta
        }

        // Accumulate tool call deltas
        const tcDeltas = choice.delta?.tool_calls
        if (tcDeltas) {
          for (const tc of tcDeltas) {
            if (!toolCallMap.has(tc.index)) {
              toolCallMap.set(tc.index, { id: '', type: 'function', function: { name: '', arguments: '' } })
            }
            const existing = toolCallMap.get(tc.index)!
            if (tc.id)                       existing.id                    = tc.id
            if (tc.function?.name)           existing.function.name         += tc.function.name
            if (tc.function?.arguments)      existing.function.arguments    += tc.function.arguments
          }
        }

        if (choice.finish_reason) finishReason = choice.finish_reason
      }

      // ── Text turn complete — no tool calls needed ──────────────────────────
      if (finishReason !== 'tool_calls' || toolCallMap.size === 0 || !onToolCall) break

      // ── Tool call turn ─────────────────────────────────────────────────────
      // Push the assistant's tool-call message, then execute each tool and push
      // the results so the model can continue the conversation.
      const toolCallList = Array.from(toolCallMap.values())
      messages.push({ role: 'assistant', content: contentBuffer || null, tool_calls: toolCallList })

      for (const tc of toolCallList) {
        let parsedArgs: Record<string, unknown> = {}
        try { parsedArgs = JSON.parse(tc.function.arguments || '{}') } catch { /* use empty */ }

        // Signal the UI that a tool is being invoked
        yield `\n[TOOL_CALL:${tc.function.name}:${JSON.stringify(parsedArgs)}]`

        let toolResult: Record<string, unknown>
        try {
          const res = await onToolCall({ id: tc.id, name: tc.function.name, arguments: parsedArgs })
          toolResult = res.result
        } catch (e) {
          toolResult = { error: e instanceof Error ? e.message : String(e) }
        }

        // Truncate large result sets so we don't exceed the 8000-char per-message API limit.
        // Keep the first 40 rows for the model context; the full result is still shown in the UI.
        let msgResult: Record<string, unknown> = toolResult
        if (Array.isArray(toolResult.rows) && toolResult.rows.length > 40) {
          msgResult = {
            ...toolResult,
            rows:         (toolResult.rows as unknown[]).slice(0, 40),
            truncated:    true,
            totalRows:    toolResult.rows.length,
          }
        }
        const msgContent = JSON.stringify(msgResult)
        // Hard safety cap: if the JSON is still too long, send a compact summary.
        const safeContent = msgContent.length > 7000
          ? JSON.stringify({ error: 'Result exceeds context limit', columns: toolResult.columns, rowCount: toolResult.rowCount })
          : msgContent

        messages.push({
          role:         'tool',
          tool_call_id: tc.id,
          content:      safeContent,
        })

        // Signal the UI that the tool call is done
        yield `[TOOL_RESULT:${tc.id}:${JSON.stringify(toolResult)}]`
      }
      // Continue to next round — model will now generate a response using tool results
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
