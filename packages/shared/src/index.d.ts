export type DbType = 'oracle' | 'mssql' | 'mariadb';
export type Environment = 'production' | 'uat';
export type ConnectionStatus = 'active' | 'inactive' | 'error';
export interface DbConnection {
    id: string;
    name: string;
    db_type: DbType;
    environment: Environment;
    host: string;
    port: number;
    database?: string;
    service_name?: string;
    database_name?: string;
    has_credentials: boolean;
    oracle_privilege?: 'SYSDBA' | 'SYSOPER';
    status: ConnectionStatus;
    agent_name: string;
    prod_pair_id?: string;
    last_checked_at?: string;
    created_at: string;
}
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export interface HealthSnapshot {
    id: string;
    connection_id: string;
    score: number;
    status: HealthStatus;
    metrics: Record<string, unknown>;
    active_alerts: number;
    blocked_sessions: number;
    scored_at: string;
}
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'active' | 'acknowledged' | 'resolved';
export interface Alert {
    id: string;
    connection_id: string;
    severity: AlertSeverity;
    status: AlertStatus;
    type: string;
    message: string;
    details?: Record<string, unknown>;
    created_at: string;
    resolved_at?: string;
}
export type RiskLevel = 'zero' | 'low' | 'medium' | 'high';
export type ScriptSource = 'internal' | 'oem';
export interface RemediationScript {
    id: string;
    name: string;
    description: string;
    db_type: DbType;
    risk_level: RiskLevel;
    source: ScriptSource;
    sql_content: string;
    verified_at?: string;
    verified_by?: string;
    created_at: string;
}
export type SandboxRunStatus = 'success' | 'failed' | 'running';
export interface SandboxRun {
    id: string;
    script_id: string;
    uat_connection_id: string;
    status: SandboxRunStatus;
    exec_time_ms?: number;
    cpu_impact_pct?: number;
    output?: string;
    error?: string;
    triggered_by: string;
    run_at: string;
}
export type BotName = 'orabot' | 'msbot' | 'marbot';
export type MessageRole = 'user' | 'assistant' | 'tool';
export interface BotMessage {
    id: string;
    session_id: string;
    bot: BotName;
    role: MessageRole;
    content: string;
    tool_calls?: unknown[];
    created_at: string;
}
export type UserRole = 'super_admin' | 'dba' | 'analyst' | 'viewer';
export interface User {
    id: string;
    email: string;
    full_name?: string;
    role: UserRole;
    created_at: string;
}
export interface ActivityLogEntry {
    id: string;
    actor_id: string;
    actor_name: string;
    action: string;
    target_type: string;
    target_id?: string;
    payload?: Record<string, unknown>;
    created_at: string;
}
export interface ApiResponse<T = unknown> {
    data?: T;
    error?: string;
    message?: string;
}
export interface PaginatedResponse<T = unknown> {
    data: T[];
    total: number;
    page: number;
    per_page: number;
}
//# sourceMappingURL=index.d.ts.map