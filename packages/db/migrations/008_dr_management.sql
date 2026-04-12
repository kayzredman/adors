-- ============================================================
-- ADORS — DR Management Tables
-- DR pair mapping + failover drill tracking
-- ============================================================

create type drill_result as enum ('pass', 'fail', 'partial', 'aborted');

-- ─── DR Pairs (production ↔ DR) ─────────────────────────────────────────────

create table public.dr_pairs (
  id                  uuid primary key default uuid_generate_v4(),
  prod_connection_id  uuid not null references public.connections(id) on delete cascade,
  dr_connection_id    uuid not null references public.connections(id) on delete cascade,
  rpo_target_minutes  integer not null default 15,
  rto_target_minutes  integer not null default 60,
  notes               text,
  created_by          uuid references public.user_profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint uq_dr_pair unique (prod_connection_id, dr_connection_id),
  constraint chk_different_connections check (prod_connection_id <> dr_connection_id)
);

create index idx_dr_pairs_prod on public.dr_pairs(prod_connection_id);
create index idx_dr_pairs_dr   on public.dr_pairs(dr_connection_id);

-- ─── DR Drills (failover test events) ───────────────────────────────────────

create table public.dr_drills (
  id            uuid primary key default uuid_generate_v4(),
  pair_id       uuid not null references public.dr_pairs(id) on delete cascade,
  result        drill_result not null,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  duration_min  integer,
  rpo_actual_min integer,
  rto_actual_min integer,
  notes         text,
  run_by        uuid references public.user_profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_dr_drills_pair_id    on public.dr_drills(pair_id);
create index idx_dr_drills_started_at on public.dr_drills(started_at desc);

-- RLS
alter table public.dr_pairs  enable row level security;
alter table public.dr_drills enable row level security;

create policy "dr_pairs_read"  on public.dr_pairs  for select using (true);
create policy "dr_pairs_write" on public.dr_pairs  for all    using (true);
create policy "dr_drills_read"  on public.dr_drills for select using (true);
create policy "dr_drills_write" on public.dr_drills for all    using (true);
