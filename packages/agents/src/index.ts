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

export interface AgentContext {
  connectionName?: string
  dbType?: string
  environment?: string
  healthScore?: number
  healthStatus?: string
  activeAlerts?: number
  metrics?: Record<string, unknown>
}

// ─── System prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPTS: Record<BotId, string> = {
  orabot: `You are OraBot, an expert Oracle Database AI assistant for ADORS (Automated Database Operations & Response System).
You specialize in Oracle RDBMS — including 11g through 23c — with deep knowledge of:
- AWR/ASH reports, wait events, execution plan analysis
- Tablespace management, undo / redo / archivelog pressure
- Blocking sessions, deadlocks, ORA-errors
- Data Guard replication, standby lag, apply/transport gaps
- SYSDBA-level commands, privileged operations and their risks
- Oracle Instant Client, thick/thin mode differences

When given health metrics, interpret them concisely. Suggest specific SQL or shell remediation steps. 
Always confirm risk level before suggesting destructive operations (ALTER SYSTEM KILL SESSION etc.).
Be concise — 3-6 sentences max unless asked to elaborate.`,

  msbot: `You are MsBot, an expert SQL Server AI assistant for ADORS (Automated Database Operations & Response System).
You specialize in SQL Server (2012–2022) and Azure SQL with deep knowledge of:
- DMVs, wait stats analysis, spinlock contention
- Buffer pool pressure, plan cache thrash, memory grants
- Always On AG health — primary/secondary role, sync state, queue depth
- Log shipping, database mirroring (deprecated but still in use)
- Blocking chains, CXPACKET / PAGEIOLATCH / SOS_SCHEDULER_YIELD waits
- Index fragmentation, statistics staleness, query store

When given health metrics, interpret them concisely. Suggest T-SQL solutions with risk notes.
Be concise — 3-6 sentences max unless asked to elaborate.`,

  marbot: `You are MarBot, an expert MariaDB AI assistant for ADORS (Automated Database Operations & Response System).
You specialize in MariaDB (10.4+) and MySQL-compatible databases with deep knowledge of:
- InnoDB buffer pool efficiency, hit ratio degradation
- Replication lag — slave IO/SQL thread, seconds_behind_master
- Slow query log analysis, long-running transactions
- Galera cluster split-brain, SST/IST operations
- Table/schema size growth, data directory space
- Connection pool saturation, max_connections tuning

When given health metrics, interpret them concisely. Suggest specific SQL or config remediation.
Be concise — 3-6 sentences max unless asked to elaborate.`,
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

function buildContextBlock(ctx: AgentContext): string {
  if (!ctx.connectionName) return ''
  const lines = [`[Current DB context]`]
  if (ctx.connectionName) lines.push(`Connection: ${ctx.connectionName} (${ctx.dbType ?? 'unknown'}, ${ctx.environment ?? 'unknown'})`)
  if (ctx.healthScore !== undefined) lines.push(`Health score: ${ctx.healthScore}/100 — ${ctx.healthStatus ?? 'unknown'}`)
  if (ctx.activeAlerts !== undefined) lines.push(`Active alerts: ${ctx.activeAlerts}`)
  if (ctx.metrics && Object.keys(ctx.metrics).length) {
    const snap = Object.entries(ctx.metrics)
      .filter(([, v]) => v !== null && v !== undefined)
      .slice(0, 10)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')
    if (snap) lines.push(`Recent metrics:\n${snap}`)
  }
  return lines.join('\n')
}

// ─── Main: streaming chat ─────────────────────────────────────────────────────

export async function* streamChat(
  botId: BotId,
  history: ChatMessage[],
  context?: AgentContext,
): AsyncGenerator<string> {
  const client = makeClient()

  if (!client) {
    yield 'GITHUB_TOKEN is not configured in the API environment. Set it in apps/api/.env to enable live AI responses.'
    return
  }

  const systemPrompt = SYSTEM_PROMPTS[botId]
  const contextBlock  = context ? buildContextBlock(context) : ''

  const messages: ChatMessage[] = [
    { role: 'system', content: contextBlock ? `${systemPrompt}\n\n${contextBlock}` : systemPrompt },
    ...history,
  ]

  try {
    const stream = await client.chat.completions.create({
      model:  PREFERRED_MODEL,
      messages,
      stream: true,
    })

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) yield delta
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)

    // Try fallback model once
    if (msg.includes('model') || msg.includes('404')) {
      try {
        const stream2 = await client.chat.completions.create({
          model:    FALLBACK_MODEL,
          messages,
          stream:   true,
        })
        for await (const chunk of stream2) {
          const delta = chunk.choices[0]?.delta?.content
          if (delta) yield delta
        }
        return
      } catch {
        // fall through to error yield
      }
    }

    yield `⚠️ Agent error: ${msg}`
  }
}
