import { BookOpen, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

type Script = {
  id: string
  name: string
  description: string
  db_type: 'oracle' | 'mssql' | 'mariadb'
  risk_level: 'zero' | 'low' | 'medium' | 'high'
  source: 'internal' | 'oem'
  verified_at: string | null
  created_at: string
}

async function getScripts(): Promise<Script[]> {
  try {
    const res = await fetch(`${API_URL}/api/scripts`, { next: { revalidate: 60 } })
    if (!res.ok) return []
    return (await res.json()).data ?? []
  } catch { return [] }
}

const RISK_CONFIG = {
  zero:   { label: 'Zero Risk', icon: ShieldCheck, cls: 'text-success bg-success/10 border-success/30' },
  low:    { label: 'Low',       icon: Shield,      cls: 'text-brand-400 bg-brand-500/10 border-brand-500/30' },
  medium: { label: 'Medium',    icon: ShieldAlert, cls: 'text-warning bg-warning/10 border-warning/30' },
  high:   { label: 'High',      icon: ShieldX,     cls: 'text-critical bg-critical/10 border-critical/30' },
}

const DB_COLORS = {
  oracle:  'text-[#F80000] bg-[#F80000]/10 border-[#F80000]/30',
  mssql:   'text-[#CC2927] bg-[#CC2927]/10 border-[#CC2927]/30',
  mariadb: 'text-[#003545] bg-[#003545]/10 border-[#003545]/20 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-700/30',
}

export default async function ScriptsPage() {
  const scripts = await getScripts()

  const byType = {
    oracle:  scripts.filter(s => s.db_type === 'oracle'),
    mssql:   scripts.filter(s => s.db_type === 'mssql'),
    mariadb: scripts.filter(s => s.db_type === 'mariadb'),
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <BookOpen className="w-6 h-6 text-brand-400" />
            Script Library
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Remediation scripts — UAT-verified before production execution
          </p>
        </div>
        <div className="flex gap-3 text-sm text-muted-foreground">
          <span><strong className="text-foreground">{scripts.length}</strong> scripts</span>
          <span><strong className="text-success">{scripts.filter(s => s.verified_at).length}</strong> verified</span>
        </div>
      </div>

      {/* Grid by DB type */}
      {(Object.entries(byType) as [keyof typeof byType, Script[]][]).map(([type, list]) => (
        <section key={type}>
          <div className="flex items-center gap-2 mb-3">
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded border font-mono', DB_COLORS[type])}>
              {type.toUpperCase()}
            </span>
            <span className="text-xs text-muted-foreground">{list.length} scripts</span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {list.map(script => <ScriptCard key={script.id} script={script} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

function ScriptCard({ script }: { script: Script }) {
  const risk = RISK_CONFIG[script.risk_level]
  const RiskIcon = risk.icon

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3 hover:border-border/60 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-foreground text-sm leading-snug">{script.name}</p>
        <span className={cn('shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wide', risk.cls)}>
          <RiskIcon className="w-3 h-3" />{risk.label}
        </span>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{script.description}</p>

      {/* SQL preview */}
      <pre className="rounded-md bg-muted/50 border border-border/50 px-3 py-2 text-[11px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
        {script.sql_content?.split('\n').slice(0, 2).join('\n')}
      </pre>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded border', script.source === 'oem' ? 'text-brand-400 border-brand-500/30 bg-brand-500/10' : 'text-muted-foreground border-border')}>
            {script.source.toUpperCase()}
          </span>
          {script.verified_at && (
            <span className="flex items-center gap-1 text-[10px] text-success">
              <ShieldCheck className="w-3 h-3" /> Sandbox verified
            </span>
          )}
        </div>
        <button className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors">
          Test in UAT →
        </button>
      </div>
    </div>
  )
}
