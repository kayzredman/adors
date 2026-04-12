'use client'

import { MetricChart, Sparkline, WaitBreakdownChart, StorageCylinder } from '@/components/ui/Charts'
/** Format large numbers with SI suffixes */
function fmtNum(n: number): string {
  if (n == null || isNaN(n)) return '0'
  const abs = Math.abs(n)
  if (abs >= 1e12) return (n / 1e12).toFixed(1) + 'T'
  if (abs >= 1e9)  return (n / 1e9).toFixed(1)  + 'B'
  if (abs >= 1e6)  return (n / 1e6).toFixed(1)  + 'M'
  if (abs >= 1e3)  return (n / 1e3).toFixed(1)  + 'K'
  return n.toLocaleString()
}
// ── HA / Data Guard state card ────────────────────────────────────────────────

const DG_ROLE_COLOR: Record<string, string> = {
  'PRIMARY':           'text-success',
  'PHYSICAL STANDBY':  'text-brand-400',
  'LOGICAL STANDBY':   'text-warning',
  'SNAPSHOT STANDBY':  'text-muted-foreground',
}

function DgStatusBadge({ value }: { value: string }) {
  const v = (value ?? '').toUpperCase()
  const cls =
    v === 'VALID' || v === 'APPLYING' || v === 'CONNECTED'
      ? 'bg-success/15 text-success'
      : v === 'DEFERRED' || v === 'ALTERNATE'
      ? 'bg-warning/15 text-warning'
      : v === 'ERROR' || v === 'FAILED'
      ? 'bg-critical/15 text-critical'
      : 'bg-muted text-muted-foreground'
  return <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${cls}`}>{value || '—'}</span>
}

function OracleHaStateCard({ ha }: { ha: any }) {
  if (!ha || ha.type === 'none') {
    return (
      <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HA / Replication</p>
        <span className="ml-auto text-sm text-muted-foreground italic">Standalone — no Data Guard or Streams configuration detected</span>
      </div>
    )
  }

  if (ha.type === 'dataguard') {
    const roleColor = DG_ROLE_COLOR[ha.local_role] ?? 'text-foreground'
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        {/* Header row */}
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Data Guard</p>
          <span className={`text-sm font-bold ${roleColor}`}>{ha.local_role}</span>
          {ha.db_unique_name && (
            <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded text-foreground">{ha.db_unique_name}</span>
          )}
          {ha.protection_mode && (
            <span className="text-xs text-muted-foreground">{ha.protection_mode}</span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{ha.open_mode} / {ha.log_mode}</span>
        </div>

        {/* Lag metrics (standby) */}
        {(ha.apply_lag || ha.transport_lag) && (
          <div className="flex gap-6 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Apply Lag</p>
              <p className={`font-bold ${ha.apply_lag && ha.apply_lag !== '+00 00:00:00' ? 'text-warning' : 'text-success'}`}>
                {ha.apply_lag ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transport Lag</p>
              <p className={`font-bold ${ha.transport_lag && ha.transport_lag !== '+00 00:00:00' ? 'text-warning' : 'text-success'}`}>
                {ha.transport_lag ?? '—'}
              </p>
            </div>
          </div>
        )}

        {/* Managed standby processes */}
        {ha.managed_procs?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Apply / Redo Processes</p>
            <div className="flex flex-wrap gap-2">
              {ha.managed_procs.map((p: any, i: number) => (
                <span key={i} className="text-xs font-mono bg-muted px-2 py-0.5 rounded">
                  {p.process} · <DgStatusBadge value={p.status} /> · seq {p.sequence}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Standby destinations */}
        {ha.standby_dests?.length > 0 && (
          <div className="overflow-x-auto">
            <p className="text-xs font-semibold text-muted-foreground mb-1">Archive Destinations (Standby)</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left pb-1 pr-3 font-medium">Dest</th>
                  <th className="text-left pb-1 pr-3 font-medium">Target</th>
                  <th className="text-left pb-1 font-medium">Status</th>
                  <th className="text-left pb-1 pl-3 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {ha.standby_dests.map((d: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1 pr-3 font-mono">{d.dest_name}</td>
                    <td className="py-1 pr-3 text-muted-foreground truncate max-w-[200px]">{d.destination || '—'}</td>
                    <td className="py-1 pr-3"><DgStatusBadge value={d.status} /></td>
                    <td className={`py-1 pl-3 text-xs ${d.error ? 'text-critical' : 'text-muted-foreground'}`}>
                      {d.error ?? 'OK'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent DG status messages */}
        {ha.recent_messages?.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Recent Status Messages</p>
            <div className="space-y-1">
              {ha.recent_messages.map((msg: any, i: number) => (
                <div key={i} className="text-xs flex gap-2">
                  <span className="text-muted-foreground shrink-0">
                    {msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '—'}
                  </span>
                  <span className={msg.severity === 'Error' ? 'text-critical' : 'text-foreground'}>{msg.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  if (ha.type === 'streams') {
    return (
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">HA / Replication</p>
          <span className="text-sm font-bold text-brand-400">Oracle Streams</span>
        </div>
        <div className="space-y-1">
          {ha.details.map((d: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="font-mono text-foreground">{d.capture_name}</span>
              <DgStatusBadge value={d.status} />
              {d.error_message && <span className="text-critical">{d.error_message}</span>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return null
}

interface OracleDetailPanelProps {
  metrics: Record<string, any>
  name: string
}

export function OracleDetailPanel({ metrics: m, name }: OracleDetailPanelProps) {
  // Show error state when live adapter failed to connect
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

  const waitData = Object.entries(m.wait_breakdown ?? {}).map(([k, v]) => ({
    name: k.replace(/_/g, ' '),
    value: v as number,
  }))

  return (
    <div className="space-y-4">
      {/* ── Top info bar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Server info card */}
        <div className="rounded-xl border border-border bg-card p-4 text-sm space-y-1">
          <p className="font-bold text-base text-foreground">{name}</p>
          <p className="text-muted-foreground">Version: <span className="text-foreground font-mono">{m.db_version}</span></p>
          <p className="text-muted-foreground">Uptime: <span className="text-foreground">{m.uptime_days} days</span></p>
          <p className="text-muted-foreground">O/S: <span className="text-foreground font-mono">{m.os}</span></p>
          <p className="text-muted-foreground">CPUs: <span className="text-foreground">{m.cpus}</span></p>
        </div>
        {/* Clients */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clients</p>
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Number of Clients</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">{m.num_clients}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Avg Response Time</p>
              <p className="text-2xl font-bold tabular-nums text-foreground">{m.avg_response_ms} <span className="text-sm font-normal">ms</span></p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Network In / Out</p>
              <p className="text-sm font-bold tabular-nums text-foreground">{m.network_in_kbs} / {m.network_out_kbs} kB/s</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 2: Sessions | Waits | DB CPU | Blocking & I/O ─── */}
      <div className="grid grid-cols-4 gap-4">
        {/* Sessions */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessions</p>
          <MetricChart data={m.sessions_chart ?? []} color="#0072CE" height={100} label="Sessions" />
          <div className="flex gap-3 text-xs flex-wrap">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-critical inline-block" />{m.sessions_blocked} Blocked</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-warning inline-block" />{m.sessions_inactive} Inactive</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-success inline-block" />{m.sessions_active} Active</span>
          </div>
        </div>

        {/* Waits */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Waits</p>
          <Sparkline data={m.waits_chart ?? []} color="#F59E0B" height={60} />
          <WaitBreakdownChart data={waitData} height={120} />
        </div>

        {/* DB CPU Ratio */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">DB CPU Ratio</p>
          <MetricChart
            data={m.db_cpu_chart ?? []}
            color="#10B981"
            height={100}
            label="CPU %"
            format={(v) => `${v}%`}
          />
          <p className="text-2xl font-bold tabular-nums text-success text-center">{m.db_cpu_ratio_pct}%</p>
        </div>

        {/* Blocking & I/O */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {/* Blocking */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Blocking & Deadlocks</p>
            <div className="grid grid-cols-2 gap-3">
              {(() => { const blocked = m.blocking_spids ?? m.sessions_blocked ?? 0; return (
                <div className={`rounded-lg p-2.5 text-center ${blocked > 0 ? 'bg-critical/10 border border-critical/30' : 'bg-muted/50'}`}>
                  <p className={`text-2xl font-bold tabular-nums ${blocked > 0 ? 'text-critical' : 'text-success'}`}>{blocked}</p>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Blocked</p>
                </div>
              )})()}
              <div className={`rounded-lg p-2.5 text-center ${(m.deadlocks_total ?? 0) > 0 ? 'bg-warning/10 border border-warning/30' : 'bg-muted/50'}`}>
                <p className={`text-2xl font-bold tabular-nums ${(m.deadlocks_total ?? 0) > 0 ? 'text-warning' : 'text-success'}`}>{m.deadlocks_total ?? 0}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Deadlocks</p>
              </div>
            </div>
          </div>
          {/* I/O */}
          <div className="border-t border-border pt-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Disk I/O</p>
            <Sparkline data={m.io_chart ?? []} color="#10B981" height={50} />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <p className="text-xl font-bold font-mono tabular-nums text-foreground" title={`${(m.disk_reads_per_sec ?? 0).toLocaleString()}`}>{fmtNum(m.disk_reads_per_sec ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Phys. Reads</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-2.5 text-center">
                <p className="text-xl font-bold font-mono tabular-nums text-foreground" title={`${(m.disk_writes_per_sec ?? 0).toLocaleString()}`}>{fmtNum(m.disk_writes_per_sec ?? 0)}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">Phys. Writes</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 3: Processes ─────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Processes</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5 text-sm">
            {[
              ['Number of Dispatchers',       m.num_dispatchers],
              ['Number of Shared Servers',    m.num_shared_servers],
              ['Number of Dedicated Servers', m.num_dedicated_servers],
              ['Number of Parallel Servers',  m.num_parallel_servers],
              ['Number of Busy Parallel',     m.num_busy_parallel],
              ['Number of Job Servers',       m.num_job_servers],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold text-foreground tabular-nums">{val}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Execution Rate</p>
              <Sparkline data={m.execution_rate_chart ?? []} color="#0072CE" height={50} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Parse Rate</p>
              <Sparkline data={m.parse_rate_chart ?? []} color="#8B5CF6" height={50} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Open Cursors</p>
              <Sparkline data={m.open_cursors_chart ?? []} color="#F59E0B" height={50} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Commit Rate</p>
              <Sparkline data={m.commit_rate_chart ?? []} color="#10B981" height={50} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 4: Memory ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Memory</p>
        <div className="grid grid-cols-3 gap-4">
          {/* DB Block Rate */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">DB Block Rate</p>
            <MetricChart data={m.db_block_rate_chart ?? []} color="#0072CE" height={100} label="Blocks/s" />
          </div>
          {/* Logical Reads */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Logical Reads</p>
            <MetricChart
              data={m.logical_reads_chart ?? []}
              color="#8B5CF6"
              height={100}
              label="Reads"
              format={(v) => (v / 1000).toFixed(0) + 'K'}
            />
          </div>
          {/* Redo Generated */}
          <div>
            <p className="text-xs text-muted-foreground mb-1">Redo Generated</p>
            <MetricChart data={m.redo_generated_chart ?? []} color="#F59E0B" height={100} label="Bytes/s" />
          </div>
        </div>
        {/* Allocation table */}
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm border-t border-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground col-span-2 mb-1">Allocation</p>
          {[
            ['SGA Currently Used',  `${m.sga_currently_used_gb} GB`],
            ['SGA Maximum Size',    `${m.sga_maximum_size_gb} GB`],
            ['Buffer Cache Size',   `${m.buffer_cache_size_gb} GB`],
            ['Redo Log Buffers',    `${m.redo_log_buffers_mb} MB`],
            ['Shared Pool Size',    `${m.shared_pool_size_gb} GB`],
            ['Large Pool Size',     `${m.large_pool_size_mb} MB`],
          ].map(([label, val]) => (
            <div key={String(label)} className="flex justify-between border-b border-border/40 pb-1">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-mono font-semibold text-foreground">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Row 5: Storage + Redo Log ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Storage */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Storage — Files</p>
          <div className="flex justify-around">
            <StorageCylinder label="Data"      usedPct={m.storage_data_pct ?? 0} sizeLabel={`${m.storage_data_tb} TB`} />
            <StorageCylinder label="Temporary" usedPct={m.storage_temp_pct ?? 0} sizeLabel={`${m.storage_temp_gb} GB`} />
            <StorageCylinder label="Undo"      usedPct={m.storage_undo_pct ?? 0} sizeLabel={`${m.storage_undo_gb} GB`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">I/O (Mb/s)</p>
            <MetricChart data={m.storage_io_chart ?? []} color="#0072CE" height={80} label="Mb/s" />
          </div>
        </div>

        {/* Redo Log */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Redo Log</p>
          <div className="flex items-center gap-4">
            <StorageCylinder
              label={m.redo_log_group ?? '#—'}
              usedPct={m.redo_log_used_pct ?? 0}
              sizeLabel={`${m.redo_log_size_gb} GB`}
            />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-1">Log File Fill Time</p>
              <MetricChart data={m.redo_log_fill_chart ?? []} color="#F59E0B" height={80} label="H:MM" />
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground mb-1">Log Counts by Status</p>
            <div className="space-y-1 text-sm">
              {[
                ['Current',          m.log_count_current],
                ['Active',           m.log_count_active],
                ['Inactive',         m.log_count_inactive],
                ['Cleaning',         m.log_count_cleaning],
                ['Current Clearing', 0],
                ['Unused',           m.log_count_unused],
              ].map(([label, val]) => (
                <div key={String(label)} className="flex justify-between border-b border-border/40 pb-0.5">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-mono tabular-nums text-foreground">{val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 6: HA / Data Guard state ────────────────────────── */}
      <OracleHaStateCard ha={m.ha_state} />

      {/* ── Row 7: Tablespace Utilization ───────────────────────── */}
      {(m.disk_mounts ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tablespace Utilization</p>
          <div className="space-y-2">
            {(m.disk_mounts as any[]).map((ts: any) => (
              <div key={ts.mount} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-mono text-foreground">{ts.mount}</span>
                  <span className="text-muted-foreground">{ts.used_gb} / {ts.total_gb} GB — {ts.used_pct}%</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full ${ts.used_pct >= 90 ? 'bg-critical' : ts.used_pct >= 75 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${Math.min(100, ts.used_pct)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Row 7: Backup History (RMAN) ────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Backup History (RMAN)</p>
        {(m.backup_history ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No RMAN backup history found — requires SELECT on V$RMAN_BACKUP_JOB_DETAILS</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left pb-1 pr-3 font-medium">Type</th>
                  <th className="text-left pb-1 pr-3 font-medium">Status</th>
                  <th className="text-left pb-1 pr-3 font-medium">Started</th>
                  <th className="text-left pb-1 pr-3 font-medium">Duration</th>
                  <th className="text-right pb-1 font-medium">Size (GB)</th>
                </tr>
              </thead>
              <tbody>
                {(m.backup_history as any[]).map((b: any, i: number) => (
                  <tr key={i} className="border-b border-border/30">
                    <td className="py-1 pr-3 font-mono">{b.type}</td>
                    <td className={`py-1 pr-3 font-semibold ${b.status === 'COMPLETED' ? 'text-success' : b.status === 'FAILED' ? 'text-critical' : 'text-warning'}`}>
                      {b.status}
                    </td>
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
