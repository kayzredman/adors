'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, Cpu, Database } from 'lucide-react'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { OracleDetailPanel }  from '@/components/dashboard/OracleDetailPanel'
import { MssqlDetailPanel }   from '@/components/dashboard/MssqlDetailPanel'
import { MariaDbDetailPanel } from '@/components/dashboard/MariaDbDetailPanel'
import { cn, dbTypeLabel, healthStatusColor } from '@/lib/utils'
import { api } from '@/lib/api'

export default function ConnectionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router  = useRouter()

  const [data,     setData]     = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [scanning, setScanning] = useState(false)
  const [error,    setError]    = useState<string | null>(null)

  async function load() {
    try {
      setLoading(true)
      const [connRes, snapRes] = await Promise.all([
        api.connections.get(id),
        fetch(`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}/api/connections/${id}/snapshots/latest`)
          .then(r => r.ok ? r.json() : null).catch(() => null),
      ])
      setData({ connection: (connRes as any).data, snapshot: snapRes?.data ?? null })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function triggerScan() {
    setScanning(true)
    try {
      await api.connections.scan(id)
      await load()
    } finally {
      setScanning(false)
    }
  }

  useEffect(() => { load() }, [id])

  if (loading) return (
    <div className="flex items-center justify-center h-full text-muted-foreground">
      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading...
    </div>
  )

  if (error || !data) return (
    <div className="p-8 text-critical">Error: {error ?? 'Connection not found'}</div>
  )

  const { connection: conn, snapshot } = data
  const metrics = snapshot?.metrics ?? {}
  const score   = snapshot?.score   ?? 0
  const status  = snapshot?.status  ?? 'unknown'

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-brand-400" />
            <div>
              <h1 className="text-xl font-bold text-foreground">{conn.name}</h1>
              <p className="text-sm text-muted-foreground">{conn.host}:{conn.port}</p>
            </div>
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded border border-border text-muted-foreground">
              {dbTypeLabel(conn.db_type)}
            </span>
            <span className={cn(
              'text-xs font-semibold px-2 py-0.5 rounded-full border',
              conn.environment === 'production'
                ? 'text-critical bg-critical/10 border-critical/30'
                : 'text-brand-400 bg-brand-500/10 border-brand-500/30'
            )}>
              {conn.environment.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Health score + scan */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <HealthGauge score={score} size={72} />
            <div>
              <p className={cn('font-semibold capitalize', healthStatusColor(status))}>{status}</p>
              <p className="text-xs text-muted-foreground">Last scan {snapshot
                ? new Date(snapshot.scored_at).toLocaleTimeString()
                : 'never'}</p>
            </div>
          </div>
          <button
            onClick={triggerScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={cn('w-4 h-4', scanning && 'animate-spin')} />
            {scanning ? 'Scanning…' : 'Manual Scan'}
          </button>
        </div>
      </div>

      {/* ── Adapter notice (Phase 1 mock) ───────────────────── */}
      {metrics.adapter === 'mock' && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-2 text-xs text-warning flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 shrink-0" />
          Mock data — Phase 2 will connect live {dbTypeLabel(conn.db_type)} drivers
        </div>
      )}

      {/* ── DB-type-specific detail panel ───────────────────── */}
      {conn.db_type === 'oracle'  && <OracleDetailPanel  metrics={metrics} name={conn.name} />}
      {conn.db_type === 'mssql'   && <MssqlDetailPanel   metrics={metrics} name={conn.name} />}
      {conn.db_type === 'mariadb' && <MariaDbDetailPanel metrics={metrics} name={conn.name} />}
    </div>
  )
}
