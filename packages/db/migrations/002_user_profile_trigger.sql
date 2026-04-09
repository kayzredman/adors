-- ============================================================
-- ADORS — Migration 002: auto-create user_profiles on signup
-- ============================================================

-- Trigger function: fires when a row is inserted into auth.users
-- Creates a matching user_profiles row with role = 'super_admin'
-- for the very first user, 'analyst' for all subsequent users.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_count integer;
begin
  select count(*) into user_count from public.user_profiles;

  insert into public.user_profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case when user_count = 0 then 'super_admin'::user_role else 'analyst'::user_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Drop if exists so this migration is re-runnable
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
