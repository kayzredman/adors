'use client'

import { MetricChart, Sparkline } from '@/components/ui/Charts'

// ── HA / Replication state card ───────────────────────────────────────────────

const HA_LABELS: Record<string, string> = {
  alwayson:   'Always On AG',
  logshipping: 'Log Shipping',
  mirroring:  'Database Mirroring',
  none:       'Standalone',
}

const HA_COLORS: Record<string, string> = {
  alwayson:    'text-success',
  logshipping: 'text-brand-400',
  mirroring:   'text-warning',
  none:        'text-muted-foreground',
}

function SyncBadge({ value }: { value: string }) {
  const health = (value ?? '').toUpperCase()
  const cls =
    health === 'HEALTHY' || health === 'SYNCHRONIZED' || health === 'SYNCHRONIZING'
      ? 'bg-success/15 text-success'
      : health === 'PARTIALLY_HEALTHY'
      ? 'bg-warning/15 text-warning'
      : health === 'NOT_HEALTHY' || health === 'SUSPENDED' || health === 'DISCONNECTED'
      ? 'bg-critical/15 text-critical'
      : 'bg-muted text-muted-foreground'
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}>{value ?? '—'}</span>
}

function HaStateCard({ ha }: { ha: any }) {
  if (!ha || ha.type === 'none') {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HA / Replication</p>
        <span className="ml-auto text-sm text-muted-foreground italic">Standalone — no HA configuration detected</span>
      </div>
    )
  }

  const label = HA_LABELS[ha.type] ?? ha.type
  const colorCls = HA_COLORS[ha.type] ?? 'text-foreground'

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HA / Replication</p>
        <span className={`text-sm font-bold ${colorCls}`}>{label}</span>
        {ha.ag_name && <span className="font-mono text-xs text-foreground bg-muted px-2 py-0.5 rounded">{ha.ag_name}</span>}
        <span className="ml-auto text-xs font-semibold text-muted-foreground uppercase">{ha.local_role}</span>
        {ha.sync_health && <SyncBadge value={ha.sync_health} />}
      </div>

      {/* Always On AG details */}
      {ha.type === 'alwayson' && ha.details?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left pb-1 pr-3 font-medium">Partner</th>
                <th className="text-left pb-1 pr-3 font-medium">Role</th>
                <th className="text-left pb-1 pr-3 font-medium">Connected</th>
                <th className="text-left pb-1 pr-3 font-medium">Sync Health</th>
                <th className="text-right pb-1 pr-3 font-medium">Send Queue</th>
                <th className="text-right pb-1 font-medium">Redo Queue</th>
              </tr>
            </thead>
            <tbody>
              {ha.details.map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1 pr-3 font-mono">{r.partner}</td>
                  <td className="py-1 pr-3 font-semibold">{r.local_role}</td>
                  <td className="py-1 pr-3"><SyncBadge value={r.connected} /></td>
                  <td className="py-1 pr-3"><SyncBadge value={r.sync_health} /></td>
                  <td className="py-1 pr-3 tabular-nums text-right">{(r.log_send_queue_kb / 1024).toFixed(1)} MB</td>
                  <td className="py-1 tabular-nums text-right">{(r.redo_queue_kb / 1024).toFixed(1)} MB</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Log Shipping details */}
      {ha.type === 'logshipping' && ha.details?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left pb-1 pr-3 font-medium">Primary DB</th>
                <th className="text-left pb-1 pr-3 font-medium">Secondary</th>
                <th className="text-left pb-1 pr-3 font-medium">Last Backup</th>
                <th className="text-left pb-1 pr-3 font-medium">Last Restored</th>
                <th className="text-right pb-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {ha.details.map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1 pr-3 font-mono">{r.primary_database}</td>
                  <td className="py-1 pr-3 font-mono">{r.secondary_server ? `${r.secondary_server}/${r.secondary_database}` : '—'}</td>
                  <td className="py-1 pr-3 text-muted-foreground">{r.last_backup_date ? new Date(r.last_backup_date).toLocaleString() : '—'}</td>
                  <td className="py-1 pr-3 text-muted-foreground">{r.last_restored_date ? new Date(r.last_restored_date).toLocaleString() : '—'}</td>
                  <td className="py-1 text-right">
                    <SyncBadge value={r.status === 1 ? 'OK' : r.status === 2 ? 'WARNING' : 'CRITICAL'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mirroring details */}
      {ha.type === 'mirroring' && ha.details?.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left pb-1 pr-3 font-medium">Database</th>
                <th className="text-left pb-1 pr-3 font-medium">Role</th>
                <th className="text-left pb-1 pr-3 font-medium">State</th>
                <th className="text-left pb-1 pr-3 font-medium">Safety</th>
                <th className="text-left pb-1 pr-3 font-medium">Partner</th>
                <th className="text-left pb-1 font-medium">Witness</th>
              </tr>
            </thead>
            <tbody>
              {ha.details.map((r: any, i: number) => (
                <tr key={i} className="border-b border-border/30">
                  <td className="py-1 pr-3 font-mono">{r.database_name}</td>
                  <td className="py-1 pr-3 font-semibold">{r.role}</td>
                  <td className="py-1 pr-3"><SyncBadge value={r.state} /></td>
                  <td className="py-1 pr-3 text-muted-foreground">{r.safety}</td>
                  <td className="py-1 pr-3 font-mono text-xs">{r.partner?.split('TCP://')[1]?.split(':')[0] ?? r.partner ?? '—'}</td>
                  <td className="py-1 text-muted-foreground">{r.witness ?? 'None'} {r.witness_state ? `(${r.witness_state})` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-warning mt-2">⚠ Database Mirroring is deprecated since SQL Server 2012. Consider migrating to Always On AG.</p>
        </div>
      )}
    </div>
  )
}

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

      {/* ── HA / Replication State ───────────────────────────────── */}
      <HaStateCard ha={m.ha_state} />

      {/* ── Disk / Volume Mounts ─────────────────────────────────── */}
      {(m.disk_mounts ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Disk / Volume Utilization</p>
          <div className="space-y-2">
            {(m.disk_mounts as any[]).map((v: any) => (
              <div key={v.mount} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-mono text-foreground">{v.label ?? v.mount}</span>
                  <span className="text-muted-foreground">{(v.total_gb - v.free_gb).toFixed(1)} / {v.total_gb} GB — {v.used_pct}%</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${v.used_pct >= 90 ? 'bg-critical' : v.used_pct >= 75 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${Math.min(100, v.used_pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Per-Filegroup Disk Breakdown ─────────────────────────── */}
      {(m.filegroup_breakdown ?? []).length > 0 && (() => {
        const rows = m.filegroup_breakdown as any[]
        // Group by db_name → filegroup_name
        const byDb = rows.reduce((acc: Record<string, Record<string, any[]>>, row: any) => {
          if (!acc[row.db_name]) acc[row.db_name] = {}
          if (!acc[row.db_name][row.filegroup_name]) acc[row.db_name][row.filegroup_name] = []
          acc[row.db_name][row.filegroup_name].push(row)
          return acc
        }, {})
        return (
          <div className="rounded-xl border border-border bg-card p-4 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Filegroup Disk Breakdown
            </p>
            {Object.entries(byDb).map(([dbName, groups]) => (
              <div key={dbName} className="space-y-3">
                <p className="text-xs font-mono font-semibold text-foreground border-b border-border pb-1">{dbName}</p>
                {Object.entries(groups).map(([fgName, files]) => {
                  const totalAlloc = (files as any[]).reduce((s, f) => s + f.allocated_gb, 0)
                  const totalUsed  = (files as any[]).reduce((s, f) => s + f.used_gb, 0)
                  const usedPct    = totalAlloc > 0 ? Math.round((totalUsed / totalAlloc) * 100) : 0
                  return (
                    <div key={fgName} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">{fgName}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {totalUsed.toFixed(2)} / {totalAlloc.toFixed(2)} GB ({usedPct}%)
                        </span>
                      </div>
                      <div className="bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full transition-all ${usedPct >= 90 ? 'bg-critical' : usedPct >= 75 ? 'bg-warning' : 'bg-brand-400'}`}
                          style={{ width: `${Math.min(100, usedPct)}%` }}
                        />
                      </div>
                      <div className="pl-2 space-y-1">
                        {(files as any[]).map((f: any) => (
                          <div key={f.logical_name} className="flex items-center justify-between text-[11px] text-muted-foreground">
                            <span className="font-mono truncate max-w-[55%]" title={f.physical_name}>{f.logical_name}</span>
                            <span className="tabular-nums">{f.used_gb.toFixed(2)} / {f.allocated_gb.toFixed(2)} GB</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )
      })()}

      {/* ── Backup History ───────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Backup History</p>
        {(m.backup_history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No backup history found — requires SELECT on msdb.dbo.backupset</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left pb-1 pr-3 font-medium">Type</th>
                  <th className="text-left pb-1 pr-3 font-medium">Database</th>
                  <th className="text-left pb-1 pr-3 font-medium">Started</th>
                  <th className="text-left pb-1 pr-3 font-medium">Duration</th>
                  <th className="text-right pb-1 font-medium">Size (GB)</th>
                </tr>
              </thead>
              <tbody>
                {(m.backup_history as any[]).map((b: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1 pr-3">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${b.type === 'Full' ? 'bg-brand-500/20 text-brand-400' : b.type === 'Log' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                        {b.type}
                      </span>
                    </td>
                    <td className="py-1 pr-3 font-mono">{b.destination?.split('\\').pop() ?? '—'}</td>
                    <td className="py-1 pr-3 text-muted-foreground">
                      {b.started_at ? new Date(b.started_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-1 pr-3 tabular-nums">{b.duration_min} min</td>
                    <td className="py-1 tabular-nums text-right">{b.size_gb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
