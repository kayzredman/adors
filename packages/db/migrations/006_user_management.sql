-- ============================================================
-- ADORS — Migration 006: User Management
-- Adds onboarded flag + deactivated_at to user_profiles
-- Updates RLS and adds admin policies
-- ============================================================

-- ─── Schema changes ──────────────────────────────────────────────────────────

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS onboarded      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;

-- First user (seeded super_admin) is already onboarded
UPDATE public.user_profiles
SET onboarded = true
WHERE role = 'super_admin';

-- ─── RLS: super_admin can read all profiles ───────────────────────────────────

CREATE POLICY "super_admin read all profiles"
  ON public.user_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles AS me
      WHERE me.id = auth.uid() AND me.role = 'super_admin'
    )
  );

CREATE POLICY "super_admin update profiles"
  ON public.user_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles AS me
      WHERE me.id = auth.uid() AND me.role = 'super_admin'
    )
  );

-- ─── Function: admin invite via service role ─────────────────────────────────
-- Note: actual user creation uses Supabase Admin API from the Express layer.
-- This migration just ensures the schema is ready.
