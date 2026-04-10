-- ============================================================
-- ADORS — Chat Sessions Migration
-- Persists per-user, per-bot chat history
-- ============================================================

create table public.chat_sessions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  bot_id      text not null check (bot_id in ('orabot', 'msbot', 'marbot')),
  messages    jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);

-- One session per user per bot (upsert target)
create unique index chat_sessions_user_bot on public.chat_sessions(user_id, bot_id);

create index idx_chat_sessions_user_id on public.chat_sessions(user_id);

-- ─── RLS ────────────────────────────────────────────────────────────────────

alter table public.chat_sessions enable row level security;

create policy "Users own their chat sessions"
  on public.chat_sessions
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());
