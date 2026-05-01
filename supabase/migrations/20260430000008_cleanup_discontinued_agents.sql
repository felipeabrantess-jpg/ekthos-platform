-- =============================================================
-- CLEANUP — Agentes descontinuados
-- Sprint 1 — 30/04/2026
--
-- 10.1: Desativar subs ativas em agentes descontinuados (igrejas teste)
-- 10.2: Soft-deactivate 10 descontinuados em agents_catalog
-- Decisão: active=false, NÃO deletar (preserva histórico e integridade FK)
-- =============================================================

-- 10.1 — Desativar subs ativas de agentes descontinuados
UPDATE subscription_agents
SET active = false
WHERE agent_slug IN (
  'agent-agenda',
  'agent-conteudo',
  'agent-cuidado',
  'agent-formacao',
  'agent-funil',
  'agent-metricas',
  'agent-missoes',
  'agent-proposta',
  'agent-relatorios',
  'agent-whatsapp'
)
AND active = true;

-- 10.2 — Soft-deactivate 10 descontinuados no catálogo
UPDATE agents_catalog
SET active = false, updated_at = now()
WHERE slug IN (
  'agent-agenda',
  'agent-conteudo',
  'agent-cuidado',
  'agent-formacao',
  'agent-funil',
  'agent-metricas',
  'agent-missoes',
  'agent-proposta',
  'agent-relatorios',
  'agent-whatsapp'
);
