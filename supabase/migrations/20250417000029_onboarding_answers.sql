-- Migration: 00029_onboarding_answers
-- Adds structured answers JSONB column to onboarding_sessions

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS answers jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN onboarding_sessions.answers IS
  'Respostas estruturadas coletadas durante o onboarding {P1: "...", P2: "...", ...}';
