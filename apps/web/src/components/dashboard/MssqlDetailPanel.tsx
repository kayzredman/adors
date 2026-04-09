'use client'

import { MetricChart, Sparkline } from '@/components/ui/Charts'

interface MssqlDetailPanelProps {
  metrics: Record<string, any>
  name: string
}

export function MssqlDetailPanel({ metrics: m, name }: MssqlDetailPanelProps) {
  if (m.error) {
    return (
      <div className="rounded-xl border border-critical/30 bg-critical/5 p-6 space-y-2">
        <p className="font-semibold text-critical">Live adapter error — could not retrieve metrics</p>
        <p className="text-sm font-mono text-muted-foreground break-all">{m.error}</p>
        <p className="text-xs text-muted-foreground">
          Use the Edit button to set valid database credentials, then run a Manual Scan.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Server info + Connections */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
          <p className="font-bold text-base text-foreground">{name}</p>
          <p className="text-muted-foreground">Version: <span className="text-foreground font-mono">{m.db_version}</span></p>
          <p className="text-muted-foreground">Uptime: <span className="text-foreground">{m.uptime_days} days</span></p>
          <p className="text-muted-foreground">O/S: <span className="text-foreground font-mono">{m.os}</span></p>
          <p className="text-muted-foreground">CPUs: <span className="text-foreground">{m.cpus}</span></p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Connections</p>
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{m.active_connections}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Max Allowed</p>
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">{m.max_connections?.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Batch Req/s</p>
              <p className="text-2xl font-bold text-foreground tabular-nums">{m.batch_requests_sec}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Memory + CPU */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Buffer Pool Memory</p>
          <MetricChart
            data={m.memory_pressure_chart ?? []}
            color="#F59E0B"
            height={110}
            label="Memory %"
            format={(v) => `${v}%`}
          />
          <div className="grid grid-cols-2 gap-x-4 text-sm mt-1">
            {[
              ['Buffer Pool',       `${m.buffer_pool_memory_pct}%`],
              ['Target Memory',     `${m.target_server_memory_gb?.toFixed(1)} GB`],
              ['Current Memory',    `${m.total_server_memory_gb?.toFixed(1)} GB`],
              ['Page Life Expect.', `${m.page_life_expectancy_sec}s`],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">CPU & Query Performance</p>
          <MetricChart
            data={m.cpu_chart ?? []}
            color="#0072CE"
            height={110}
            label="CPU %"
            format={(v) => `${v}%`}
          />
          <div className="grid grid-cols-2 gap-x-4 text-sm mt-1">
            {[
              ['CPU Usage',        `${m.cpu_usage_pct}%`],
              ['Avg Query Time',   `${m.avg_query_time_ms} ms`],
              ['Compilations/s',   m.compilations_sec],
              ['Recompilations/s', m.recompilations_sec],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Waits + Blocking + I/O */}
      <div className="grid grid-cols-3 gap-4">
        {/* Top Wait Types */}
        <div className="rounded-xl border border-border bg-card p-4 col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Top Wait Types (DMV)</p>
          <div className="space-y-2">
            {(m.top_wait_types ?? []).map((w: { wait_type: string; wait_ms: number }) => (
              <div key={w.wait_type} className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground w-36 shrink-0">{w.wait_type}</span>
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{ width: `${Math.min(100, (w.wait_ms / 5000) * 100)}%` }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums text-foreground w-16 text-right">{w.wait_ms.toLocaleString()} ms</span>
              </div>
            ))}
          </div>
        </div>

        {/* Blocking + I/O */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Blocking & Deadlocks</p>
            <Sparkline data={m.blocking_chart ?? []} color="#EF4444" height={60} />
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Blocking SPIDs</span>
              <span className={`font-bold tabular-nums ${m.blocking_spids > 0 ? 'text-critical' : 'text-success'}`}>{m.blocking_spids}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Deadlocks/min</span>
              <span className={`font-bold tabular-nums ${m.deadlocks_per_min > 0 ? 'text-warning' : 'text-success'}`}>{m.deadlocks_per_min}</span>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Disk I/O</p>
            <Sparkline data={m.io_chart ?? []} color="#10B981" height={55} />
            <div className="flex justify-between text-sm mt-1">
              <span className="text-muted-foreground">Reads/s</span>
              <span className="font-mono tabular-nums text-foreground">{m.disk_reads_per_sec}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Writes/s</span>
              <span className="font-mono tabular-nums text-foreground">{m.disk_writes_per_sec}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
