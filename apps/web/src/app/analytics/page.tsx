'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, Activity, AlertTriangle, BarChart2, RefreshCw } from 'lucide-react'
import { MetricChart, Sparkline } from '@/components/ui/Charts'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { cn, healthStatusColor, dbTypeLabel } from '@/lib/utils'
import { api } from '@/lib/api'

const DAYS_OPTIONS = [3, 7, 14, 30]

function ScoreRing({ score, label, sub }: { score: number | null; label: string; sub: string }) {
  const color = score === null ? 'text-muted-foreground'
    : score >= 80 ? 'text-success'
    : score >= 50 ? 'text-warning'
    : 'text-critical'
  return (
    <div className="flex flex-col items-center gap-1">
      <span className={cn('text-4xl font-black tabular-nums', color)}>
        {score ?? '—'}
      </span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  )
}

export default function AnalyticsPage() {
  const router = useRouter()
  const [data,    setData]    = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days,    setDays]    = useState(7)
  const [error,   setError]   = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.analytics.fleet(days)
      setData(res.data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [days])

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Fleet Analytics</h1>
          <p className="text-sm text-muted-foreground">Health trends across all database connections</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {DAYS_OPTIONS.map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'px-3 py-1.5 transition-colors',
                  days === d
                    ? 'bg-brand-500 text-white'
                    : 'text-muted-foreground hover:text-foreground hover:bg-card',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg border border-border hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-critical/30 bg-critical/5 p-4 text-sm text-critical">{error}</div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading analytics…
        </div>
      )}

      {data && (
        <>
          {/* ── Score averages ─────────────────────────────────── */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Activity className="w-3.5 h-3.5" /> Fleet Average
              </div>
              <ScoreRing score={data.averages.fleet} label="Overall" sub="all connections" />
            </div>
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-critical">
                <AlertTriangle className="w-3.5 h-3.5" /> Production
              </div>
              <ScoreRing score={data.averages.production} label="Prod Avg" sub="production only" />
            </div>
            <div className="rounded-xl border border-border bg-card p-6 flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-brand-400">
                <BarChart2 className="w-3.5 h-3.5" /> UAT
              </div>
              <ScoreRing score={data.averages.uat} label="UAT Avg" sub="non-production" />
            </div>
          </div>

          {/* ── Fleet score trend ──────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-brand-400" />
              <p className="text-sm font-semibold text-foreground">Fleet Score Trend — Last {days} Days</p>
            </div>
            {data.fleet_trend.length > 0 ? (
              <MetricChart
                data={data.fleet_trend}
                color="#0072CE"
                height={140}
                label="Avg Score"
                format={(v) => String(v)}
              />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">No scan data yet in this window</p>
            )}
          </div>

          {/* ── Worst performers ──────────────────────────────── */}
          {data.worst_performers.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-3">
              <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-critical" />
                Worst Performers
              </p>
              <div className="divide-y divide-border">
                {data.worst_performers.map((c: any) => (
                  <div key={c.id} className="flex items-center gap-4 py-3">
                    <HealthGauge score={c.score} size={40} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {dbTypeLabel(c.db_type)} · {c.environment.toUpperCase()}
                      </p>
                    </div>
                    <span className={cn('text-xs font-semibold capitalize', healthStatusColor(c.status))}>
                      {c.status}
                    </span>
                    <div className="w-32">
                      <Sparkline data={c.trend} color="#EF4444" height={36} />
                    </div>
                    <button
                      onClick={() => router.push(`/connections/${c.id}/analytics`)}
                      className="text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0"
                    >
                      Deep dive →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── All connections ───────────────────────────────── */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-semibold text-foreground">All Connections</p>
            <div className="divide-y divide-border">
              {data.connections.map((c: any) => (
                <div key={c.id} className="flex items-center gap-4 py-3">
                  <HealthGauge score={c.score ?? 0} size={40} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {dbTypeLabel(c.db_type)} · {c.environment.toUpperCase()}
                      {c.scored_at && (
                        <> · last scan {new Date(c.scored_at).toLocaleTimeString()}</>
                      )}
                    </p>
                  </div>
                  <span className={cn('text-xs font-semibold capitalize w-16 text-right', healthStatusColor(c.status))}>
                    {c.status}
                  </span>
                  <div className="w-28">
                    <Sparkline
                      data={c.trend}
                      color={c.score >= 80 ? '#10B981' : c.score >= 50 ? '#F59E0B' : '#EF4444'}
                      height={32}
                    />
                  </div>
                  <button
                    onClick={() => router.push(`/connections/${c.id}/analytics`)}
                    className="text-xs text-brand-400 hover:text-brand-300 font-medium shrink-0"
                  >
                    Details →
                  </button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
