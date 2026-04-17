-- Migration: 00028_onboarding_recommended_agents
-- Adds recommended_agents and completed_at to onboarding_sessions

ALTER TABLE onboarding_sessions
  ADD COLUMN IF NOT EXISTS recommended_agents text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN onboarding_sessions.recommended_agents IS 'Agentes recomendados pelo engineer baseado nas dores identificadas na conversa';
COMMENT ON COLUMN onboarding_sessions.completed_at IS 'Timestamp de conclusão do onboarding (engineer step 20 done)';
