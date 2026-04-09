'use client'

import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Bot, Send, Sparkles, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

type BotId = 'orabot' | 'msbot' | 'marbot'

type Message = {
  id: string
  role: 'user' | 'bot'
  content: string
  timestamp: Date
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

const PLACEHOLDER_REPLY = "I'm in standby mode — agent wiring is coming in Phase 3. For now, I can show you the interface 🔧"

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

    // Phase 3: replace with real agent API call
    await new Promise(r => setTimeout(r, 600))
    const botMsg: Message = { id: crypto.randomUUID(), role: 'bot', content: PLACEHOLDER_REPLY, timestamp: new Date() }
    setMessages(prev => [...prev, botMsg])
    setSending(false)
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

      {/* Phase 3 notice */}
      <div className="mx-3 mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        Agent wiring arrives in Phase 3. This is the chat shell.
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
          Conversational AI agents for each database type — Phase 3 wiring pending
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
