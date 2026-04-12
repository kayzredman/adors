-- ============================================================
-- ADORS — Seed Data
-- Development / UAT seed for testing
-- ============================================================

-- ─── Connections ─────────────────────────────────────────────────────────────

insert into public.connections (id, name, db_type, environment, host, port, agent_name, status) values
  ('11111111-0000-0000-0000-000000000001', 'PROD_ORA_01',  'oracle',  'production', 'ora-prod-01.internal',   1521, 'OraBot', 'active'),
  ('11111111-0000-0000-0000-000000000002', 'UAT_ORA_01',   'oracle',  'uat',        'ora-uat-01.internal',    1521, 'OraBot', 'active'),
  ('11111111-0000-0000-0000-000000000003', 'PROD_SQL_01',  'mssql',   'production', 'sql-prod-01.internal',   1433, 'MsBot',  'active'),
  ('11111111-0000-0000-0000-000000000004', 'UAT_SQL_01',   'mssql',   'uat',        'sql-uat-01.internal',    1433, 'MsBot',  'active'),
  ('11111111-0000-0000-0000-000000000005', 'PROD_MAR_01',  'mariadb', 'production', 'maria-prod-01.internal', 3306, 'MarBot', 'active'),
  ('11111111-0000-0000-0000-000000000006', 'UAT_MAR_01',   'mariadb', 'uat',        'maria-uat-01.internal',  3306, 'MarBot', 'active'),
  ('11111111-0000-0000-0000-000000000007', 'DR_ORA_01',    'oracle',  'dr',         'ora-dr-01.internal',     1521, 'OraBot', 'active'),
  ('11111111-0000-0000-0000-000000000008', 'DR_SQL_01',    'mssql',   'dr',         'sql-dr-01.internal',     1433, 'MsBot',  'active');

-- Set prod/uat pairs
update public.connections set prod_pair_id = '11111111-0000-0000-0000-000000000001' where id = '11111111-0000-0000-0000-000000000002';
update public.connections set prod_pair_id = '11111111-0000-0000-0000-000000000003' where id = '11111111-0000-0000-0000-000000000004';
update public.connections set prod_pair_id = '11111111-0000-0000-0000-000000000005' where id = '11111111-0000-0000-0000-000000000006';

-- ─── Remediation Scripts ─────────────────────────────────────────────────────

insert into public.scripts (name, description, db_type, risk_level, source, sql_content) values
  (
    'Kill Blocking Session',
    'Identifies and kills the blocking session causing chain blocks',
    'oracle', 'low', 'internal',
    'ALTER SYSTEM KILL SESSION ''&sid,&serial#'' IMMEDIATE;'
  ),
  (
    'Resize Datafile',
    'Extends a datafile to relieve tablespace pressure',
    'oracle', 'medium', 'oem',
    'ALTER DATABASE DATAFILE ''&filename'' RESIZE &size_mb M;'
  ),
  (
    'Clear Temp Tablespace',
    'Shrinks TEMP tablespace to reclaim space',
    'oracle', 'zero', 'internal',
    'ALTER TABLESPACE TEMP SHRINK SPACE KEEP 100M;'
  ),
  (
    'Kill Blocking SPID',
    'Terminates a SQL Server blocking session by SPID',
    'mssql', 'low', 'internal',
    'KILL &spid;'
  ),
  (
    'MSSQL Memory Pressure Relief',
    'Clears procedure cache to relieve memory pressure',
    'mssql', 'medium', 'oem',
    'DBCC FREEPROCCACHE; DBCC DROPCLEANBUFFERS;'
  ),
  (
    'Kill Slow MariaDB Query',
    'Terminates a long-running MariaDB query by thread ID',
    'mariadb', 'low', 'internal',
    'KILL QUERY &thread_id;'
  ),
  (
    'Optimize InnoDB Buffer Pool',
    'Flushes InnoDB buffer pool for performance recovery',
    'mariadb', 'medium', 'oem',
    'SET GLOBAL innodb_buffer_pool_size = @@innodb_buffer_pool_size;'
  ),
  (
    'Analyze Slow Query Tables',
    'Runs ANALYZE TABLE on tables flagged in slow query log',
    'mariadb', 'zero', 'internal',
    'ANALYZE TABLE &table_name;'
  );

-- ─── Initial Alerts (sample) ─────────────────────────────────────────────────

insert into public.alerts (connection_id, severity, status, type, message) values
  ('11111111-0000-0000-0000-000000000001', 'critical', 'active',       'tablespace_near_limit', 'SYSTEM tablespace at 87% — DBA review required'),
  ('11111111-0000-0000-0000-000000000001', 'warning',  'acknowledged', 'blocked_sessions',      '3 sessions blocked — chain blocking detected'),
  ('11111111-0000-0000-0000-000000000003', 'warning',  'active',       'high_memory_usage',     'Buffer pool consuming 89% of available RAM'),
  ('11111111-0000-0000-0000-000000000005', 'info',     'resolved',     'health_scan',           'Scheduled 5-minute health scan completed — 96% healthy');
