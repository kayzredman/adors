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
}

export interface DbCredentials {
  grehost:     string
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
