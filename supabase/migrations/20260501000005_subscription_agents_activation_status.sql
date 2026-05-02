-- =============================================================
-- SPRINT 2.5 — subscription_agents: activation_status
-- Diferencia agente comprado (pending_activation) de agente ativo
-- 01/05/2026
-- =============================================================

ALTER TABLE subscription_agents
  ADD COLUMN IF NOT EXISTS activation_status text
    NOT NULL DEFAULT 'active'
    CHECK (activation_status IN (
      'pending_activation',  -- comprado, time Ekthos ainda não ativou
      'testing',             -- canal conectado, em teste com o pastor
      'active',              -- funcionando em produção
      'paused'               -- pastor pausou temporariamente
    ));

-- Índice para o cockpit filtrar agentes aguardando ativação
CREATE INDEX IF NOT EXISTS idx_sa_pending_activation
  ON subscription_agents(activation_status)
  WHERE activation_status = 'pending_activation';
