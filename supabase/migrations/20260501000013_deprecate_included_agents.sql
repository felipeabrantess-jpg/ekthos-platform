-- =============================================================
-- FIX: Remove ambiguidade da coluna included_agents
-- Premium NUNCA vem incluso em plano CRM.
-- Agentes premium são sempre contratados à parte via agents_catalog.
-- =============================================================

UPDATE plans
SET included_agents = 0
WHERE slug IN ('chamado', 'missao', 'avivamento')
  AND included_agents > 0;

COMMENT ON COLUMN plans.included_agents IS
  'DEPRECATED: agentes premium nunca vêm inclusos no plano CRM. Coluna mantida por compatibilidade retroativa. Use agents_catalog + subscription_agents para controle de ativação.';
