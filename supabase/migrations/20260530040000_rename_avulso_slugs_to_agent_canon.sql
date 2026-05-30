-- Migration: rename agent_credit_plans slugs avulso-* → agent-* (canon alignment)
-- Applied: 2026-05-30 (MEGA-ONDA D2)
-- Purpose: Alinhar slugs de agent_credit_plans com o canon oficial (agent-*)
--          Os slugs 'avulso-*' eram divergentes do código e da canon.
--
-- Diagnóstico D2-SB03 (pré-migration):
--   FK detectada: church_agent_subscriptions.plan_slug → agent_credit_plans.slug
--                 (constraint: church_agent_subscriptions_plan_slug_fkey)
--   Linhas avulso-* em church_agent_subscriptions: 0
--   Linhas avulso-* em subscription_agents (agent_slug): 0
--   → Etapa 2 comentada por segurança (sem dados para migrar, registrada para referência)
--
-- Risco avaliado (D2-SB08): BAIXO
--   - 0 duplicação de PK (agent-* não existiam antes)
--   - 0 igrejas reais (is_test_church=false) afetadas
--   - 0 linhas em church_agent_subscriptions com avulso-*
--   - Código não usa slugs avulso-* (apenas migration histórica)

BEGIN;

-- Etapa 1: rename slugs em agent_credit_plans (PK = slug)
UPDATE public.agent_credit_plans
SET slug = REPLACE(slug, 'avulso-', 'agent-')
WHERE slug LIKE 'avulso-%';

-- Etapa 2: atualizar FK dependente em church_agent_subscriptions
-- FK: church_agent_subscriptions_plan_slug_fkey (plan_slug → agent_credit_plans.slug)
-- Diagnóstico confirmou 0 linhas avulso-* nesta tabela — mantido para idempotência futura.
UPDATE public.church_agent_subscriptions
SET plan_slug = REPLACE(plan_slug, 'avulso-', 'agent-')
WHERE plan_slug LIKE 'avulso-%';

-- Etapa 3: audit log
INSERT INTO public.audit_logs (action, entity_type, payload, actor_type, tokens_used)
VALUES (
  'slug_rename_avulso_to_agent',
  'agent_credit_plans',
  jsonb_build_object(
    'renamed_slugs', ARRAY['avulso-acolhimento→agent-acolhimento', 'avulso-reengajamento→agent-reengajamento', 'avulso-operacao→agent-operacao'],
    'reason', 'D2 MEGA-ONDA — alinhamento com canon oficial',
    'change_type', 'pk_rename',
    'fk_dependentes', jsonb_build_array(
      jsonb_build_object(
        'tabela', 'church_agent_subscriptions',
        'coluna', 'plan_slug',
        'constraint', 'church_agent_subscriptions_plan_slug_fkey',
        'linhas_afetadas', 0
      )
    )
  ),
  'system',
  0
);

COMMIT;
