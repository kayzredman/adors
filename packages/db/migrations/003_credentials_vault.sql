-- ============================================================
-- ADORS — Migration 003: Encrypted credential vault
-- Replaces ENV:PREFIX credentials_ref with server-side AES-256-GCM
-- encrypted storage so DBAs enter credentials in the UI, not env files.
-- ============================================================

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS credentials_enc  text,   -- base64 AES-256-GCM ciphertext
  ADD COLUMN IF NOT EXISTS credentials_iv   text,   -- base64 12-byte IV (nonce)
  ADD COLUMN IF NOT EXISTS credentials_tag  text;   -- base64 16-byte GCM auth tag

-- Drop the old ENV-ref column (safe: all new code uses credentials_enc)
ALTER TABLE public.connections
  DROP COLUMN IF EXISTS credentials_ref;
