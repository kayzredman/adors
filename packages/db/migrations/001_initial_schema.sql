-- ============================================================
-- ADORS — Initial Schema Migration
-- Run against self-hosted Supabase Postgres
-- ============================================================

-- Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ─── Enums ──────────────────────────────────────────────────────────────────

create type db_type      as enum ('oracle', 'mssql', 'mariadb');
create type environment  as enum ('production', 'uat');
create type conn_status  as enum ('active', 'inactive', 'error');
create type health_status as enum ('healthy', 'warning', 'critical', 'unknown');
create type alert_severity as enum ('critical', 'warning', 'info');
create type alert_status   as enum ('active', 'acknowledged', 'resolved');
create type risk_level     as enum ('zero', 'low', 'medium', 'high');
create type script_source  as enum ('internal', 'oem');
create type sandbox_status as enum ('success', 'failed', 'running');
create type user_role      as enum ('super_admin', 'dba', 'analyst', 'viewer');

-- ─── Users (extends Supabase auth.users) ────────────────────────────────────

create table public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        user_role not null default 'viewer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ─── Database Connections ────────────────────────────────────────────────────

create table public.connections (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null unique,
  db_type         db_type not null,
  environment     environment not null,
  host            text not null,
  port            integer not null,
  database_name   text,
  agent_name      text not null,
  prod_pair_id    uuid references public.connections(id) on delete set null,
  status          conn_status not null default 'active',
  -- credentials stored as references to secrets manager / env — never plaintext
  credentials_ref text,
  last_checked_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─── Health Snapshots (time-series) ─────────────────────────────────────────

create table public.health_snapshots (
  id               uuid primary key default uuid_generate_v4(),
  connection_id    uuid not null references public.connections(id) on delete cascade,
  score            integer not null check (score between 0 and 100),
  status           health_status not null,
  metrics          jsonb not null default '{}',
  active_alerts    integer not null default 0,
  blocked_sessions integer not null default 0,
  scored_at        timestamptz not null default now()
);

create index idx_health_snapshots_connection_id on public.health_snapshots(connection_id);
create index idx_health_snapshots_scored_at     on public.health_snapshots(scored_at desc);

-- ─── Alerts ─────────────────────────────────────────────────────────────────

create table public.alerts (
  id            uuid primary key default uuid_generate_v4(),
  connection_id uuid not null references public.connections(id) on delete cascade,
  severity      alert_severity not null,
  status        alert_status not null default 'active',
  type          text not null,
  message       text not null,
  details       jsonb default '{}',
  acknowledged_by uuid references public.user_profiles(id) on delete set null,
  acknowledged_at timestamptz,
  resolved_by   uuid references public.user_profiles(id) on delete set null,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index idx_alerts_connection_id on public.alerts(connection_id);
create index idx_alerts_status        on public.alerts(status);
create index idx_alerts_severity      on public.alerts(severity);
create index idx_alerts_created_at    on public.alerts(created_at desc);

-- ─── Remediation Scripts ─────────────────────────────────────────────────────

create table public.scripts (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  description  text,
  db_type      db_type not null,
  risk_level   risk_level not null,
  source       script_source not null default 'internal',
  sql_content  text not null,
  verified_at  timestamptz,
  verified_by  uuid references public.user_profiles(id) on delete set null,
  created_by   uuid references public.user_profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─── Sandbox Runs ───────────────────────────────────────────────────────────

create table public.sandbox_runs (
  id                  uuid primary key default uuid_generate_v4(),
  script_id           uuid not null references public.scripts(id) on delete cascade,
  uat_connection_id   uuid not null references public.connections(id) on delete cascade,
  status              sandbox_status not null default 'running',
  exec_time_ms        integer,
  cpu_impact_pct      numeric(5,2),
  output              text,
  error               text,
  triggered_by        uuid not null references public.user_profiles(id) on delete cascade,
  run_at              timestamptz not null default now()
);

create index idx_sandbox_runs_script_id on public.sandbox_runs(script_id);
create index idx_sandbox_runs_run_at    on public.sandbox_runs(run_at desc);

-- ─── Bot Messages ────────────────────────────────────────────────────────────

create table public.bot_messages (
  id          uuid primary key default uuid_generate_v4(),
  session_id  text not null,
  user_id     uuid references public.user_profiles(id) on delete cascade,
  bot         text not null check (bot in ('orabot', 'msbot', 'marbot')),
  role        text not null check (role in ('user', 'assistant', 'tool')),
  content     text not null,
  tool_calls  jsonb,
  created_at  timestamptz not null default now()
);

create index idx_bot_messages_session_id on public.bot_messages(session_id);
create index idx_bot_messages_created_at on public.bot_messages(created_at desc);

-- ─── Activity Log ────────────────────────────────────────────────────────────

create table public.activity_log (
  id           uuid primary key default uuid_generate_v4(),
  actor_id     uuid references public.user_profiles(id) on delete set null,
  actor_name   text not null,
  action       text not null,
  target_type  text not null,
  target_id    uuid,
  payload      jsonb default '{}',
  created_at   timestamptz not null default now()
);

create index idx_activity_log_created_at on public.activity_log(created_at desc);
create index idx_activity_log_actor_id   on public.activity_log(actor_id);

-- ─── Notification Channels ──────────────────────────────────────────────────

create table public.notification_channels (
  id         uuid primary key default uuid_generate_v4(),
  type       text not null check (type in ('whatsapp', 'teams', 'email')),
  name       text not null,
  config     jsonb not null default '{}',
  enabled    boolean not null default true,
  created_at timestamptz not null default now()
);

-- ─── RLS Policies ────────────────────────────────────────────────────────────

alter table public.user_profiles         enable row level security;
alter table public.connections            enable row level security;
alter table public.health_snapshots       enable row level security;
alter table public.alerts                 enable row level security;
alter table public.scripts                enable row level security;
alter table public.sandbox_runs           enable row level security;
alter table public.bot_messages           enable row level security;
alter table public.activity_log           enable row level security;
alter table public.notification_channels  enable row level security;

-- All authenticated users can read core data
create policy "authenticated read connections"     on public.connections      for select using (auth.role() = 'authenticated');
create policy "authenticated read health"          on public.health_snapshots for select using (auth.role() = 'authenticated');
create policy "authenticated read alerts"          on public.alerts           for select using (auth.role() = 'authenticated');
create policy "authenticated read scripts"         on public.scripts          for select using (auth.role() = 'authenticated');
create policy "authenticated read sandbox_runs"    on public.sandbox_runs     for select using (auth.role() = 'authenticated');
create policy "authenticated read activity_log"    on public.activity_log     for select using (auth.role() = 'authenticated');
create policy "users read own profile"             on public.user_profiles    for select using (auth.uid() = id);

-- Service role bypasses RLS (used by API server)
-- This is handled automatically by Supabase service key

-- ─── Updated At Trigger ─────────────────────────────────────────────────────

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at_connections
  before update on public.connections
  for each row execute function update_updated_at();

create trigger set_updated_at_scripts
  before update on public.scripts
  for each row execute function update_updated_at();

create trigger set_updated_at_user_profiles
  before update on public.user_profiles
  for each row execute function update_updated_at();
