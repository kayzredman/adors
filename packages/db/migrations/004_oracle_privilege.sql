-- ============================================================
-- Migration 004 — Oracle connection privilege support
-- Adds oracle_privilege column to connections table so SYS
-- and other privileged accounts can connect as SYSDBA/SYSOPER.
-- ============================================================

alter table public.connections
  add column if not exists oracle_privilege text
    check (oracle_privilege in ('SYSDBA', 'SYSOPER'))
    default null;

comment on column public.connections.oracle_privilege is
  'Oracle only: SYSDBA or SYSOPER. NULL means normal user connection.';
