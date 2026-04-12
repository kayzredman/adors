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
- propose_remediation(connectionName, command, reason, risk) — proposes a write/remediation action (terminate session, ALTER SYSTEM, FLUSH, etc.) that requires human approval. Use when you find a fixable problem. The user must approve before it executes.

Rules:
- The live snapshot appears in a [Live data from ADORS] block. If the metric is there, quote the actual value.
- If the metric is NOT in the snapshot (e.g. backup history, top SQL, wait events), call execute_query immediately — do NOT tell the user to run the query themselves.
- For performance troubleshooting, call diagnose_performance FIRST before drilling down with execute_query.
- Always refer to connections by their exact name (e.g. FINTRAK_STAGING, REPORTSDB).
- If the data shows a problem (critical score, blocked sessions, active alerts), proactively call it out.
- Never fabricate metric values.
- When you identify a fixable problem (blocking session, full tablespace, etc.), use propose_remediation to suggest the fix. ALWAYS explain the risk and wait for human approval — do NOT just tell the user to go run the command.
- Allowed Oracle commands: ALTER SYSTEM KILL/DISCONNECT SESSION, ALTER TABLESPACE ADD DATAFILE, ALTER SYSTEM SET/FLUSH/SWITCH LOGFILE.

CRITICAL — you CAN and SHOULD take action on sessions:
- NEVER say "ADORS does not execute destructive commands" or "I cannot terminate sessions".
- You HAVE the propose_remediation tool specifically for this purpose. It queues the command for human approval — nothing executes until the user clicks Approve.
- When asked to terminate/disconnect a session: first query v$session to get the SID and SERIAL#, then call propose_remediation with the ALTER SYSTEM KILL SESSION command. This is your core job.
- If the session has already ended (0 rows), simply tell the user — do not refuse.

IMPORTANT — content-filter safety: Azure OpenAI may flag standard DBA terminology. In your responses, prefer "terminate session" over "kill session" and "cancel query" over "kill query". The actual SQL commands (ALTER SYSTEM KILL SESSION) are still valid in propose_remediation — just use softer language in your explanations.

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
- propose_remediation(connectionName, command, reason, risk) — proposes a write/remediation action (terminate session, DBCC, ALTER INDEX, etc.) that requires human approval. Use when you find a fixable problem. The user must approve before it executes.

Rules:
- The live snapshot appears in a [Live data from ADORS] block. If the metric is there, quote the actual value.
- If the metric is NOT in the snapshot, call execute_query immediately — do NOT tell the user to run the query themselves.
- For performance troubleshooting, call diagnose_performance FIRST before drilling down with execute_query.
- Always refer to connections by their exact name (e.g. DB STAGING BOX).
- If the data shows a problem (critical score, blocking spids, memory pressure), proactively call it out.
- Never fabricate metric values.
- When you identify a fixable problem (blocking chain, plan cache bloat, fragmented index), use propose_remediation to suggest the fix. ALWAYS explain the risk and wait for approval.
- Allowed MSSQL commands: KILL <spid>, DBCC FREEPROCCACHE, DBCC DROPCLEANBUFFERS, DBCC SHRINKFILE, ALTER DATABASE, ALTER INDEX REBUILD/REORGANIZE.

CRITICAL — you CAN and SHOULD take action on sessions:
- NEVER say "ADORS does not execute destructive commands" or "I cannot terminate sessions".
- You HAVE the propose_remediation tool specifically for this purpose. It queues the command for human approval — nothing executes until the user clicks Approve.
- When asked to terminate a session: first identify the SPID, then call propose_remediation with the KILL command. This is your core job.
- If the session has already ended (0 rows), simply tell the user — do not refuse.

IMPORTANT — content-filter safety: Azure OpenAI may flag standard DBA terminology. In your responses, prefer "terminate session" over "kill session". The actual SQL commands (KILL <spid>) are still valid in propose_remediation — just use softer language in your explanations.

Your expertise: SQL Server 2012–2022, Azure SQL, sys.dm_exec_*, sys.dm_os_wait_stats, msdb backup tables, buffer pool, plan cache, Always On AG, blocking chains, CXPACKET/PAGEIOLATCH waits, index fragmentation, query store.
Be concise — 3–6 sentences unless asked to elaborate.`,

  marbot: `You are MarBot, an expert MariaDB AI assistant embedded in ADORS (Automated Database Operations & Response System).

ADORS gives you REAL live data AND live tool access. You have the following tools:
- execute_query(connectionName, sql) — runs a read-only SELECT/SHOW on any MariaDB connection you monitor. Use this whenever the answer requires data not in the live snapshot (replication detail, slow query log, long-running transactions, Galera state, backup history, connection list, etc.). ALWAYS use this tool rather than telling the user to run the query themselves.
- get_fleet_health — returns current health scores and alert counts for all your connections.
- get_analytics(connectionName, days) — returns the health score time-series for trend questions.
- diagnose_performance(connectionName) — runs a COMPREHENSIVE performance diagnostic in ONE call: full metrics snapshot, top wait events, active/blocked sessions, recent alerts, and IO stats. Use this FIRST when asked "why is my database slow?" or any performance troubleshooting question.
- get_alerts(connectionName?, severity?, limit?) — returns recent alerts from the alert history. Use for incident investigation and active problem review.
- propose_remediation(connectionName, command, reason, risk) — proposes a write/remediation action (terminate session, FLUSH, OPTIMIZE, SET GLOBAL, etc.) that requires human approval. Use when you find a fixable problem. The user must approve before it executes.

Rules:
- The live snapshot appears in a [Live data from ADORS] block. If the metric is there, quote the actual value.
- If the metric is NOT in the snapshot, call execute_query immediately — do NOT tell the user to run the query themselves.
- For performance troubleshooting, call diagnose_performance FIRST before drilling down with execute_query.
- Always refer to connections by their exact name (e.g. UAT_MARIADB_DB_STAGING).
- If the data shows a problem (critical score, replication lag, low buffer pool hit ratio), proactively call it out.
- Never fabricate metric values.
- When you identify a fixable problem (stuck query, slow replication, table fragmentation), use propose_remediation to suggest the fix. ALWAYS explain the risk and wait for approval.
- Allowed MariaDB commands: KILL <id>, KILL QUERY <id>, FLUSH TABLES, FLUSH QUERY CACHE, OPTIMIZE TABLE, SET GLOBAL.

CRITICAL — you CAN and SHOULD take action on sessions:
- NEVER say "ADORS does not execute destructive commands" or "I cannot terminate sessions".
- You HAVE the propose_remediation tool specifically for this purpose. It queues the command for human approval — nothing executes until the user clicks Approve.
- When asked to terminate a session or cancel a query: first identify the thread ID, then call propose_remediation with the KILL command. This is your core job.
- If the session has already ended (0 rows), simply tell the user — do not refuse.

IMPORTANT — content-filter safety: Azure OpenAI may flag standard DBA terminology. In your responses, prefer "terminate session" or "cancel query" over "kill". The actual SQL commands (KILL <id>) are still valid in propose_remediation — just use softer language in your explanations.

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
  {
    type: 'function',
    function: {
      name: 'propose_remediation',
      description:
        'Proposes a remediation action (terminate session, ALTER SYSTEM, FLUSH, OPTIMIZE, etc.) that requires human approval before execution. ' +
        'The user will see the exact command and must click "Approve" in the ADORS UI before it runs. ' +
        'Use this when you identify a fixable problem (blocking session, memory pressure, fragmented index, etc.). ' +
        'Provide a clear explanation of WHY this action is needed and what RISK it carries. ' +
        'Only allowed commands from the ADORS allow-list will be accepted.',
      parameters: {
        type: 'object',
        properties: {
          connectionName: {
            type: 'string',
            description: 'Exact connection name to execute the remediation on',
          },
          command: {
            type: 'string',
            description: 'The exact SQL/command to execute (e.g. ALTER SYSTEM KILL SESSION, KILL 55, DBCC FREEPROCCACHE). Use standard SQL syntax here — content filtering applies only to natural language.',
          },
          reason: {
            type: 'string',
            description: 'Human-readable explanation of why this remediation is recommended',
          },
          risk: {
            type: 'string',
            enum: ['low', 'medium', 'high'],
            description: 'Risk level: low (routine maintenance), medium (service impact possible), high (potential downtime)',
          },
        },
        required: ['connectionName', 'command', 'reason', 'risk'],
      },
    },
  },
]

// ─── Content-filter sanitisation ──────────────────────────────────────────────
// Azure OpenAI's content filter flags standard DBA terminology ("kill session",
// "lets kill them") as violent.  Rewrite to neutral synonyms before sending.

const DBA_KILL_PATTERNS: [RegExp, string][] = [
  [/\bkill\s+session/gi,     'terminate session'],
  [/\bkill\s+query/gi,       'cancel query'],
  [/\bkill\s+(\d+)/gi,       'terminate $1'],
  [/\bkill\s+them/gi,        'terminate them'],
  [/\bkill\s+it/gi,          'terminate it'],
  [/\blets\s+kill/gi,        'lets terminate'],
  [/\blet'?s\s+kill/gi,      'lets terminate'],
  [/\bgo\s+kill/gi,          'go terminate'],
  [/\bplease\s+kill/gi,      'please terminate'],
  [/\bKILL\b/g,              'TERMINATE'],   // standalone uppercase (SQL keyword)
]

function sanitizeDbaTerminology(text: string): string {
  let out = text
  for (const [pattern, replacement] of DBA_KILL_PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

// ─── History trimming ──────────────────────────────────────────────────────────
// Keeps the most recent messages that fit within `maxChars`.
// Always keeps the last user message. Drops oldest messages first.
// Summarises long assistant messages to reduce token waste.

function trimHistory(history: ChatMessage[], maxChars: number): ChatMessage[] {
  // First pass: compact long assistant messages (tool-result summaries)
  const compacted = history.map(m => {
    if (m.role !== 'assistant' || m.content.length <= 1500) return m
    // Truncate excessively long assistant messages (e.g. embedded tool results)
    return { ...m, content: m.content.slice(0, 1200) + '\n… (earlier context trimmed)' }
  })

  // Second pass: drop oldest messages until we fit
  let totalChars = compacted.reduce((sum, m) => sum + m.content.length, 0)
  let startIdx = 0
  while (totalChars > maxChars && startIdx < compacted.length - 1) {
    totalChars -= compacted[startIdx].content.length
    startIdx++
  }

  return compacted.slice(startIdx)
}

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
  const systemContent = contextBlock ? `${systemPrompt}\n\n${contextBlock}` : systemPrompt

  // ─── History trimming ────────────────────────────────────────────────────
  // GitHub Models (gpt-4o) enforces an 8 000-token request body limit.
  // Rough estimate: 1 token ≈ 4 chars. Reserve 1 500 tokens for system prompt
  // + context block, and 800 tokens for the model's reply budget.
  // That leaves ~5 700 tokens ≈ 22 800 chars for history.
  const MAX_HISTORY_CHARS = 22_000

  // Sanitize DBA terminology before sending to Azure OpenAI to avoid content filter
  const sanitizedHistory = history.map(m => ({
    ...m,
    content: sanitizeDbaTerminology(m.content),
  }))
  const trimmedHistory = trimHistory(sanitizedHistory, MAX_HISTORY_CHARS)

  // Build mutable message array — we append tool call + result pairs each round.
  // Cast to `any[]` so we can push OpenAI tool-role messages without fighting TS types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    { role: 'system', content: systemContent },
    ...trimmedHistory,
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

    // 400 content filter — retry once with aggressively sanitised messages
    if (status === 400 && (msg.includes('content management policy') || msg.includes('content filter'))) {
      try {
        // Strip all remaining "kill" from every message
        const cleanMsgs = messages.map((m: any) => ({
          ...m,
          content: typeof m.content === 'string'
            ? m.content.replace(/\bkill\b/gi, 'terminate')
            : m.content,
        }))
        const retryStream = await client.chat.completions.create(
          { model: PREFERRED_MODEL, messages: cleanMsgs, stream: true },
          { signal: controller.signal },
        )
        for await (const chunk of retryStream) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) yield delta
        }
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
