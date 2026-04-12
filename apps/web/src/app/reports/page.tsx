'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import {
  Download,
  TrendingUp,
  Activity,
  Shield,
  AlertTriangle,
  ClipboardList,
  Loader2,
  Database,
  HardDrive,
  ChevronDown,
  ChevronUp,
  Filter,
  Settings2,
  GitCompare,
  X,
  Check,
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  AreaChart, Area,
} from 'recharts'

// ─── Types ───────────────────────────────────────────────────────────────────

type ReportTab = 'capacity' | 'fleet' | 'dr-readiness' | 'incidents' | 'audit'

const TABS: { key: ReportTab; label: string; icon: typeof TrendingUp; minRole?: string }[] = [
  { key: 'capacity',     label: 'Capacity Trends',  icon: TrendingUp },
  { key: 'fleet',        label: 'Fleet Health',      icon: Activity },
  { key: 'dr-readiness', label: 'DR Readiness',      icon: Shield,         minRole: 'dba' },
  { key: 'incidents',    label: 'Incidents',         icon: AlertTriangle },
  { key: 'audit',        label: 'Audit Trail',       icon: ClipboardList,  minRole: 'dba' },
]

const STATUS_COLORS: Record<string, string> = {
  healthy: '#22c55e', warning: '#f59e0b', critical: '#ef4444', unknown: '#6b7280',
}

const DB_COLORS: Record<string, string> = {
  oracle: '#F80000', mssql: '#CC2927', mariadb: '#3b82f6',
}

const PIE_COLORS = ['#22c55e', '#f59e0b', '#ef4444', '#6b7280', '#3b82f6']

// ─── Threshold defaults ──────────────────────────────────────────────────────

interface Threshold {
  metric_key: string
  label: string
  warning_threshold: number
  critical_threshold: number
  unit: string
}

const DEFAULT_THRESHOLDS: Threshold[] = [
  { metric_key: 'storage_pct',     label: 'Storage Usage',    warning_threshold: 70, critical_threshold: 85, unit: '%' },
  { metric_key: 'connections_pct', label: 'Connection Usage',  warning_threshold: 70, critical_threshold: 85, unit: '%' },
  { metric_key: 'memory_pct',      label: 'Memory Usage',      warning_threshold: 70, critical_threshold: 85, unit: '%' },
  { metric_key: 'cpu_pct',         label: 'CPU Usage',         warning_threshold: 70, critical_threshold: 85, unit: '%' },
]

function getThreshold(thresholds: Threshold[], key: string) {
  return thresholds.find(t => t.metric_key === key) ?? DEFAULT_THRESHOLDS.find(t => t.metric_key === key)!
}

function thresholdColor(value: number | null, thresholds: Threshold[], key: string): string {
  if (value == null) return 'text-muted-foreground'
  const t = getThreshold(thresholds, key)
  if (value >= t.critical_threshold) return 'text-red-500'
  if (value >= t.warning_threshold) return 'text-amber-500'
  return 'text-green-500'
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('capacity')
  const [days, setDays] = useState(30)
  const [thresholds, setThresholds] = useState<Threshold[]>(DEFAULT_THRESHOLDS)
  const [showThresholds, setShowThresholds] = useState(false)

  // Load thresholds once
  useEffect(() => {
    api.settings.getThresholds()
      .then(r => { if (r.data?.length) setThresholds(r.data) })
      .catch(() => {})
  }, [])

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fleet analytics, capacity planning, incident history &amp; audit trail
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThresholds(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors"
            title="Configure thresholds"
          >
            <Settings2 size={14} /> Thresholds
          </button>
          <DaysSelector value={days} onChange={setDays} />
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b border-border overflow-x-auto pb-px -mb-px">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-2">
        {tab === 'capacity'     && <CapacityTab days={days} thresholds={thresholds} />}
        {tab === 'fleet'        && <FleetTab />}
        {tab === 'dr-readiness' && <DrReadinessTab />}
        {tab === 'incidents'    && <IncidentsTab days={days} />}
        {tab === 'audit'        && <AuditTab days={days} />}
      </div>

      {/* Threshold Config Modal */}
      {showThresholds && (
        <ThresholdModal
          thresholds={thresholds}
          onClose={() => setShowThresholds(false)}
          onSave={(updated) => { setThresholds(updated); setShowThresholds(false) }}
        />
      )}
    </div>
  )
}

// ─── Days Selector ───────────────────────────────────────────────────────────

function DaysSelector({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  const opts = [7, 14, 30, 60, 90]
  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
      {opts.map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
            value === d ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {d}d
        </button>
      ))}
    </div>
  )
}

// ─── Threshold Config Modal ──────────────────────────────────────────────────

function ThresholdModal({
  thresholds,
  onClose,
  onSave,
}: {
  thresholds: Threshold[]
  onClose: () => void
  onSave: (t: Threshold[]) => void
}) {
  const [draft, setDraft] = useState<Threshold[]>(thresholds.map(t => ({ ...t })))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const update = (key: string, field: 'warning_threshold' | 'critical_threshold', value: number) => {
    setDraft(prev => prev.map(t => t.metric_key === key ? { ...t, [field]: value } : t))
  }

  const handleSave = async () => {
    // Validate: warning < critical
    for (const t of draft) {
      if (t.warning_threshold >= t.critical_threshold) {
        setError(`${t.label}: warning must be less than critical`)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await api.settings.updateThresholds(
        draft.map(t => ({ metric_key: t.metric_key, warning_threshold: t.warning_threshold, critical_threshold: t.critical_threshold }))
      )
      onSave(draft)
    } catch (e: any) {
      setError(e.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-card rounded-xl border border-border shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">Metric Thresholds</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Configure warning and critical thresholds for capacity metrics. Values are percentages.
        </p>

        <div className="space-y-4">
          {draft.map(t => (
            <div key={t.metric_key} className="grid grid-cols-[1fr_100px_100px] gap-3 items-center">
              <span className="text-sm font-medium">{t.label}</span>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Warning</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.warning_threshold}
                  onChange={e => update(t.metric_key, 'warning_threshold', Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-amber-500 font-semibold"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase">Critical</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={t.critical_threshold}
                  onChange={e => update(t.metric_key, 'critical_threshold', Number(e.target.value))}
                  className="w-full px-2 py-1.5 text-sm border border-border rounded-lg bg-background text-red-500 font-semibold"
                />
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-xs text-red-500 mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── CSV Export Helper ───────────────────────────────────────────────────────

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Export Button ───────────────────────────────────────────────────────────

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted transition-colors shadow-sm"
    >
      <Download size={14} /> Export CSV
    </button>
  )
}

// ─── Loading / Error ─────────────────────────────────────────────────────────

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center py-20 text-destructive text-sm">
      {message}
    </div>
  )
}

// ─── Card wrapper ────────────────────────────────────────────────────────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      {children}
    </div>
  )
}

// ─── Stat Pill ───────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex flex-col items-center px-5 py-3 bg-muted/50 rounded-xl border border-border/50 min-w-[110px]">
      <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
      <span className={`text-xl font-bold mt-0.5 ${color ?? ''}`}>{value}</span>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: Capacity Trends
// ═════════════════════════════════════════════════════════════════════════════

function CapacityTab({ days, thresholds }: { days: number; thresholds: Threshold[] }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareIds, setCompareIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setLoading(true)
    api.reports.capacity(days)
      .then(r => { setData(r.data); setError('') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const conns: any[] = data.connections ?? []

  const exportCsv = () => {
    const headers = ['Connection', 'DB Type', 'Environment', 'Storage %', 'Connections %', 'Memory %', 'Throughput']
    const rows = conns.map(c => [
      c.connection_name, c.db_type, c.environment,
      String(c.current.storage_pct ?? ''), String(c.current.connections_pct ?? ''),
      String(c.current.memory_pct ?? ''), String(c.current.throughput ?? ''),
    ])
    downloadCsv(`capacity-report-${days}d.csv`, headers, rows)
  }

  // Summary: fleet averages
  const avg = (key: string) => {
    const vals = conns.map(c => c.current[key]).filter((v: any) => v != null)
    return vals.length ? Math.round(vals.reduce((a: number, b: number) => a + b, 0) / vals.length) : '—'
  }

  return (
    <div className="space-y-5">
      {/* Summary pills */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-3 flex-wrap">
          <StatPill label="Avg Storage" value={`${avg('storage_pct')}%`} />
          <StatPill label="Avg Connections" value={`${avg('connections_pct')}%`} />
          <StatPill label="Avg Memory" value={`${avg('memory_pct')}%`} />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCompareMode(!compareMode); setCompareIds(new Set()) }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border rounded-lg transition-colors shadow-sm ${
              compareMode
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border hover:bg-muted'
            }`}
          >
            <GitCompare size={14} /> {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          <ExportButton onClick={exportCsv} />
        </div>
      </div>

      {/* Comparison overlay charts */}
      {compareMode && compareIds.size >= 2 && (
        <ComparisonPanel
          connections={conns.filter(c => compareIds.has(c.connection_id))}
          thresholds={thresholds}
        />
      )}
      {compareMode && compareIds.size < 2 && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-4 py-3 border border-border/50">
          Select 2–5 connections below to compare side by side
        </div>
      )}

      {/* Per-connection cards */}
      {conns.map(conn => (
        <Card key={conn.connection_id}>
          <div className="flex items-center gap-3">
            {compareMode && (
              <input
                type="checkbox"
                checked={compareIds.has(conn.connection_id)}
                onChange={() => {
                  setCompareIds(prev => {
                    const next = new Set(prev)
                    if (next.has(conn.connection_id)) next.delete(conn.connection_id)
                    else if (next.size < 5) next.add(conn.connection_id)
                    return next
                  })
                }}
                className="h-4 w-4 rounded border-border accent-primary shrink-0"
              />
            )}
            <button
              className="w-full flex items-center justify-between gap-4"
              onClick={() => !compareMode && setExpandedId(expandedId === conn.connection_id ? null : conn.connection_id)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 rounded-lg bg-muted/60">
                  <Database size={16} className="text-muted-foreground" />
                </div>
                <div className="text-left min-w-0">
                  <span className="font-semibold text-sm">{conn.connection_name}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] px-1.5 py-0.5 rounded-md font-medium" style={{ backgroundColor: DB_COLORS[conn.db_type] + '18', color: DB_COLORS[conn.db_type] }}>
                      {conn.db_type}
                    </span>
                    <span className="text-[11px] text-muted-foreground capitalize">{conn.environment}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-5 shrink-0">
                <CapacityMini label="Storage" value={conn.current.storage_pct} color={thresholdColor(conn.current.storage_pct, thresholds, 'storage_pct')} />
                <CapacityMini label="Conn" value={conn.current.connections_pct} color={thresholdColor(conn.current.connections_pct, thresholds, 'connections_pct')} />
                <CapacityMini label="Memory" value={conn.current.memory_pct} color={thresholdColor(conn.current.memory_pct, thresholds, 'memory_pct')} />
                {!compareMode && (
                  <div className="text-muted-foreground">
                    {expandedId === conn.connection_id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                )}
              </div>
            </button>
          </div>

          {expandedId === conn.connection_id && conn.trend.length > 0 && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <CapacityChart data={conn.trend} dataKey="storage_pct" label="Storage %" color="#f59e0b" />
                <CapacityChart data={conn.trend} dataKey="connections_pct" label="Connections %" color="#3b82f6" />
                <CapacityChart data={conn.trend} dataKey="memory_pct" label="Memory %" color="#8b5cf6" />
              </div>

              {/* Disk / Mount / Filegroup breakdown */}
              <DiskBreakdown
                dbType={conn.db_type}
                diskMounts={conn.current.disk_mounts ?? []}
                filegroupBreakdown={conn.current.filegroup_breakdown ?? []}
              />
            </div>
          )}
          {expandedId === conn.connection_id && conn.trend.length === 0 && (
            <p className="mt-4 text-xs text-muted-foreground text-center py-6">No snapshot data in this window</p>
          )}
        </Card>
      ))}

      {conns.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-10">No connections found</p>
      )}
    </div>
  )
}

function CapacityMini({ label, value, color: colorOverride }: { label: string; value: number | null; color?: string }) {
  const pct = value ?? 0
  const color = colorOverride ?? (pct > 85 ? 'text-red-500' : pct > 70 ? 'text-amber-500' : 'text-green-500')
  return (
    <div className="text-right">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${value != null ? color : 'text-muted-foreground'}`}>
        {value != null ? `${value}%` : '—'}
      </div>
    </div>
  )
}

function CapacityChart({ data, dataKey, label, color }: { data: any[]; dataKey: string; label: string; color: string }) {
  const formatted = data.filter(d => d[dataKey] != null).map(d => ({
    t: new Date(d.t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    v: d[dataKey],
  }))
  if (formatted.length === 0) return <div className="text-xs text-muted-foreground text-center py-8">{label}: no data</div>

  return (
    <div>
      <h4 className="text-xs font-medium text-muted-foreground mb-2">{label}</h4>
      <ResponsiveContainer width="100%" height={140}>
        <AreaChart data={formatted}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.2} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Area type="monotone" dataKey="v" stroke={color} fill={`url(#grad-${dataKey})`} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

// ─── Disk / Mount / Filegroup Breakdown ──────────────────────────────────────

function DiskBreakdown({ dbType, diskMounts, filegroupBreakdown }: {
  dbType: string
  diskMounts: any[]
  filegroupBreakdown: any[]
}) {
  if (diskMounts.length === 0 && filegroupBreakdown.length === 0) return null

  const progressBar = (pct: number) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: pct > 90 ? '#ef4444' : pct > 75 ? '#f59e0b' : '#22c55e' }} />
      </div>
      <span className="text-xs tabular-nums w-12 text-right">{pct.toFixed(1)}%</span>
    </div>
  )

  const mountLabel = dbType === 'oracle' ? 'Tablespace Breakdown' : dbType === 'mariadb' ? 'Schema Storage' : 'Disk Volumes'

  return (
    <div className="space-y-4">
      {diskMounts.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <HardDrive className="h-3 w-3" />{mountLabel}
          </h4>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-1.5 font-medium">{dbType === 'oracle' ? 'Tablespace' : dbType === 'mariadb' ? 'Schema' : 'Mount'}</th>
                  {dbType === 'mssql' && <th className="text-left px-3 py-1.5 font-medium">Label</th>}
                  <th className="text-right px-3 py-1.5 font-medium">Used GB</th>
                  <th className="text-right px-3 py-1.5 font-medium">Total GB</th>
                  {dbType !== 'mariadb' && <th className="text-right px-3 py-1.5 font-medium">Free GB</th>}
                  <th className="px-3 py-1.5 font-medium w-40">Usage</th>
                </tr>
              </thead>
              <tbody>
                {diskMounts.map((d: any, i: number) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-1.5 font-mono">{d.mount}</td>
                    {dbType === 'mssql' && <td className="px-3 py-1.5">{d.label ?? '—'}</td>}
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(d.used_gb).toFixed(2)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(d.total_gb).toFixed(2)}</td>
                    {dbType !== 'mariadb' && <td className="px-3 py-1.5 text-right tabular-nums">{Number(d.free_gb).toFixed(2)}</td>}
                    <td className="px-3 py-1.5">{progressBar(Number(d.used_pct))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {filegroupBreakdown.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Database className="h-3 w-3" />Filegroup Breakdown
          </h4>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-3 py-1.5 font-medium">Database</th>
                  <th className="text-left px-3 py-1.5 font-medium">Filegroup</th>
                  <th className="text-left px-3 py-1.5 font-medium">Type</th>
                  <th className="text-left px-3 py-1.5 font-medium">Logical Name</th>
                  <th className="text-right px-3 py-1.5 font-medium">Allocated GB</th>
                  <th className="text-right px-3 py-1.5 font-medium">Used GB</th>
                  <th className="text-left px-3 py-1.5 font-medium">Auto Growth</th>
                </tr>
              </thead>
              <tbody>
                {filegroupBreakdown.map((fg: any, i: number) => (
                  <tr key={i} className="border-t border-border/50">
                    <td className="px-3 py-1.5 font-mono">{fg.db_name}</td>
                    <td className="px-3 py-1.5">{fg.filegroup_name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{fg.fg_type}</td>
                    <td className="px-3 py-1.5 font-mono text-muted-foreground">{fg.logical_name}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(fg.allocated_gb).toFixed(3)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(fg.used_gb).toFixed(3)}</td>
                    <td className="px-3 py-1.5">{fg.auto_growth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Comparison Panel ────────────────────────────────────────────────────────

const COMPARE_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6']

function ComparisonPanel({ connections, thresholds }: { connections: any[]; thresholds: Threshold[] }) {
  const metrics = [
    { key: 'storage_pct', label: 'Storage %', thresholdKey: 'storage_pct' },
    { key: 'connections_pct', label: 'Connections %', thresholdKey: 'connections_pct' },
    { key: 'memory_pct', label: 'Memory %', thresholdKey: 'memory_pct' },
  ]

  // Merge trends onto shared time axis
  const buildOverlay = (metricKey: string) => {
    const dateMap: Record<string, Record<string, number>> = {}
    connections.forEach((conn, idx) => {
      for (const point of conn.trend ?? []) {
        const t = new Date(point.t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
        if (!dateMap[t]) dateMap[t] = { t: t as any }
        dateMap[t][`v${idx}`] = point[metricKey] ?? 0
      }
    })
    return Object.values(dateMap).sort((a, b) => String(a.t).localeCompare(String(b.t)))
  }

  return (
    <Card className="!p-6">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
        <GitCompare size={15} /> Comparison — {connections.map(c => c.connection_name).join(' vs ')}
      </h3>
      <p className="text-xs text-muted-foreground mb-4">Overlay views for selected connections</p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {metrics.map(m => {
          const overlayData = buildOverlay(m.key)
          const t = getThreshold(thresholds, m.thresholdKey)
          return (
            <div key={m.key}>
              <h4 className="text-xs font-medium text-muted-foreground mb-2">{m.label}</h4>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={overlayData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="t" tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                  {/* Threshold reference lines */}
                  <CartesianGrid y={t.warning_threshold} strokeDasharray="0" />
                  {connections.map((conn, idx) => (
                    <Line
                      key={conn.connection_id}
                      type="monotone"
                      dataKey={`v${idx}`}
                      name={conn.connection_name}
                      stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )
        })}
      </div>

      {/* Side-by-side current values */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="pb-2 pr-4">Connection</th>
              <th className="pb-2 pr-4">Type</th>
              <th className="pb-2 pr-4">Storage</th>
              <th className="pb-2 pr-4">Connections</th>
              <th className="pb-2 pr-4">Memory</th>
              <th className="pb-2">Throughput</th>
            </tr>
          </thead>
          <tbody>
            {connections.map((conn, idx) => (
              <tr key={conn.connection_id} className="border-b border-border/50 last:border-0">
                <td className="py-2 pr-4 font-medium flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }} />
                  {conn.connection_name}
                </td>
                <td className="py-2 pr-4">
                  <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: DB_COLORS[conn.db_type] + '20', color: DB_COLORS[conn.db_type] }}>
                    {conn.db_type}
                  </span>
                </td>
                <td className={`py-2 pr-4 font-semibold ${thresholdColor(conn.current.storage_pct, thresholds, 'storage_pct')}`}>
                  {conn.current.storage_pct != null ? `${conn.current.storage_pct}%` : '—'}
                </td>
                <td className={`py-2 pr-4 font-semibold ${thresholdColor(conn.current.connections_pct, thresholds, 'connections_pct')}`}>
                  {conn.current.connections_pct != null ? `${conn.current.connections_pct}%` : '—'}
                </td>
                <td className={`py-2 pr-4 font-semibold ${thresholdColor(conn.current.memory_pct, thresholds, 'memory_pct')}`}>
                  {conn.current.memory_pct != null ? `${conn.current.memory_pct}%` : '—'}
                </td>
                <td className="py-2 text-muted-foreground">{conn.current.throughput ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: Fleet Health
// ═════════════════════════════════════════════════════════════════════════════

function FleetTab() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.reports.fleet()
      .then(r => { setData(r.data); setError('') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const exportCsv = () => {
    const headers = ['Metric', 'Value']
    const rows: string[][] = [
      ['Total Connections', String(data.total_connections)],
      ['Fleet Avg Score', String(data.fleet_avg_score ?? '—')],
      ...Object.entries(data.by_status as Record<string, number>).map(([k, v]) => [`Status: ${k}`, String(v)]),
      ...(data.worst_performers ?? []).map((w: any) => [`Worst: ${w.name}`, `Score ${w.score}`]),
    ]
    downloadCsv('fleet-health-report.csv', headers, rows)
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-3 flex-wrap">
          <StatPill label="Total" value={data.total_connections} />
          <StatPill label="Fleet Avg" value={data.fleet_avg_score != null ? `${data.fleet_avg_score}` : '—'} />
          <StatPill label="Healthy" value={data.by_status?.healthy ?? 0} color="text-green-500" />
          <StatPill label="Warning" value={data.by_status?.warning ?? 0} color="text-amber-500" />
          <StatPill label="Critical" value={data.by_status?.critical ?? 0} color="text-red-500" />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status pie */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Status Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={Object.entries(data.by_status as Record<string, number>).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))}
                cx="50%" cy="50%" outerRadius={75} innerRadius={40} dataKey="value" paddingAngle={2}
              >
                {Object.entries(data.by_status as Record<string, number>).filter(([, v]) => v > 0).map(([name]) => (
                  <Cell key={name} fill={STATUS_COLORS[name] ?? '#6b7280'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Score distribution bar */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Score Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.score_distribution ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="range" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* By DB Type */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">By Database Type</h3>
          <div className="space-y-3 mt-4">
            {Object.entries(data.by_db_type as Record<string, { count: number; avg_score: number | null }>).map(([type, info]) => (
              <div key={type} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: DB_COLORS[type] ?? '#6b7280' }} />
                  <span className="text-sm font-medium capitalize">{type}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {info.count} conn · avg {info.avg_score ?? '—'}
                </div>
              </div>
            ))}
          </div>
          {/* By Environment */}
          <h3 className="text-sm font-semibold mb-3 mt-6">By Environment</h3>
          <div className="space-y-3">
            {Object.entries(data.by_environment as Record<string, { count: number; avg_score: number | null }>).map(([env, info]) => (
              <div key={env} className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{env}</span>
                <div className="text-sm text-muted-foreground">
                  {info.count} conn · avg {info.avg_score ?? '—'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Worst performers table */}
      {(data.worst_performers ?? []).length > 0 && (
        <Card>
          <h3 className="text-sm font-semibold mb-3">Worst Performers</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground text-xs border-b border-border">
                <th className="pb-2">Connection</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Score</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data.worst_performers as any[]).map((w) => (
                <tr key={w.id} className="border-b border-border/50 last:border-0">
                  <td className="py-2 font-medium">{w.name}</td>
                  <td className="py-2">
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: DB_COLORS[w.db_type] + '20', color: DB_COLORS[w.db_type] }}>
                      {w.db_type}
                    </span>
                  </td>
                  <td className="py-2 font-semibold">{w.score}</td>
                  <td className="py-2">
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[w.status] + '20', color: STATUS_COLORS[w.status] }}>
                      {w.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: DR Readiness
// ═════════════════════════════════════════════════════════════════════════════

function DrReadinessTab() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.reports.drReadiness()
      .then(r => { setData(r.data ?? []); setError('') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />

  const readinessColor: Record<string, string> = {
    ready: 'text-green-500 bg-green-500/10',
    overdue: 'text-red-500 bg-red-500/10',
    'at-risk': 'text-amber-500 bg-amber-500/10',
    'never-tested': 'text-gray-500 bg-gray-500/10',
  }

  const summary = {
    total: data.length,
    ready: data.filter(d => d.readiness === 'ready').length,
    overdue: data.filter(d => d.readiness === 'overdue').length,
    atRisk: data.filter(d => d.readiness === 'at-risk').length,
    neverTested: data.filter(d => d.readiness === 'never-tested').length,
  }

  const exportCsv = () => {
    const headers = ['Prod', 'DR', 'Type', 'RPO Target', 'RTO Target', 'Last Drill', 'Result', 'Pass Rate', 'Readiness']
    const rows = data.map(d => [
      d.prod_name, d.dr_name, d.db_type,
      String(d.rpo_target), String(d.rto_target),
      d.last_drill_date ? new Date(d.last_drill_date).toLocaleDateString() : 'Never',
      d.last_drill_result ?? '—', d.pass_rate != null ? `${d.pass_rate}%` : '—', d.readiness,
    ])
    downloadCsv('dr-readiness-report.csv', headers, rows)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-3 flex-wrap">
          <StatPill label="Total Pairs" value={summary.total} />
          <StatPill label="Ready" value={summary.ready} color="text-green-500" />
          <StatPill label="Overdue" value={summary.overdue} color="text-red-500" />
          <StatPill label="At Risk" value={summary.atRisk} color="text-amber-500" />
          <StatPill label="Never Tested" value={summary.neverTested} />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="pb-2 pr-4">Production</th>
                <th className="pb-2 pr-4">DR Target</th>
                <th className="pb-2 pr-4">Type</th>
                <th className="pb-2 pr-4">RPO</th>
                <th className="pb-2 pr-4">RTO</th>
                <th className="pb-2 pr-4">Last Drill</th>
                <th className="pb-2 pr-4">Result</th>
                <th className="pb-2 pr-4">Pass Rate</th>
                <th className="pb-2 pr-4">Drills</th>
                <th className="pb-2">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.pair_id} className="border-b border-border/50 last:border-0">
                  <td className="py-2.5 pr-4 font-medium">{d.prod_name}</td>
                  <td className="py-2.5 pr-4">{d.dr_name}</td>
                  <td className="py-2.5 pr-4">
                    <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: DB_COLORS[d.db_type] + '20', color: DB_COLORS[d.db_type] }}>
                      {d.db_type}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4">
                    <RpoRtoCell target={d.rpo_target} actual={d.last_rpo_actual} label="min" />
                  </td>
                  <td className="py-2.5 pr-4">
                    <RpoRtoCell target={d.rto_target} actual={d.last_rto_actual} label="min" />
                  </td>
                  <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                    {d.last_drill_date ? new Date(d.last_drill_date).toLocaleDateString() : '—'}
                  </td>
                  <td className="py-2.5 pr-4">
                    {d.last_drill_result ? (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                        d.last_drill_result === 'pass' ? 'text-green-600 bg-green-500/10' :
                        d.last_drill_result === 'fail' ? 'text-red-600 bg-red-500/10' :
                        'text-amber-600 bg-amber-500/10'
                      }`}>
                        {d.last_drill_result}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-2.5 pr-4 text-xs">{d.pass_rate != null ? `${d.pass_rate}%` : '—'}</td>
                  <td className="py-2.5 pr-4 text-xs">{d.drill_count}</td>
                  <td className="py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${readinessColor[d.readiness] ?? ''}`}>
                      {d.readiness}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">No DR pairs configured</p>
        )}
      </Card>
    </div>
  )
}

function RpoRtoCell({ target, actual, label }: { target: number; actual: number | null; label: string }) {
  const over = actual != null && actual > target
  return (
    <div className="text-xs">
      <span className="text-muted-foreground">{target}{label}</span>
      {actual != null && (
        <span className={`ml-1 font-medium ${over ? 'text-red-500' : 'text-green-600'}`}>
          ({actual}{label})
        </span>
      )}
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: Incidents
// ═════════════════════════════════════════════════════════════════════════════

function IncidentsTab({ days }: { days: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    setLoading(true)
    api.reports.incidents(days)
      .then(r => { setData(r.data); setError('') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const exportCsv = () => {
    const headers = ['Metric', 'Value']
    const rows: string[][] = [
      ['Total Alerts', String(data.total_alerts)],
      ['MTTR (hours)', String(data.mttr_hours ?? '—')],
      ...Object.entries(data.by_severity as Record<string, number>).map(([k, v]) => [`Severity: ${k}`, String(v)]),
      ...(data.by_connection ?? []).map((c: any) => [`Connection: ${c.name}`, String(c.count)]),
    ]
    downloadCsv(`incidents-report-${days}d.csv`, headers, rows)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex gap-3 flex-wrap">
          <StatPill label="Total Alerts" value={data.total_alerts} />
          <StatPill label="Critical" value={data.by_severity?.critical ?? 0} color="text-red-500" />
          <StatPill label="Warning" value={data.by_severity?.warning ?? 0} color="text-amber-500" />
          <StatPill label="Info" value={data.by_severity?.info ?? 0} color="text-blue-500" />
          <StatPill label="MTTR" value={data.mttr_hours != null ? `${data.mttr_hours}h` : '—'} />
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline chart */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Alert Timeline</h3>
          {(data.timeline ?? []).length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.timeline}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="t" tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 10 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="critical" stackId="a" fill="#ef4444" radius={[0, 0, 0, 0]} />
                <Bar dataKey="warning" stackId="a" fill="#f59e0b" />
                <Bar dataKey="info" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-10">No alerts in this window</p>
          )}
        </Card>

        {/* By severity pie */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Severity Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={Object.entries(data.by_severity as Record<string, number>).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }))}
                cx="50%" cy="50%" outerRadius={75} innerRadius={40} dataKey="value" paddingAngle={2}
              >
                {Object.entries(data.by_severity as Record<string, number>).filter(([, v]) => v > 0).map(([name], i) => (
                  <Cell key={name} fill={name === 'critical' ? '#ef4444' : name === 'warning' ? '#f59e0b' : '#3b82f6'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top connections */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Top Connections by Alert Count</h3>
          {(data.by_connection ?? []).length > 0 ? (
            <div className="space-y-2">
              {(data.by_connection as any[]).map((c, i) => (
                <div key={c.connection_id} className="flex items-center justify-between">
                  <span className="text-sm">{c.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${Math.min((c.count / (data.by_connection[0]?.count || 1)) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-6 text-right">{c.count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">No alerts</p>
          )}
        </Card>

        {/* Alert types */}
        <Card>
          <h3 className="text-sm font-semibold mb-3">Alert Types</h3>
          {(data.by_type ?? []).length > 0 ? (
            <div className="space-y-2">
              {(data.by_type as any[]).map((t) => (
                <div key={t.type} className="flex items-center justify-between">
                  <span className="text-sm font-mono">{t.type}</span>
                  <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{t.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">No alerts</p>
          )}
        </Card>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5: Audit Trail
// ═════════════════════════════════════════════════════════════════════════════

function AuditTab({ days }: { days: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionFilter, setActionFilter] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api.reports.audit(days, 200, actionFilter || undefined)
      .then(r => { setData(r.data); setError('') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [days, actionFilter])

  if (loading) return <LoadingState />
  if (error) return <ErrorState message={error} />
  if (!data) return null

  const entries: any[] = data.entries ?? []
  const actions: string[] = data.actions ?? []

  const exportCsv = () => {
    const headers = ['Timestamp', 'Actor', 'Action', 'Target Type', 'Target ID']
    const rows = entries.map(e => [
      new Date(e.created_at).toLocaleString(),
      e.actor_name, e.action, e.target_type, e.target_id ?? '',
    ])
    downloadCsv(`audit-trail-${days}d.csv`, headers, rows)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <StatPill label="Entries" value={entries.length} />
          <div className="flex items-center gap-1.5">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="text-xs border border-border rounded-lg px-3 py-2 bg-background"
            >
              <option value="">All actions</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <ExportButton onClick={exportCsv} />
      </div>

      <Card>
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-xs text-muted-foreground border-b border-border">
                <th className="pb-2 pr-4">Timestamp</th>
                <th className="pb-2 pr-4">Actor</th>
                <th className="pb-2 pr-4">Action</th>
                <th className="pb-2 pr-4">Target</th>
                <th className="pb-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-b border-border/50 last:border-0 group">
                  <td className="py-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="py-2 pr-4 text-xs font-medium">{e.actor_name}</td>
                  <td className="py-2 pr-4">
                    <span className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
                      {e.action}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-xs text-muted-foreground">
                    {e.target_type}{e.target_id ? ` · ${e.target_id.slice(0, 8)}…` : ''}
                  </td>
                  <td className="py-2">
                    {e.payload && Object.keys(e.payload).length > 0 && (
                      <button
                        onClick={() => setExpandedRow(expandedRow === e.id ? null : e.id)}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        {expandedRow === e.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Expanded payload */}
          {expandedRow && (() => {
            const entry = entries.find(e => e.id === expandedRow)
            if (!entry?.payload) return null
            return (
              <div className="mx-4 mb-2 p-3 bg-muted rounded-lg">
                <pre className="text-xs overflow-auto whitespace-pre-wrap max-h-40">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </div>
            )
          })()}
        </div>

        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-10">No audit entries found</p>
        )}
      </Card>
    </div>
  )
}
