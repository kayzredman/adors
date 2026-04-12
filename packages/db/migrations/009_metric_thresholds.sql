-- ============================================================
-- ADORS — Metric Thresholds
-- User-configurable warning / critical thresholds for capacity metrics
-- ============================================================

create table public.metric_thresholds (
  id                  uuid primary key default uuid_generate_v4(),
  metric_key          text not null unique,
  label               text not null,
  warning_threshold   numeric not null default 70,
  critical_threshold  numeric not null default 85,
  unit                text not null default '%',
  updated_at          timestamptz not null default now(),
  updated_by          uuid references public.user_profiles(id) on delete set null
);

-- RLS
alter table public.metric_thresholds enable row level security;
create policy "Authenticated users can read thresholds"
  on public.metric_thresholds for select
  using (auth.role() = 'authenticated');
create policy "Service role can manage thresholds"
  on public.metric_thresholds for all
  using (auth.role() = 'service_role');

-- Seed defaults
insert into public.metric_thresholds (metric_key, label, warning_threshold, critical_threshold, unit) values
  ('storage_pct',     'Storage Usage',    70, 85, '%'),
  ('connections_pct', 'Connection Usage',  70, 85, '%'),
  ('memory_pct',      'Memory Usage',      70, 85, '%'),
  ('cpu_pct',         'CPU Usage',         70, 85, '%');
