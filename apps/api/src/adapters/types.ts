/**
 * DB Adapter interface — every live adapter implements this.
 * The metrics shape mirrors what healthScanner mock adapters return
 * so OracleDetailPanel / MssqlDetailPanel / MariaDbDetailPanel work unchanged.
 */
export interface DbAdapter {
  /**
   * Connect and collect health metrics.
   * Connections are short-lived (open → query → close) for each scan.
   */
  getHealthMetrics(creds: DbCredentials): Promise<Record<string, unknown>>
  testConnection(creds: DbCredentials): Promise<{ ok: boolean; latency_ms: number }>
  /**
   * Execute a read-only SQL query for agent tool calling.
   * Only SELECT / WITH / EXPLAIN statements are accepted — the adapter validates
   * this before sending to the database.
   */
  executeQuery(creds: DbCredentials, sql: string, timeoutMs?: number): Promise<QueryResult>
  /**
   * Execute a pre-approved write/remediation command (KILL SESSION, ALTER SYSTEM, etc.).
   * Only allowed command patterns are accepted — the adapter validates against an allow-list.
   * Returns the result or throws an error.
   */
  executeRemediation(creds: DbCredentials, command: string, timeoutMs?: number): Promise<RemediationResult>

  // ─── Tiered metric queries ──────────────────────────────────────────────
  // Split health metrics into 3 tiers with different freshness requirements.
  // The health scanner uses Redis TTL cache to avoid re-running queries
  // whose cached results are still fresh.

  /**
   * HOT tier — session/blocking/waits/HA state.
   * Changes second-to-second. Cached for 90s.
   */
  queryHotMetrics(creds: DbCredentials): Promise<Record<string, unknown>>

  /**
   * WARM tier — memory/CPU/IO/disk utilization.
   * Drifts over minutes. Cached for 10 min.
   */
  queryWarmMetrics(creds: DbCredentials): Promise<Record<string, unknown>>

  /**
   * COLD tier — version/backups/static config.
   * Changes hourly/daily. Cached for 30 min.
   */
  queryColdMetrics(creds: DbCredentials): Promise<Record<string, unknown>>
}

export interface DbCredentials {
  host:     string
  port:     number
  database: string        // service name / db name / schema
  username: string
  password: string
  /** Extra driver-specific options */
  options?: Record<string, unknown>
}

export interface QueryResult {
  columns:     string[]
  rows:        Record<string, unknown>[]
  rowCount:    number
  executionMs: number
}

export interface RemediationResult {
  success:     boolean
  message:     string
  executionMs: number
}

/**
 * Allow-listed remediation command patterns per DB type.
 * Each pattern is a regex tested against the normalized (uppercased, trimmed) command.
 */
export const REMEDIATION_ALLOW_LIST: Record<string, RegExp[]> = {
  oracle: [
    /^ALTER\s+SYSTEM\s+KILL\s+SESSION\b/,
    /^ALTER\s+SYSTEM\s+DISCONNECT\s+SESSION\b/,
    /^ALTER\s+TABLESPACE\s+\S+\s+ADD\s+DATAFILE\b/,
    /^ALTER\s+SYSTEM\s+SET\b/,
    /^ALTER\s+SYSTEM\s+FLUSH\s+SHARED_POOL\b/,
    /^ALTER\s+SYSTEM\s+FLUSH\s+BUFFER_CACHE\b/,
    /^ALTER\s+SYSTEM\s+SWITCH\s+LOGFILE\b/,
  ],
  mssql: [
    /^KILL\s+\d+/,
    /^DBCC\s+FREEPROCCACHE\b/,
    /^DBCC\s+DROPCLEANBUFFERS\b/,
    /^DBCC\s+SHRINKFILE\b/,
    /^ALTER\s+DATABASE\b/,
    /^ALTER\s+INDEX\b.*\bREBUILD\b/,
    /^ALTER\s+INDEX\b.*\bREORGANIZE\b/,
  ],
  mariadb: [
    /^KILL\s+\d+/,
    /^KILL\s+QUERY\s+\d+/,
    /^FLUSH\s+TABLES\b/,
    /^FLUSH\s+QUERY\s+CACHE\b/,
    /^OPTIMIZE\s+TABLE\b/,
    /^SET\s+GLOBAL\b/,
  ],
}
