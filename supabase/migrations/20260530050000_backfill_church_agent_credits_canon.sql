-- Migration: backfill church_agent_credits para agentes ativos (canon D3)
-- Applied: 2026-05-30 (MEGA-ONDA CIRÚRGICA D3)
-- Purpose: Inserir linhas em church_agent_credits para todas as igrejas com
--          subscription_agents ativos nos 3 agentes canônicos com crédito definido.
--
-- Diagnóstico D3-SB01 (pre-migration):
--   Schema real: coluna é `agent_scope` (NÃO `agent_slug`), PK composite (church_id, agent_scope)
--   cycle_end: NOT NULL — obrigatório no INSERT
--   Linhas antes: 0
--
-- Resultado aplicado (D3-SB06):
--   Linhas inseridas: 5
--   - 184fd750 (Minha Fé): agent-acolhimento(600), agent-operacao(800), agent-reengajamento(600)
--   - 62e473b8 (Mock E2E): agent-acolhimento(600)
--   - 6743b72b: agent-acolhimento(600)
--
-- Créditos canônicos (agent_credit_plans):
--   agent-acolhimento   → 600 créditos/ciclo
--   agent-reengajamento → 600 créditos/ciclo
--   agent-operacao      → 800 créditos/ciclo
--
-- Risco avaliado: BAIXO
--   - ON CONFLICT DO NOTHING garante idempotência
--   - agent_scope = agent_slug (mapeamento 1:1 conforme activate_agent())
--   - Créditos vêm de JOIN agent_credit_plans (fonte da verdade canônica)

-- Backfill: church_agent_credits a partir de subscription_agents ativos
-- agent_scope = agent_slug (mapeamento 1:1, conforme activate_agent())
-- cycle_credits conforme agent_credit_plans.monthly_credits
-- cycle_end = cycle_start + 1 mês (padrão da função activate_agent)

INSERT INTO public.church_agent_credits (
  church_id,
  agent_scope,
  cycle_credits,
  topup_credits,
  cycle_start,
  cycle_end,
  updated_at
)
SELECT DISTINCT
  s.church_id,
  sa.agent_slug                                       AS agent_scope,
  acp.monthly_credits                                 AS cycle_credits,
  0                                                   AS topup_credits,
  date_trunc('month', NOW())                          AS cycle_start,
  date_trunc('month', NOW()) + INTERVAL '1 month'    AS cycle_end,
  NOW()                                               AS updated_at
FROM public.subscription_agents sa
JOIN public.subscriptions s         ON sa.subscription_id = s.id
JOIN public.agent_credit_plans acp  ON acp.slug = sa.agent_slug
WHERE sa.activation_status = 'active'
  AND sa.agent_slug IN ('agent-acolhimento', 'agent-reengajamento', 'agent-operacao')
ON CONFLICT (church_id, agent_scope) DO NOTHING;
