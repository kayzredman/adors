'use client'

import { MetricChart, Sparkline, WaitBreakdownChart, StorageCylinder } from '@/components/ui/Charts'

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

      {/* ── Row 2: Sessions | Waits | DB CPU ──────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
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
    </div>
  )
}
