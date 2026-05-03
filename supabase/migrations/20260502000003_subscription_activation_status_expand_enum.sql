-- =============================================================
-- SPRINT 3 / B1 — subscription_agents: expandir activation_status
-- Adiciona 'in_setup' e 'cancelled' ao CHECK da coluna
-- 02/05/2026
-- =============================================================

ALTER TABLE subscription_agents
  DROP CONSTRAINT IF EXISTS subscription_agents_activation_status_check;

ALTER TABLE subscription_agents
  ADD CONSTRAINT subscription_agents_activation_status_check
  CHECK (activation_status IN (
    'pending_activation',  -- comprado, time Ekthos ainda não ativou
    'in_setup',            -- setup em andamento com o time Ekthos
    'active',              -- funcionando em produção
    'paused',              -- pastor pausou temporariamente
    'cancelled'            -- cancelado (churned ou reembolsado)
  ));

-- Índice para cockpit filtrar agentes aguardando ativação
CREATE INDEX IF NOT EXISTS idx_subscription_agents_pending
  ON subscription_agents (activation_status, created_at)
  WHERE activation_status = 'pending_activation';

-- Migrar status 'testing' legado (migration anterior usava esse valor)
UPDATE subscription_agents
  SET activation_status = CASE
    WHEN active = true THEN 'active'
    ELSE 'paused'
  END
WHERE activation_status = 'pending_activation'
  AND created_at < NOW() - INTERVAL '10 minutes'; -- só registros antigos, não os de teste
