'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Bot, Send, Sparkles, Database, CheckCircle2, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/browser'

type BotId = 'orabot' | 'msbot' | 'marbot'

type ToolCallState = {
  name:            string
  connectionName?: string
  sql?:            string
  status:          'running' | 'done' | 'error'
  rowCount?:       number
  executionMs?:    number
  errorMsg?:       string
}

type Message = {
  id:         string
  role:       'user' | 'bot'
  content:    string
  timestamp:  Date
  toolCalls?: ToolCallState[]
}

const BOT_CONFIG: Record<BotId, { name: string; dbType: string; color: string; intro: string[] }> = {
  orabot: {
    name: 'OraBot',
    dbType: 'Oracle',
    color: 'text-[#F80000]',
    intro: [
      "Hello! I'm **OraBot**, your Oracle Database AI assistant.",
      "I monitor your Oracle instances and can help diagnose issues, interpret AWR reports, and run diagnostic queries mid-conversation.",
      "Try asking: *\"What's the tablespace usage trend for PROD_ORA_01?\"* or *\"Show me blocked sessions\"*",
    ],
  },
  msbot: {
    name: 'MsBot',
    dbType: 'SQL Server',
    color: 'text-[#CC2927]',
    intro: [
      "Hi there! I'm **MsBot**, your SQL Server AI assistant.",
      "I track DMV metrics, memory pressure, plan cache efficiency, and can run live diagnostic queries for you.",
      "Try: *\"What are the top wait types on PROD_SQL_01?\"* or *\"Show me blocking chains\"*",
    ],
  },
  marbot: {
    name: 'MarBot',
    dbType: 'MariaDB',
    color: 'text-blue-400',
    intro: [
      "Hey! I'm **MarBot**, your MariaDB + replication AI assistant.",
      "I watch InnoDB buffer pool efficiency, replication lag, slow query trends, and can run queries live.",
      "Try: *\"Check replication lag on PROD_MAR_01\"* or *\"Show me the top slow queries\"*",
    ],
  },
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// ─── Tool call token parsers ──────────────────────────────────────────────────
// Tokens emitted by the agent: [TOOL_CALL:name:jsonArgs] and [TOOL_RESULT:id:jsonResult]
// We strip these from the visible message and surface them as inline badges.

const TOOL_CALL_RE  = /\[TOOL_CALL:([^:]+):(\{.*?\})\]/g
const TOOL_RESULT_RE = /\[TOOL_RESULT:[^:]+:(\{.*?\})\]/g

function parseToolCallToken(match: RegExpMatchArray): Partial<ToolCallState> & { name: string } {
  const name = match[1]!
  try {
    const args = JSON.parse(match[2] ?? '{}')
    return { name, connectionName: args.connectionName, sql: args.sql }
  } catch {
    return { name }
  }
}

function parseToolResultToken(jsonStr: string): Pick<ToolCallState, 'status' | 'rowCount' | 'executionMs' | 'errorMsg'> {
  try {
    const res = JSON.parse(jsonStr)
    if (res.error) return { status: 'error', errorMsg: res.error }
    return { status: 'done', rowCount: res.rowCount, executionMs: res.executionMs }
  } catch {
    return { status: 'done' }
  }
}

// Remove all agent control tokens from the visible text
function stripControlTokens(text: string): string {
  return text
    .replace(/\[TOOL_CALL:[^\]]+\]/g, '')
    .replace(/\[TOOL_RESULT:[^\]]+\]/g, '')
    .trim()
}

// ─── Tool call badge ──────────────────────────────────────────────────────────
function ToolCallBadge({ tc }: { tc: ToolCallState }) {
  const label = tc.connectionName
    ? `${tc.name === 'execute_query' ? 'Querying' : tc.name} ${tc.connectionName}`
    : tc.name

  if (tc.status === 'running') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg px-2 py-1 w-fit">
        <Loader2 className="w-3 h-3 animate-spin text-brand-400" />
        <Database className="w-3 h-3 text-muted-foreground" />
        <span>{label}…</span>
      </div>
    )
  }

  if (tc.status === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-2 py-1 w-fit">
        <Database className="w-3 h-3" />
        <span>{label} — {tc.errorMsg ?? 'error'}</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/30 border border-border/50 rounded-lg px-2 py-1 w-fit">
      <CheckCircle2 className="w-3 h-3 text-success" />
      <Database className="w-3 h-3" />
      <span>{label}</span>
      {tc.rowCount !== undefined && (
        <span className="text-success">{tc.rowCount} row{tc.rowCount !== 1 ? 's' : ''}</span>
      )}
      {tc.executionMs !== undefined && (
        <span className="opacity-60">{tc.executionMs}ms</span>
      )}
    </div>
  )
}

// ─── Message renderer ─────────────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  const clean = stripControlTokens(content)
  return (
    <>
      {clean.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((part, i) =>
        part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
          : part.startsWith('*') ? <em key={i}>{part.slice(1, -1)}</em>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

function ChatColumn({ botId }: { botId: BotId }) {
  const config = BOT_CONFIG[botId]
  const [messages, setMessages] = useState<Message[]>(() =>
    config.intro.map((content, i) => ({ id: `intro-${i}`, role: 'bot', content, timestamp: new Date() }))
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])

    // Build message history (exclude intro messages)
    const history = [...messages, userMsg]
      .filter(m => !m.id.startsWith('intro-'))
      .map(m => ({ role: m.role === 'bot' ? 'assistant' as const : 'user' as const, content: stripControlTokens(m.content) }))

    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token ?? ''

    const botMsgId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: botMsgId, role: 'bot', content: '', timestamp: new Date(), toolCalls: [] }])

    try {
      const response = await fetch(`${API_URL}/api/agents/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ botId, messages: history }),
      })

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => 'Request failed')
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${errText}` } : m))
        return
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''
      // We track active tool call index by name — one at a time per round
      let   activeToolCallIndex = -1

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break

          try {
            const { delta, error } = JSON.parse(raw)
            if (error) {
              setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${error}` } : m))
              continue
            }
            if (!delta) continue

            // Check for TOOL_CALL token in this delta chunk
            const tcMatch = [...delta.matchAll(TOOL_CALL_RE)]
            if (tcMatch.length > 0) {
              for (const m of tcMatch) {
                const parsed = parseToolCallToken(m as RegExpMatchArray)
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== botMsgId) return msg
                  const toolCalls = [...(msg.toolCalls ?? []), { ...parsed, status: 'running' as const }]
                  activeToolCallIndex = toolCalls.length - 1
                  return { ...msg, toolCalls }
                }))
              }
            }

            // Check for TOOL_RESULT token
            const trMatch = [...delta.matchAll(TOOL_RESULT_RE)]
            if (trMatch.length > 0 && activeToolCallIndex >= 0) {
              for (const m of trMatch) {
                const resultState = parseToolResultToken(m[1] ?? '{}')
                const idx = activeToolCallIndex
                setMessages(prev => prev.map(msg => {
                  if (msg.id !== botMsgId) return msg
                  const toolCalls = (msg.toolCalls ?? []).map((tc, i) =>
                    i === idx ? { ...tc, ...resultState } : tc
                  )
                  return { ...msg, toolCalls }
                }))
              }
            }

            // Append visible content (strip control tokens)
            const visible = delta
              .replace(/\[TOOL_CALL:[^\]]+\]/g, '')
              .replace(/\[TOOL_RESULT:[^\]]+\]/g, '')
            if (visible) {
              setMessages(prev => prev.map(m =>
                m.id === botMsgId ? { ...m, content: m.content + visible } : m
              ))
            }
          } catch { /* malformed line — skip */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection error'
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${msg}` } : m))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="relative">
          <Bot className={cn('w-8 h-8', config.color)} />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{config.name}</span>
            <span className="text-[10px] font-bold text-success border border-success/30 bg-success/10 px-1.5 py-px rounded uppercase tracking-wide">
              Online
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{config.dbType} AI Agent</p>
        </div>
        <div className="ml-auto">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
            {msg.role === 'bot' && <Bot className={cn('w-5 h-5 shrink-0 mt-0.5', config.color)} />}
            <div className="flex flex-col gap-1.5 max-w-[85%]">
              {/* Tool call badges — shown above the text response */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="flex flex-col gap-1">
                  {msg.toolCalls.map((tc, i) => <ToolCallBadge key={i} tc={tc} />)}
                </div>
              )}
              {/* Message bubble */}
              {(stripControlTokens(msg.content) || msg.role === 'user') && (
                <div className={cn(
                  'rounded-xl px-3 py-2 text-sm leading-relaxed',
                  msg.role === 'bot'
                    ? 'bg-muted/50 border border-border/50 text-foreground'
                    : 'bg-brand-500 text-white'
                )}>
                  <MessageContent content={msg.content} />
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && messages[messages.length - 1]?.id && !messages[messages.length - 1]?.content && (
          <div className="flex gap-2">
            <Bot className={cn('w-5 h-5 shrink-0 mt-0.5', config.color)} />
            <div className="bg-muted/50 border border-border/50 rounded-xl px-3 py-2">
              <span className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={`Ask ${config.name}…`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="p-1 text-brand-400 hover:text-brand-300 disabled:opacity-30 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MessageCircle className="w-6 h-6 text-brand-400" />
          Bot Chat Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          AI-powered agents with live DB context and tool calling — requires DBA role or above
        </p>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        <ChatColumn botId="orabot" />
        <ChatColumn botId="msbot" />
        <ChatColumn botId="marbot" />
      </div>
    </div>
  )
}


const BOT_CONFIG: Record<BotId, { name: string; dbType: string; color: string; intro: string[] }> = {
  orabot: {
    name: 'OraBot',
    dbType: 'Oracle',
    color: 'text-[#F80000]',
    intro: [
      "Hello! I'm **OraBot**, your Oracle Database AI assistant.",
      "I monitor your Oracle instances and can help you diagnose issues, interpret AWR reports, and execute remediation scripts after UAT verification.",
      "Try asking: *\"Why is tablespace USERS at 89%?\"* or *\"Kill blocking session 142\"*",
    ],
  },
  msbot: {
    name: 'MsBot',
    dbType: 'SQL Server',
    color: 'text-[#CC2927]',
    intro: [
      "Hi there! I'm **MsBot**, your SQL Server AI assistant.",
      "I track DMV metrics, memory pressure, plan cache efficiency, and can walk you through resolving blocking chains.",
      "Try: *\"What's causing the CXPACKET waits?\"* or *\"Show me the top 5 longest running queries\"*",
    ],
  },
  marbot: {
    name: 'MarBot',
    dbType: 'MariaDB',
    color: 'text-blue-400',
    intro: [
      "Hey! I'm **MarBot**, your MariaDB + replication AI assistant.",
      "I watch InnoDB buffer pool efficiency, replication lag, slow query trends, and can help optimize your database configuration.",
      "Try: *\"Replication lag is 45 seconds — what do I do?\"* or *\"InnoDB hit ratio dropped to 82%\"*",
    ],
  },
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

function ChatColumn({ botId }: { botId: BotId }) {
  const config = BOT_CONFIG[botId]
  const [messages, setMessages] = useState<Message[]>(() =>
    config.intro.map((content, i) => ({ id: `intro-${i}`, role: 'bot', content, timestamp: new Date() }))
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])

    // Build message history (exclude intro messages — they start with intro- id)
    const history = [...messages, userMsg]
      .filter(m => !m.id.startsWith('intro-'))
      .map(m => ({ role: m.role === 'bot' ? 'assistant' as const : 'user' as const, content: m.content }))

    // Get JWT
    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token ?? ''

    const botMsgId = crypto.randomUUID()
    const botMsg: Message = { id: botMsgId, role: 'bot', content: '', timestamp: new Date() }
    setMessages(prev => [...prev, botMsg])

    try {
      const response = await fetch(`${API_URL}/api/agents/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ botId, messages: history }),
      })

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => 'Request failed')
        setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${errText}` } : m))
        return
      }

      const reader  = response.body.getReader()
      const decoder = new TextDecoder()
      let   buffer  = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const { delta, error } = JSON.parse(raw)
            if (error) {
              setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${error}` } : m))
            } else if (delta) {
              setMessages(prev => prev.map(m =>
                m.id === botMsgId ? { ...m, content: m.content + delta } : m
              ))
            }
          } catch { /* malformed line — skip */ }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connection error'
      setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${msg}` } : m))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/20">
        <div className="relative">
          <Bot className={cn('w-8 h-8', config.color)} />
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{config.name}</span>
            <span className="text-[10px] font-bold text-success border border-success/30 bg-success/10 px-1.5 py-px rounded uppercase tracking-wide">
              Online
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{config.dbType} AI Agent</p>
        </div>
        <div className="ml-auto">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
            {msg.role === 'bot' && <Bot className={cn('w-5 h-5 shrink-0 mt-0.5', config.color)} />}
            <div className={cn(
              'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
              msg.role === 'bot'
                ? 'bg-muted/50 border border-border/50 text-foreground'
                : 'bg-brand-500 text-white'
            )}>
              {/* Basic markdown-like bold + italic */}
              {msg.content.split(/(\*\*.*?\*\*|\*.*?\*)/g).map((part, i) =>
                part.startsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
                  : part.startsWith('*') ? <em key={i}>{part.slice(1, -1)}</em>
                  : <span key={i}>{part}</span>
              )}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex gap-2">
            <Bot className={cn('w-5 h-5 shrink-0 mt-0.5', config.color)} />
            <div className="bg-muted/50 border border-border/50 rounded-xl px-3 py-2">
              <span className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-border">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
          <input
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            placeholder={`Ask ${config.name}…`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && send()}
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="p-1 text-brand-400 hover:text-brand-300 disabled:opacity-30 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <div className="flex flex-col h-screen p-6 gap-4">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MessageCircle className="w-6 h-6 text-brand-400" />
          Bot Chat Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          AI-powered agents with live DB context — set GITHUB_TOKEN in API env to enable
        </p>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-4 min-h-0">
        <ChatColumn botId="orabot" />
        <ChatColumn botId="msbot" />
        <ChatColumn botId="marbot" />
      </div>
    </div>
  )
}
