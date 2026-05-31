-- Migration: fix_b5_dashboard_rpc_left_join
-- Date: 2026-05-31 — Fix Sprint Onda 1
-- Bug B5: get_agent_acolhimento_dashboard retorna subscription_status=null
-- Causa: INNER JOIN em subscription_agents/subscriptions falha quando não há row
-- Fix: LEFT JOIN + fallback via agent_grants + default 'inactive'
-- Idempotente: CREATE OR REPLACE FUNCTION

CREATE OR REPLACE FUNCTION public.get_agent_acolhimento_dashboard(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_journeys_ativas        int;
  v_journeys_por_status    jsonb;
  v_mensagens_semana       bigint;
  v_conversas_handoff      int;
  v_ultima_execucao        timestamptz;
  v_creditos_restantes     int;
  v_creditos_consumidos_mes bigint;
  v_proxima_renovacao      date;
  v_subscription_status    text;
BEGIN
  IF auth_church_id() != p_church_id AND NOT _is_ekthos_admin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COUNT(*) INTO v_journeys_ativas
  FROM acolhimento_journey
  WHERE church_id = p_church_id
    AND status NOT IN ('converted', 'lost', 'unsubscribed');

  SELECT COALESCE(jsonb_object_agg(status, cnt), '{}'::jsonb) INTO v_journeys_por_status
  FROM (
    SELECT status, COUNT(*) AS cnt
    FROM acolhimento_journey
    WHERE church_id = p_church_id
    GROUP BY status
  ) s;

  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_mensagens_semana
  FROM agent_credit_usage
  WHERE church_id = p_church_id
    AND agent_slug = 'agent-acolhimento'
    AND consumed_at > NOW() - INTERVAL '7 days';

  SELECT COUNT(*) INTO v_conversas_handoff
  FROM conversations
  WHERE church_id = p_church_id
    AND ownership = 'human'
    AND status = 'open';

  SELECT MAX(created_at) INTO v_ultima_execucao
  FROM agent_executions
  WHERE church_id = p_church_id
    AND agent_slug = 'agent-acolhimento';

  SELECT COALESCE(cycle_credits + topup_credits, 0) INTO v_creditos_restantes
  FROM church_agent_credits
  WHERE church_id = p_church_id
    AND agent_scope = 'agent-acolhimento';

  SELECT COALESCE(SUM(credits_consumed), 0) INTO v_creditos_consumidos_mes
  FROM agent_credit_usage
  WHERE church_id = p_church_id
    AND agent_slug = 'agent-acolhimento'
    AND consumed_at >= date_trunc('month', NOW());

  v_proxima_renovacao := (date_trunc('month', NOW()) + INTERVAL '1 month')::date;

  -- B5 FIX: LEFT JOIN (não INNER JOIN) — não quebra quando não há row em subscription_agents
  SELECT sa.activation_status INTO v_subscription_status
  FROM subscription_agents sa
  LEFT JOIN subscriptions s ON s.id = sa.subscription_id
  WHERE s.church_id = p_church_id
    AND sa.agent_slug = 'agent-acolhimento'
  ORDER BY sa.created_at DESC
  LIMIT 1;

  -- B5 FIX: Fallback via agent_grants se subscription não encontrada
  IF v_subscription_status IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM agent_grants ag
      WHERE ag.church_id = p_church_id
        AND ag.agent_slug = 'agent-acolhimento'
        AND ag.revoked_at IS NULL
        AND (ag.ends_at IS NULL OR ag.ends_at > NOW())
    ) THEN
      v_subscription_status := 'active';  -- grant ativo (courtesy/trial)
    ELSE
      v_subscription_status := 'inactive';  -- sem subscription e sem grant → inativo
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'journeys_ativas',         v_journeys_ativas,
    'journeys_por_status',     v_journeys_por_status,
    'mensagens_semana',        v_mensagens_semana,
    'conversas_handoff',       v_conversas_handoff,
    'ultima_execucao',         v_ultima_execucao,
    'creditos_restantes',      v_creditos_restantes,
    'creditos_consumidos_mes', v_creditos_consumidos_mes,
    'proxima_renovacao',       v_proxima_renovacao,
    'subscription_status',     v_subscription_status
  );
END;
$$;

-- Audit
INSERT INTO audit_logs (id, church_id, entity_type, entity_id, action, actor_type, actor_id, payload, created_at)
SELECT
  gen_random_uuid(), NULL, 'system', NULL,
  'migration_b5_fix_rpc_left_join',
  'system',
  '579d0f7b-9b8b-4c20-94c5-513b4a424642',
  jsonb_build_object(
    'migration', '20260531000001_fix_b5_dashboard_rpc_left_join',
    'note', 'B5 Fix: INNER JOIN → LEFT JOIN + agent_grants fallback in get_agent_acolhimento_dashboard'
  ),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs WHERE action = 'migration_b5_fix_rpc_left_join'
);
