// ─── Database Types ──────────────────────────────────────────────────────────

export type DbType = 'oracle' | 'mssql' | 'mariadb'
export type Environment = 'production' | 'uat' | 'dr'
export type ConnectionStatus = 'active' | 'inactive' | 'error'

export interface DbConnection {
  id: string
  name: string
  db_type: DbType
  environment: Environment
  host: string
  port: number
  database?: string
  service_name?: string      // Oracle: service name or SID
  database_name?: string     // MSSQL / MariaDB default database
  has_credentials: boolean   // true = encrypted creds stored server-side
  oracle_privilege?: 'SYSDBA' | 'SYSOPER'  // Oracle only: connect as privileged role
  status: ConnectionStatus
  agent_name: string
  prod_pair_id?: string
  last_checked_at?: string
  created_at: string
}

// ─── Health Types ────────────────────────────────────────────────────────────

export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown'

export interface HealthSnapshot {
  id: string
  connection_id: string
  score: number // 0-100
  status: HealthStatus
  metrics: Record<string, unknown>
  active_alerts: number
  blocked_sessions: number
  scored_at: string
}

// ─── Alert Types ─────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'active' | 'acknowledged' | 'resolved'

export interface Alert {
  id: string
  connection_id: string
  severity: AlertSeverity
  status: AlertStatus
  type: string
  message: string
  details?: Record<string, unknown>
  created_at: string
  resolved_at?: string
}

// ─── Script Types ────────────────────────────────────────────────────────────

export type RiskLevel = 'zero' | 'low' | 'medium' | 'high'
export type ScriptSource = 'internal' | 'oem'

export interface RemediationScript {
  id: string
  name: string
  description: string
  db_type: DbType
  risk_level: RiskLevel
  source: ScriptSource
  sql_content: string
  verified_at?: string
  verified_by?: string
  created_at: string
}

// ─── Sandbox Types ───────────────────────────────────────────────────────────

export type SandboxRunStatus = 'success' | 'failed' | 'running'

export interface SandboxRun {
  id: string
  script_id: string
  uat_connection_id: string
  status: SandboxRunStatus
  exec_time_ms?: number
  cpu_impact_pct?: number
  output?: string
  error?: string
  triggered_by: string
  run_at: string
}

// ─── Bot / Agent Types ───────────────────────────────────────────────────────

export type BotName = 'orabot' | 'msbot' | 'marbot'
export type MessageRole = 'user' | 'assistant' | 'tool'

export interface BotMessage {
  id: string
  session_id: string
  bot: BotName
  role: MessageRole
  content: string
  tool_calls?: unknown[]
  created_at: string
}

// ─── RBAC Types ──────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'dba' | 'analyst' | 'viewer'

export interface User {
  id: string
  email: string
  full_name?: string
  role: UserRole
  created_at: string
}

// ─── Activity Log Types ──────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string
  actor_id: string
  actor_name: string
  action: string
  target_type: string
  target_id?: string
  payload?: Record<string, unknown>
  created_at: string
}

// ─── DR Management Types ─────────────────────────────────────────────────────

export type DrillResult = 'pass' | 'fail' | 'partial' | 'aborted'

export interface DrPair {
  id: string
  prod_connection_id: string
  dr_connection_id: string
  rpo_target_minutes: number
  rto_target_minutes: number
  notes?: string
  created_by?: string
  created_at: string
  updated_at: string
  // joined fields
  prod_connection?: DbConnection
  dr_connection?: DbConnection
}

export interface DrDrill {
  id: string
  pair_id: string
  result: DrillResult
  started_at: string
  completed_at?: string
  duration_min?: number
  rpo_actual_min?: number
  rto_actual_min?: number
  notes?: string
  run_by?: string
  created_at: string
  // joined
  run_by_name?: string
}

// ─── Report Types ────────────────────────────────────────────────────────────

export type ReportType = 'capacity' | 'fleet' | 'dr-readiness' | 'incidents' | 'audit'

export interface CapacityTrendPoint {
  t: string
  storage_pct: number | null
  connections_pct: number | null
  memory_pct: number | null
  score: number | null
}

export interface CapacityReport {
  connection_id: string
  connection_name: string
  db_type: DbType
  environment: Environment
  trend: CapacityTrendPoint[]
  current: {
    storage_pct: number | null
    connections_pct: number | null
    memory_pct: number | null
    throughput: number | null
  }
}

export interface FleetHealthSummary {
  total_connections: number
  by_status: Record<HealthStatus, number>
  by_db_type: Record<string, { count: number; avg_score: number | null }>
  by_environment: Record<string, { count: number; avg_score: number | null }>
  worst_performers: { id: string; name: string; db_type: DbType; score: number; status: HealthStatus }[]
  fleet_avg_score: number | null
  score_distribution: { range: string; count: number }[]
}

export interface DrReadinessReport {
  pair_id: string
  prod_name: string
  dr_name: string
  db_type: DbType
  rpo_target: number
  rto_target: number
  last_drill_date: string | null
  last_drill_result: DrillResult | null
  last_rpo_actual: number | null
  last_rto_actual: number | null
  drill_count: number
  pass_rate: number | null
  readiness: 'ready' | 'overdue' | 'at-risk' | 'never-tested'
}

export interface IncidentSummary {
  total_alerts: number
  by_severity: Record<AlertSeverity, number>
  by_status: Record<string, number>
  by_connection: { connection_id: string; name: string; count: number }[]
  by_type: { type: string; count: number }[]
  timeline: { t: string; critical: number; warning: number; info: number }[]
  mttr_hours: number | null
}

export interface AuditEntry {
  id: string
  actor_name: string
  action: string
  target_type: string
  target_id?: string
  payload?: Record<string, unknown>
  created_at: string
}

// ─── API Response Types ──────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T = unknown> {
  data: T[]
  total: number
  page: number
  per_page: number
}
