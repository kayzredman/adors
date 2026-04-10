'use client'

import { MetricChart, Sparkline, StorageCylinder } from '@/components/ui/Charts'

interface MariaDbDetailPanelProps {
  metrics: Record<string, any>
  name: string
}

export function MariaDbDetailPanel({ metrics: m, name }: MariaDbDetailPanelProps) {
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
          <MetricChart data={m.connection_chart ?? []} color="#0072CE" height={80} label="Connections" />
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Active / Max</span>
            <span className="font-mono font-semibold text-foreground">{m.active_connections} / {m.max_connections}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Threads Running</span>
            <span className="font-mono font-semibold text-foreground">{m.threads_running}</span>
          </div>
        </div>
      </div>

      {/* InnoDB Buffer Pool */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">InnoDB Buffer Pool</p>
          <MetricChart
            data={m.buffer_hit_chart ?? []}
            color="#10B981"
            height={100}
            label="Hit Ratio %"
            format={(v) => `${v}%`}
          />
          <div className="grid grid-cols-2 gap-x-4 text-sm mt-1">
            {[
              ['Buffer Pool Size',  `${m.innodb_buffer_pool_size_gb} GB`],
              ['Hit Ratio',        `${m.innodb_buffer_hit_ratio_pct}%`],
              ['Rows Read/s',       m.innodb_rows_read_per_sec?.toLocaleString()],
              ['Rows Written/s',    m.innodb_rows_written_per_sec?.toLocaleString()],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Query throughput */}
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Query Throughput</p>
          <MetricChart data={m.query_chart ?? []} color="#0072CE" height={100} label="Queries/s" />
          <div className="grid grid-cols-2 gap-x-4 text-sm mt-1">
            {[
              ['Total/s',   m.queries_per_sec?.toLocaleString()],
              ['SELECT/s',  m.select_per_sec?.toLocaleString()],
              ['INSERT/s',  m.insert_per_sec?.toLocaleString()],
              ['UPDATE/s',  m.update_per_sec?.toLocaleString()],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between border-b border-border/40 pb-1">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-mono font-semibold text-foreground">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slow Queries + Replication + Storage */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slow Queries</p>
          <MetricChart data={m.slow_query_chart ?? []} color="#F59E0B" height={90} label="Slow/min" />
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Slow/min</span>
            <span className={`font-bold tabular-nums ${(m.slow_queries_per_min ?? 0) > 3 ? 'text-warning' : 'text-success'}`}>
              {m.slow_queries_per_min}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Long Query Time</span>
            <span className="font-mono text-foreground">{m.long_query_time_sec}s</span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Replication</p>
          {!m.replication_running && !m.replication_master_host ? (
            <p className="text-xs text-muted-foreground italic">Not configured as a replica — this may be a primary node.</p>
          ) : (
            <>
              <MetricChart data={m.replication_lag_chart ?? []} color="#8B5CF6" height={70} label="Lag (s)" />
              <div className="space-y-1 text-xs mt-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">IO Thread</span>
                  <span className={`font-bold ${m.replication_io_running === 'Yes' ? 'text-success' : 'text-critical'}`}>{m.replication_io_running ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">SQL Thread</span>
                  <span className={`font-bold ${m.replication_sql_running === 'Yes' ? 'text-success' : 'text-critical'}`}>{m.replication_sql_running ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lag</span>
                  <span className={`font-bold tabular-nums ${(m.replication_lag_sec ?? 0) > 5 ? 'text-critical' : 'text-success'}`}>{m.replication_lag_sec}s</span>
                </div>
                {m.replication_master_host && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Master</span>
                    <span className="font-mono text-foreground truncate text-right">{m.replication_master_host}</span>
                  </div>
                )}
                {m.replication_master_log_file && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Master Log</span>
                    <span className="font-mono text-foreground truncate text-right">{m.replication_master_log_file}:{m.replication_master_log_pos}</span>
                  </div>
                )}
                {m.replication_last_error && (
                  <div className="mt-1 rounded bg-critical/10 border border-critical/30 px-2 py-1">
                    <p className="text-[11px] text-critical break-all">{m.replication_last_error}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Schema Storage</p>
          <StorageCylinder
            label="Schema Data"
            usedPct={m.disk_usage_pct ?? 0}
            sizeLabel={`${m.disk_used_gb} / ${m.disk_total_gb} GB`}
          />
          <MetricChart data={m.disk_io_chart ?? []} color="#EF4444" height={70} label="I/O ops/s" />
          <p className="text-[10px] text-muted-foreground/60 italic">Derived from information_schema — OS disk not accessible via SQL</p>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Table Lock Waits</span>
            <span className={`font-bold tabular-nums ${(m.table_lock_waited ?? 0) > 0 ? 'text-warning' : 'text-success'}`}>
              {m.table_lock_waited}
            </span>
          </div>
        </div>
      </div>

      {/* ── Schema / DB Sizes ────────────────────────────────────── */}
      {(m.disk_mounts ?? []).length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Database Schema Sizes</p>
          <div className="space-y-2">
            {(m.disk_mounts as any[]).map((s: any) => (
              <div key={s.mount} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-mono text-foreground">{s.label ?? s.mount}</span>
                  <span className="text-muted-foreground">{s.used_gb} GB</span>
                </div>
                <div className="bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-2 rounded-full bg-brand-500"
                    style={{
                      width: `${Math.min(100, (s.used_gb / Math.max(...(m.disk_mounts as any[]).map((x: any) => x.used_gb), 0.001)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Backup History ───────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Backup History</p>
        <p className="text-sm text-muted-foreground italic">
          MariaDB does not expose backup history via SQL. Use <span className="font-mono">mariabackup</span> or <span className="font-mono">mysqldump</span> logs on the host to track backups.
        </p>
      </div>
    </div>
  )
}
