'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send, Sparkles, CheckCircle2, Loader2, AlertCircle, Search, BarChart2, Activity, ChevronRight, Wand2, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { OracleIcon, MssqlIcon, MariaDbIcon } from '@/components/brand/VendorIcons'
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
  rows?:           Record<string, unknown>[]
  columns?:        string[]
}

type Message = {
  id:        string
  role:      'user' | 'bot'
  content:   string
  toolCalls?: ToolCallState[]
}

type BotIcon = React.ComponentType<{ size?: number; className?: string }>

const BOT_CONFIG: Record<BotId, { name: string; dbType: string; color: string; hex: string; icon: BotIcon; intro: string[] }> = {
  orabot: {
    name: 'OraBot',
    dbType: 'Oracle',
    color: 'text-[#F80000]',
    hex:   '#F80000',
    icon: OracleIcon,
    intro: [
      "Hello! I'm **OraBot**, your Oracle Database AI assistant.",
      "I monitor your Oracle instances and can help diagnose issues, interpret AWR reports, and run diagnostic queries mid-conversation.",
      "Try asking: *\"What's the tablespace usage trend for PROD_ORA_01?\"* or *\"Show me blocked sessions\"*",
    ],
  },
  msbot: {
    name: 'MsBot',
    dbType: 'SQL Server',
    color: 'text-[#0078D4]',
    hex:   '#0078D4',
    icon: MssqlIcon,
    intro: [
      "Hi there! I'm **MsBot**, your SQL Server AI assistant.",
      "I track DMV metrics, memory pressure, plan cache efficiency, and can run live diagnostic queries for you.",
      "Try: *\"What are the top wait types on PROD_SQL_01?\"* or *\"Show me blocking chains\"*",
    ],
  },
  marbot: {
    name: 'MarBot',
    dbType: 'MariaDB',
    color: 'text-[#C0765A]',
    hex:   '#C0765A',
    icon: MariaDbIcon,
    intro: [
      "Hey! I'm **MarBot**, your MariaDB + replication AI assistant.",
      "I watch InnoDB buffer pool efficiency, replication lag, slow query trends, and can run queries live.",
      "Try: *\"Check replication lag on PROD_MAR_01\"* or *\"Show me the top slow queries\"*",
    ],
  },
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

// Strip any leftover control tokens from history (safety net)
function stripControlTokens(text: string): string {
  return text
    .replace(/\[TOOL_CALL:[^\]]+\]/g, '')
    .replace(/\[TOOL_RESULT:[^\]]+\]/g, '')
    .trim()
}

// ─── Collapsible result table ───────────────────────────────────────────────
function ResultTable({ columns, rows }: { columns: string[]; rows: Record<string, unknown>[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight className={cn('w-3 h-3 transition-transform duration-150', open && 'rotate-90')} />
        {open ? 'Hide' : 'Show'} {rows.length} row{rows.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1 rounded border border-border/50 overflow-x-auto max-h-52 overflow-y-auto">
          <table className="text-[11px] border-collapse min-w-full">
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map(c => (
                  <th key={c} className="px-2 py-1 text-left font-semibold text-muted-foreground bg-muted/80 border-b border-border/50 whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className={cn('border-b border-border/30', i % 2 === 0 ? 'bg-card' : 'bg-muted/20')}>
                  {columns.map(c => (
                    <td key={c} className="px-2 py-1 text-foreground/80 whitespace-nowrap max-w-[200px] truncate">
                      {row[c] == null
                        ? <span className="text-muted-foreground/40 italic">null</span>
                        : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Tool call badge ──────────────────────────────────────────────────────────
const TOOL_ICON: Record<string, React.ElementType> = {
  execute_query:    Search,
  get_fleet_health: Activity,
  get_analytics:    BarChart2,
}

const TOOL_VERB: Record<string, string> = {
  execute_query:    'Checking',
  get_fleet_health: 'Fetching fleet health',
  get_analytics:    'Analysing',
}

function ToolCallBadge({ tc, onRetry }: { tc: ToolCallState; onRetry?: (errorMsg: string) => void }) {
  const Icon  = TOOL_ICON[tc.name] ?? Search
  const verb  = TOOL_VERB[tc.name] ?? tc.name
  const label = tc.connectionName ? `${verb} ${tc.connectionName}` : verb

  if (tc.status === 'running') {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-0.5">
        <Loader2 className="w-3 h-3 animate-spin text-brand-400 flex-shrink-0" />
        <Icon className="w-3 h-3 opacity-50 flex-shrink-0" />
        <span className="italic">{label}…</span>
      </div>
    )
  }

  if (tc.status === 'error') {
    const isDbError = Boolean(tc.errorMsg && /ORA-\d|SQL Error|\[Microsoft\]|You have an error in your SQL/i.test(tc.errorMsg))
    return (
      <div className="flex flex-col gap-0.5 py-0.5">
        <div className="flex items-center gap-2 text-xs text-destructive/80">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />
          <Icon className="w-3 h-3 opacity-50 flex-shrink-0" />
          <span>{label}</span>
          {tc.errorMsg && <span className="opacity-70 truncate max-w-[260px]">— {tc.errorMsg}</span>}
        </div>
        {isDbError && onRetry && (
          <button
            onClick={() => onRetry(tc.errorMsg!)}
            className="flex items-center gap-1 text-[11px] text-brand-400 hover:text-brand-300 transition-colors w-fit ml-5"
          >
            <Wand2 className="w-3 h-3" />
            Ask bot to fix this
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 py-0.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0" />
        <Icon className="w-3 h-3 opacity-50 flex-shrink-0" />
        <span>{label}</span>
        {tc.rowCount !== undefined && (
          <span className="text-foreground/50">
            · {tc.rowCount} {tc.rowCount === 1 ? 'row' : 'rows'}
          </span>
        )}
        {tc.executionMs !== undefined && (
          <span className="opacity-40">· {tc.executionMs}ms</span>
        )}
      </div>
      {tc.columns && tc.rows && tc.rows.length > 0 && (
        <ResultTable columns={tc.columns} rows={tc.rows} />
      )}
    </div>
  )
}

// ─── Message renderer ─────────────────────────────────────────────────────────
function MessageContent({ content }: { content: string }) {
  const clean = stripControlTokens(content)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:          ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul:         ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol:         ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li:         ({ children }) => <li className="leading-snug">{children}</li>,
        strong:     ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:         ({ children }) => <em className="italic">{children}</em>,
        a:          ({ children, href }) => <a href={href} className="text-brand-400 underline" target="_blank" rel="noopener noreferrer">{children}</a>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-muted-foreground/40 pl-3 italic text-muted-foreground/80 my-2">{children}</blockquote>,
        h1:         ({ children }) => <h1 className="text-base font-bold mb-1 mt-2">{children}</h1>,
        h2:         ({ children }) => <h2 className="text-sm font-semibold mb-1 mt-2">{children}</h2>,
        h3:         ({ children }) => <h3 className="text-sm font-medium mb-1 mt-1">{children}</h3>,
        table:      ({ children }) => <div className="overflow-x-auto my-2"><table className="text-xs border-collapse w-full">{children}</table></div>,
        th:         ({ children }) => <th className="border border-border px-2 py-1 bg-muted font-semibold text-left">{children}</th>,
        td:         ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
        pre:        ({ children }) => <pre className="bg-muted/60 rounded-lg px-3 py-2 my-2 overflow-x-auto text-xs font-mono">{children}</pre>,
        code:       ({ className, children }) => (
          className
            ? <code className={className}>{children}</code>
            : <code className="bg-muted px-1 py-0.5 rounded text-[11px] font-mono">{children}</code>
        ),
      }}
    >
      {clean}
    </ReactMarkdown>
  )
}

function ChatColumn({ botId }: { botId: BotId }) {
  const config = BOT_CONFIG[botId]
  const [messages, setMessages] = useState<Message[]>(() =>
    config.intro.map((content, i) => ({ id: `intro-${i}`, role: 'bot', content }))
  )
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const saveTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // ── Load last session from Supabase ────────────────────────────────────────
  useEffect(() => {
    createClient().auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return
      const { data } = await createClient()
        .from('chat_sessions')
        .select('messages')
        .eq('user_id', session.user.id)
        .eq('bot_id', botId)
        .maybeSingle()
      if (data?.messages && Array.isArray(data.messages) && (data.messages as unknown[]).length > 0) {
        setMessages(data.messages as Message[])
      }
    })
  }, [botId])

  // ── Auto-save messages on change (debounced 1 s) ──────────────────────────
  useEffect(() => {
    const real = messages.filter(m => !m.id.startsWith('intro-'))
    if (real.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      await createClient()
        .from('chat_sessions')
        .upsert(
          { user_id: session.user.id, bot_id: botId, messages: real, updated_at: new Date().toISOString() },
          { onConflict: 'user_id,bot_id' },
        )
    }, 1000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [messages, botId])

  async function clearChat() {
    setMessages(config.intro.map((content, i) => ({ id: `intro-${i}`, role: 'bot', content })))
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) return
    await createClient()
      .from('chat_sessions')
      .delete()
      .eq('user_id', session.user.id)
      .eq('bot_id', botId)
  }

  function retryWithError(errorMsg: string) {
    setInput(`The last query failed with: "${errorMsg}". Please diagnose the issue and retry with a corrected query.`)
  }

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])

    // Build message history (exclude intro messages)
    const history = [...messages, userMsg]
      .filter(m => !m.id.startsWith('intro-'))
      .map(m => ({ role: m.role === 'bot' ? 'assistant' as const : 'user' as const, content: stripControlTokens(m.content) }))

    const { data } = await createClient().auth.getSession()
    const token = data.session?.access_token ?? ''

    const botMsgId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: botMsgId, role: 'bot', content: '', toolCalls: [] }])

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
      let   pendingEvent = 'message'   // current SSE event type

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          // Track typed SSE event name
          if (line.startsWith('event: ')) {
            pendingEvent = line.slice(7).trim()
            continue
          }

          // Empty line = end of SSE message block
          if (line === '') {
            pendingEvent = 'message'
            continue
          }

          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break

          // ── Tool start ────────────────────────────────────────────────────
          if (pendingEvent === 'tool_start') {
            try {
              const data = JSON.parse(raw) as { name: string; connectionName?: string; sql?: string }
              setMessages(prev => prev.map(msg => {
                if (msg.id !== botMsgId) return msg
                const newTc: ToolCallState = { name: data.name, connectionName: data.connectionName, sql: data.sql, status: 'running' }
                return { ...msg, toolCalls: [...(msg.toolCalls ?? []), newTc] }
              }))
            } catch { /* skip */ }
            pendingEvent = 'message'
            continue
          }

          // ── Tool result ───────────────────────────────────────────────────
          if (pendingEvent === 'tool_result') {
            try {
              const data = JSON.parse(raw) as {
                id: string; status: 'done' | 'error'
                rowCount?: number; executionMs?: number; error?: string
                rows?: Record<string, unknown>[]; columns?: string[]
              }
              setMessages(prev => prev.map(msg => {
                if (msg.id !== botMsgId) return msg
                // Update the most-recently-running tool call
                let matched = false
                const toolCalls = (msg.toolCalls ?? []).map(tc => {
                  if (!matched && tc.status === 'running') {
                    matched = true
                    return { ...tc, status: data.status, rowCount: data.rowCount, executionMs: data.executionMs, errorMsg: data.error, rows: data.rows, columns: data.columns }
                  }
                  return tc
                })
                return { ...msg, toolCalls }
              }))
            } catch { /* skip */ }
            pendingEvent = 'message'
            continue
          }

          // ── Text delta ────────────────────────────────────────────────────
          try {
            const { delta, error } = JSON.parse(raw)
            if (error) {
              setMessages(prev => prev.map(m => m.id === botMsgId ? { ...m, content: `⚠️ ${error}` } : m))
              continue
            }
            if (delta) {
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
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border"
        style={{ background: `linear-gradient(135deg, ${config.hex}22 0%, ${config.hex}08 60%, transparent 100%)` }}
      >
        <div className="relative">
          <div
            className="rounded-lg p-1"
            style={{ background: `${config.hex}18` }}
          >
            <config.icon size={28} className={cn(config.color)} />
          </div>
          <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success border-2 border-card" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground text-sm">{config.name}</span>
            <span
              className="text-[10px] font-bold px-1.5 py-px rounded uppercase tracking-wide"
              style={{ color: config.hex, border: `1px solid ${config.hex}50`, background: `${config.hex}15` }}
            >
              Online
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{config.dbType} AI Agent</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: `${config.hex}80` }} />
          <button
            onClick={clearChat}
            title="New chat"
            className="p-1 text-muted-foreground hover:text-destructive transition-colors rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={cn('flex gap-2', msg.role === 'user' && 'flex-row-reverse')}>
            {msg.role === 'bot' && <config.icon size={20} className={cn('shrink-0 mt-0.5', config.color)} />}
            <div className="flex flex-col gap-1.5 max-w-[85%]">

              {/* Tool call chain — shown as subtle thought steps above the reply */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="pl-3 border-l-2 border-brand-500/25 space-y-0.5 pb-1">
                  {msg.toolCalls.map((tc, i) => <ToolCallBadge key={i} tc={tc} onRetry={retryWithError} />)}
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

        {/* Typing indicator — only while streaming with no content yet */}
        {sending && messages[messages.length - 1]?.role === 'bot' && !messages[messages.length - 1]?.content && (
          <div className="flex gap-2">
            <config.icon size={20} className={cn('shrink-0 mt-0.5', config.color)} />
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
  const [activeBot, setActiveBot] = useState<BotId>('orabot')
  const config = BOT_CONFIG[activeBot]

  return (
    <div className="flex flex-col h-[calc(100vh-52px)] lg:h-screen px-3 py-3 sm:px-6 sm:py-6 gap-0">
      {/* Page header — hidden on mobile (top bar already shows ADORS) */}
      <div className="hidden sm:block mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <MessageCircle className="w-6 h-6 text-brand-400" />
          Bot Chat Hub
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          AI-powered agents with live DB context and tool calling — requires DBA role or above
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border mb-0">
        {(Object.entries(BOT_CONFIG) as [BotId, typeof config][]).map(([id, cfg]) => {
          const isActive = activeBot === id
          return (
            <button
              key={id}
              onClick={() => setActiveBot(id)}
              className={cn(
                'flex items-center gap-2 flex-1 sm:flex-none justify-center sm:justify-start px-3 sm:px-5 py-2.5 text-sm font-medium rounded-t-lg border border-b-0 transition-all relative',
                isActive
                  ? 'bg-card text-foreground border-border -mb-px z-10'
                  : 'bg-transparent text-muted-foreground border-transparent hover:text-foreground hover:bg-muted/30'
              )}
              style={isActive ? { borderTopColor: cfg.hex, borderTopWidth: 2 } : {}}
            >
              <cfg.icon size={16} className={isActive ? cfg.color : ''} />
              <span className="text-xs sm:text-sm">{cfg.name}</span>
              {/* dbType chip — desktop only */}
              <span
                className="hidden sm:inline text-[10px] font-bold px-1.5 py-px rounded uppercase tracking-wide"
                style={{
                  color:      isActive ? cfg.hex : undefined,
                  border:     isActive ? `1px solid ${cfg.hex}50` : '1px solid transparent',
                  background: isActive ? `${cfg.hex}15` : 'transparent',
                }}
              >
                {cfg.dbType}
              </span>
            </button>
          )
        })}
      </div>

      {/* Active bot — full width */}
      <div className="flex-1 min-h-0 border border-t-0 border-border rounded-b-xl rounded-tr-xl overflow-hidden">
        <ChatColumn key={activeBot} botId={activeBot} />
      </div>
    </div>
  )
}
