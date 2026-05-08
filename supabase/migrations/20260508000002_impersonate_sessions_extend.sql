-- supabase/migrations/20260508000002_impersonate_sessions_extend.sql
-- Frente 4A: adiciona colunas para lifecycle completo de impersonation.
-- D2 (BLINDAGEM): ended_at já existe — apenas +2 colunas novas.

ALTER TABLE public.impersonate_sessions
  ADD COLUMN IF NOT EXISTS ended_reason   text,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz;
