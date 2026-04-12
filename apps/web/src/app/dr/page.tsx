'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Shield,
  Plus,
  ArrowRightLeft,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Timer,
  Target,
  FileText,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  Activity,
  X,
} from 'lucide-react'
import { cn, formatRelativeTime } from '@/lib/utils'
import { api } from '@/lib/api'
import { useAuth } from '@/components/providers/AuthProvider'

// ─── Types ──────────────────────────────────────────────────────────────────

type Connection = {
  id: string
  name: string
  db_type: string
  environment: string
  host: string
  port: number
  status: string
}

type DrPair = {
  id: string
  prod_connection_id: string
  dr_connection_id: string
  rpo_target_minutes: number
  rto_target_minutes: number
  notes?: string
  created_at: string
  updated_at: string
  prod_connection?: Connection
  dr_connection?: Connection
  drills?: DrDrill[]
}

type DrDrill = {
  id: string
  pair_id: string
  result: 'pass' | 'fail' | 'partial' | 'aborted'
  started_at: string
  completed_at?: string
  duration_min?: number
  rpo_actual_min?: number
  rto_actual_min?: number
  notes?: string
  run_by_name?: string
  created_at: string
}

const RESULT_CONFIG = {
  pass:    { label: 'Pass',    color: 'text-success bg-success/10 border-success/30',  icon: CheckCircle2 },
  fail:    { label: 'Fail',    color: 'text-critical bg-critical/10 border-critical/30', icon: XCircle },
  partial: { label: 'Partial', color: 'text-warning bg-warning/10 border-warning/30',  icon: AlertTriangle },
  aborted: { label: 'Aborted', color: 'text-muted-foreground bg-muted border-border',  icon: XCircle },
}

const DB_TYPE_ICON: Record<string, string> = {
  oracle:  '🔴',
  mssql:   '🔵',
  mariadb: '🟢',
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function DrManagementPage() {
  const { role } = useAuth()
  const canManage = role === 'dba' || role === 'super_admin'

  const [pairs,    setPairs]    = useState<DrPair[]>([])
  const [loading,  setLoading]  = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Modals
  const [showPairModal,  setShowPairModal]  = useState(false)
  const [showDrillModal, setShowDrillModal] = useState<string | null>(null) // pair_id
  const [editPair,       setEditPair]       = useState<DrPair | null>(null)

  // All connections for the pair creation form
  const [allConns, setAllConns] = useState<Connection[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.dr.listPairs() as { data: DrPair[] }
      setPairs(res.data ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Expand a pair → load its drills
  async function toggleExpand(pairId: string) {
    if (expanded === pairId) {
      setExpanded(null)
      return
    }
    setExpanded(pairId)
    try {
      const res = await api.dr.getPair(pairId) as { data: DrPair }
      setPairs(prev => prev.map(p => p.id === pairId ? { ...p, drills: res.data.drills ?? [] } : p))
    } catch {
      // silently fail
    }
  }

  async function deletePair(pairId: string) {
    if (!confirm('Delete this DR pair and all its drill records?')) return
    await api.dr.deletePair(pairId)
    setPairs(prev => prev.filter(p => p.id !== pairId))
  }

  async function openPairModal() {
    try {
      const res = await api.connections.list() as { data: Connection[] }
      setAllConns(res.data ?? [])
    } catch { /* */ }
    setShowPairModal(true)
  }

  // Stats
  const totalPairs = pairs.length
  const latestDrills = pairs.map(p => (p.drills ?? [])[0]).filter(Boolean)
  const passCount  = latestDrills.filter(d => d?.result === 'pass').length
  const failCount  = latestDrills.filter(d => d?.result === 'fail').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Shield className="w-6 h-6 text-warning" />
            DR Management
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Disaster recovery pair mapping, failover drill tracking &amp; readiness metrics
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Summary pills */}
          <div className="rounded-lg border border-border px-3 py-1.5 text-center min-w-16 bg-muted/30">
            <p className="text-xl font-bold tabular-nums text-foreground">{totalPairs}</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pairs</p>
          </div>
          <div className="rounded-lg border border-success/30 px-3 py-1.5 text-center min-w-16 bg-success/10">
            <p className="text-xl font-bold tabular-nums text-success">{passCount}</p>
            <p className="text-[10px] uppercase tracking-wider text-success">Passed</p>
          </div>
          <div className="rounded-lg border border-critical/30 px-3 py-1.5 text-center min-w-16 bg-critical/10">
            <p className="text-xl font-bold tabular-nums text-critical">{failCount}</p>
            <p className="text-[10px] uppercase tracking-wider text-critical">Failed</p>
          </div>
          {canManage && (
            <button
              onClick={openPairModal}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Pair
            </button>
          )}
        </div>
      </div>

      {/* Pair Cards */}
      {loading ? (
        <div className="p-12 text-center text-muted-foreground text-sm">Loading DR pairs…</div>
      ) : pairs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <Shield className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">No DR pairs configured</p>
          <p className="text-sm text-muted-foreground">
            Create a pair to map a production database to its DR counterpart
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pairs.map(pair => (
            <PairCard
              key={pair.id}
              pair={pair}
              expanded={expanded === pair.id}
              onToggle={() => toggleExpand(pair.id)}
              onDelete={() => deletePair(pair.id)}
              onEdit={() => { setEditPair(pair); setShowPairModal(true) }}
              onRecordDrill={() => setShowDrillModal(pair.id)}
              canManage={canManage}
            />
          ))}
        </div>
      )}

      {/* Create / Edit Pair Modal */}
      {showPairModal && (
        <PairFormModal
          pair={editPair}
          connections={allConns}
          onClose={() => { setShowPairModal(false); setEditPair(null) }}
          onSaved={() => { setShowPairModal(false); setEditPair(null); load() }}
        />
      )}

      {/* Record Drill Modal */}
      {showDrillModal && (
        <DrillFormModal
          pairId={showDrillModal}
          onClose={() => setShowDrillModal(null)}
          onSaved={() => { setShowDrillModal(null); toggleExpand(showDrillModal) }}
        />
      )}
    </div>
  )
}

// ─── Pair Card ──────────────────────────────────────────────────────────────

function PairCard({ pair, expanded, onToggle, onDelete, onEdit, onRecordDrill, canManage }: {
  pair: DrPair
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onEdit: () => void
  onRecordDrill: () => void
  canManage: boolean
}) {
  const prod = pair.prod_connection
  const dr   = pair.dr_connection
  const latestDrill = (pair.drills ?? [])[0]
  const daysSinceDrill = latestDrill
    ? Math.floor((Date.now() - new Date(latestDrill.started_at).getTime()) / 86400000)
    : null

  // Readiness color based on last drill
  const readinessColor = !latestDrill
    ? 'text-muted-foreground'
    : latestDrill.result === 'pass'
      ? daysSinceDrill! > 90 ? 'text-warning' : 'text-success'
      : 'text-critical'

  const readinessLabel = !latestDrill
    ? 'Never tested'
    : latestDrill.result === 'pass'
      ? daysSinceDrill! > 90 ? 'Overdue' : 'Ready'
      : 'At risk'

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/20 transition-colors" onClick={onToggle}>
        {/* Readiness indicator */}
        <div className={cn('flex flex-col items-center gap-0.5 min-w-16', readinessColor)}>
          <Shield className="w-5 h-5" />
          <span className="text-[10px] font-semibold uppercase tracking-wider">{readinessLabel}</span>
        </div>

        {/* Pair info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm">{DB_TYPE_ICON[prod?.db_type ?? ''] ?? '⚪'}</span>
            <span className="font-semibold text-foreground">{prod?.name ?? 'Unknown'}</span>
            <ArrowRightLeft className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-foreground">{dr?.name ?? 'Unknown'}</span>
            <span className="text-xs text-muted-foreground">({prod?.db_type})</span>
          </div>
          <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Target className="w-3 h-3" />
              RPO: {pair.rpo_target_minutes}min
            </span>
            <span className="flex items-center gap-1">
              <Timer className="w-3 h-3" />
              RTO: {pair.rto_target_minutes}min
            </span>
            {latestDrill && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Last drill: {formatRelativeTime(latestDrill.started_at)}
              </span>
            )}
            {daysSinceDrill !== null && daysSinceDrill > 90 && (
              <span className="text-warning font-medium">⚠ {daysSinceDrill}d since last drill</span>
            )}
          </div>
        </div>

        {/* RPO/RTO actual vs target (latest drill) */}
        {latestDrill && (
          <div className="hidden md:flex items-center gap-3">
            <MetricPill
              label="RPO"
              actual={latestDrill.rpo_actual_min}
              target={pair.rpo_target_minutes}
            />
            <MetricPill
              label="RTO"
              actual={latestDrill.rto_actual_min}
              target={pair.rto_target_minutes}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
          {canManage && (
            <>
              <button
                onClick={onRecordDrill}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-brand-500/10 text-brand-400 border border-brand-500/30 hover:bg-brand-500/20 transition-colors"
              >
                <Activity className="w-3 h-3" />
                Record Drill
              </button>
              <button onClick={onEdit} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete} className="p-1.5 rounded-lg text-muted-foreground hover:text-critical hover:bg-critical/10 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>

      {/* Notes */}
      {pair.notes && (
        <div className="px-5 pb-2 -mt-2">
          <p className="text-xs text-muted-foreground flex items-start gap-1">
            <FileText className="w-3 h-3 mt-0.5 shrink-0" />
            {pair.notes}
          </p>
        </div>
      )}

      {/* Expanded: Drill History */}
      {expanded && (
        <div className="border-t border-border">
          <div className="px-5 py-3 bg-muted/20">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Drill History</h3>
          </div>
          {!pair.drills || pair.drills.length === 0 ? (
            <div className="px-5 py-6 text-center text-sm text-muted-foreground">
              No drills recorded yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/10">
                  {['Result', 'Date', 'Duration', 'RPO Actual', 'RTO Actual', 'Run By', 'Notes'].map(h => (
                    <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pair.drills.map(drill => {
                  const cfg = RESULT_CONFIG[drill.result]
                  const Icon = cfg.icon
                  return (
                    <tr key={drill.id} className="hover:bg-muted/10 transition-colors">
                      <td className="px-5 py-2.5">
                        <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border', cfg.color)}>
                          <Icon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-foreground">
                        {new Date(drill.started_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-5 py-2.5 text-foreground tabular-nums">
                        {drill.duration_min != null ? `${drill.duration_min} min` : '—'}
                      </td>
                      <td className="px-5 py-2.5">
                        <MetricInline actual={drill.rpo_actual_min} target={pair.rpo_target_minutes} unit="min" />
                      </td>
                      <td className="px-5 py-2.5">
                        <MetricInline actual={drill.rto_actual_min} target={pair.rto_target_minutes} unit="min" />
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">{drill.run_by_name ?? '—'}</td>
                      <td className="px-5 py-2.5 text-muted-foreground max-w-48 truncate">{drill.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Metric Helpers ─────────────────────────────────────────────────────────

function MetricPill({ label, actual, target }: { label: string; actual?: number; target: number }) {
  if (actual == null) return null
  const met = actual <= target
  return (
    <div className={cn(
      'flex flex-col items-center px-2.5 py-1 rounded-lg border text-center min-w-14',
      met ? 'border-success/30 bg-success/10' : 'border-critical/30 bg-critical/10',
    )}>
      <span className={cn('text-sm font-bold tabular-nums', met ? 'text-success' : 'text-critical')}>
        {actual}m
      </span>
      <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label} / {target}m
      </span>
    </div>
  )
}

function MetricInline({ actual, target, unit }: { actual?: number; target: number; unit: string }) {
  if (actual == null) return <span className="text-muted-foreground">—</span>
  const met = actual <= target
  return (
    <span className={cn('font-medium tabular-nums', met ? 'text-success' : 'text-critical')}>
      {actual} {unit}
      <span className="text-muted-foreground font-normal text-xs ml-1">/ {target}</span>
    </span>
  )
}

// ─── Pair Form Modal ────────────────────────────────────────────────────────

function PairFormModal({ pair, connections, onClose, onSaved }: {
  pair: DrPair | null
  connections: Connection[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!pair
  const [prodId, setProdId]   = useState(pair?.prod_connection_id ?? '')
  const [drId,   setDrId]    = useState(pair?.dr_connection_id ?? '')
  const [rpo,    setRpo]     = useState(pair?.rpo_target_minutes ?? 15)
  const [rto,    setRto]     = useState(pair?.rto_target_minutes ?? 60)
  const [notes,  setNotes]   = useState(pair?.notes ?? '')
  const [saving, setSaving]  = useState(false)
  const [error,  setError]   = useState('')

  const prodConns = connections.filter(c => c.environment === 'production')
  const drConns   = connections.filter(c => c.environment === 'dr')

  // Filter DR connections to same db_type as selected prod
  const selectedProd = connections.find(c => c.id === prodId)
  const filteredDr   = selectedProd
    ? drConns.filter(c => c.db_type === selectedProd.db_type)
    : drConns

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await api.dr.updatePair(pair!.id, { rpo_target_minutes: rpo, rto_target_minutes: rto, notes: notes || undefined })
      } else {
        await api.dr.createPair({
          prod_connection_id: prodId,
          dr_connection_id: drId,
          rpo_target_minutes: rpo,
          rto_target_minutes: rto,
          notes: notes || undefined,
        })
      }
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">{isEdit ? 'Edit DR Pair' : 'New DR Pair'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isEdit && (
            <>
              <label className="block">
                <span className="text-sm font-medium text-foreground">Production Connection</span>
                <select
                  value={prodId}
                  onChange={e => { setProdId(e.target.value); setDrId('') }}
                  required
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Select production DB…</option>
                  {prodConns.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.db_type})</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-foreground">DR Connection</span>
                <select
                  value={drId}
                  onChange={e => setDrId(e.target.value)}
                  required
                  disabled={!prodId}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                >
                  <option value="">Select DR DB…</option>
                  {filteredDr.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.db_type})</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">RPO Target (minutes)</span>
              <input
                type="number"
                min={1}
                value={rpo}
                onChange={e => setRpo(+e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">RTO Target (minutes)</span>
              <input
                type="number"
                min={1}
                value={rto}
                onChange={e => setRto(+e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-foreground">Notes</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. Data Guard physical standby, async redo shipping"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none"
            />
          </label>
          {error && <p className="text-sm text-critical">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!isEdit && (!prodId || !drId))}
              className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Update' : 'Create Pair'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Drill Form Modal ───────────────────────────────────────────────────────

function DrillFormModal({ pairId, onClose, onSaved }: {
  pairId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [result,     setResult]     = useState<'pass' | 'fail' | 'partial' | 'aborted'>('pass')
  const [startedAt,  setStartedAt]  = useState(new Date().toISOString().slice(0, 16))
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 16))
  const [durationMin, setDurationMin] = useState<number | ''>('')
  const [rpoActual,  setRpoActual]  = useState<number | ''>('')
  const [rtoActual,  setRtoActual]  = useState<number | ''>('')
  const [notes,      setNotes]      = useState('')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.dr.createDrill({
        pair_id: pairId,
        result,
        started_at:     new Date(startedAt).toISOString(),
        completed_at:   completedAt ? new Date(completedAt).toISOString() : undefined,
        duration_min:   durationMin !== '' ? durationMin : undefined,
        rpo_actual_min: rpoActual !== '' ? rpoActual : undefined,
        rto_actual_min: rtoActual !== '' ? rtoActual : undefined,
        notes: notes || undefined,
      })
      onSaved()
    } catch (err: any) {
      setError(err.message ?? 'Failed to record drill')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl w-full max-w-lg mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-semibold text-foreground">Record Failover Drill</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Result */}
          <div>
            <span className="text-sm font-medium text-foreground">Result</span>
            <div className="flex gap-2 mt-1.5">
              {(Object.entries(RESULT_CONFIG) as [string, typeof RESULT_CONFIG['pass']][]).map(([key, cfg]) => {
                const Icon = cfg.icon
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setResult(key as any)}
                    className={cn(
                      'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                      result === key ? cfg.color : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Started At</span>
              <input
                type="datetime-local"
                value={startedAt}
                onChange={e => setStartedAt(e.target.value)}
                required
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Completed At</span>
              <input
                type="datetime-local"
                value={completedAt}
                onChange={e => setCompletedAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          {/* Duration + RPO/RTO */}
          <div className="grid grid-cols-3 gap-4">
            <label className="block">
              <span className="text-sm font-medium text-foreground">Duration (min)</span>
              <input
                type="number"
                min={0}
                value={durationMin}
                onChange={e => setDurationMin(e.target.value ? +e.target.value : '')}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">RPO Actual (min)</span>
              <input
                type="number"
                min={0}
                value={rpoActual}
                onChange={e => setRpoActual(e.target.value ? +e.target.value : '')}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-foreground">RTO Actual (min)</span>
              <input
                type="number"
                min={0}
                value={rtoActual}
                onChange={e => setRtoActual(e.target.value ? +e.target.value : '')}
                placeholder="—"
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
              />
            </label>
          </div>

          {/* Notes */}
          <label className="block">
            <span className="text-sm font-medium text-foreground">Notes</span>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Describe the failover test procedure, any issues encountered, recovery steps…"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground resize-none"
            />
          </label>

          {error && <p className="text-sm text-critical">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-brand-500 text-white text-sm font-medium hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving…' : 'Record Drill'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
