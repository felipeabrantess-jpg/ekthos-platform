-- RPC: get_agent_reengajamento_dashboard
-- Retorna métricas consolidadas do agente de reengajamento para uma igreja.
-- Acesso controlado por R-PREMIUM-GUARD (subscription_agents OR agent_grants).

CREATE OR REPLACE FUNCTION get_agent_reengajamento_dashboard(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_activation_status  text;
  v_sub_status         text;
  v_cycle_credits      numeric;
  v_topup_credits      numeric;
  v_creditos_restantes numeric;
  v_creditos_consumidos_mes numeric;
  v_pessoas_em_risco   integer;
  v_acoes_tomadas      integer;
  v_taxa_retorno       numeric;
  v_ultima_execucao    timestamptz;
BEGIN
  -- R-PREMIUM-GUARD: subscription ativa OU grant ativo
  IF NOT EXISTS (
    SELECT 1 FROM subscription_agents sa
    WHERE sa.church_id = p_church_id
      AND sa.agent_slug = 'agent-reengajamento'
      AND sa.activation_status = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM agent_grants ag
    WHERE ag.church_id = p_church_id
      AND ag.agent_slug = 'agent-reengajamento'
      AND ag.revoked_at IS NULL
      AND (ag.ends_at IS NULL OR ag.ends_at > NOW())
  ) THEN
    RAISE EXCEPTION 'forbidden: agent-reengajamento not active for this church';
  END IF;

  -- activation_status da subscription
  SELECT sa.activation_status INTO v_activation_status
  FROM subscription_agents sa
  WHERE sa.church_id = p_church_id
    AND sa.agent_slug = 'agent-reengajamento'
  ORDER BY sa.created_at DESC
  LIMIT 1;

  -- status do plano (church_agent_subscriptions)
  SELECT cas.status INTO v_sub_status
  FROM church_agent_subscriptions cas
  WHERE cas.church_id = p_church_id
    AND cas.plan_slug IN ('avulso-reengajamento','agent-reengajamento')
  ORDER BY cas.created_at DESC
  LIMIT 1;

  -- Créditos
  SELECT
    COALESCE(cac.cycle_credits, 0),
    COALESCE(cac.topup_credits, 0)
  INTO v_cycle_credits, v_topup_credits
  FROM church_agent_credits cac
  WHERE cac.church_id = p_church_id
    AND cac.agent_scope = 'agent-reengajamento'
  LIMIT 1;

  v_creditos_restantes := v_cycle_credits + v_topup_credits;

  -- Créditos consumidos no mês corrente
  SELECT COALESCE(SUM(acu.credits_consumed), 0)
  INTO v_creditos_consumidos_mes
  FROM agent_credit_usage acu
  WHERE acu.church_id = p_church_id
    AND acu.agent_slug = 'agent-reengajamento'
    AND acu.consumed_at >= date_trunc('month', now());

  -- Pessoas em risco: inativas há 14+ dias, sem jornada ativa
  SELECT COUNT(*)
  INTO v_pessoas_em_risco
  FROM people p
  WHERE p.church_id = p_church_id
    AND COALESCE(p.last_contact_at, p.last_attendance_at, p.created_at)
        < now() - interval '14 days'
    AND NOT EXISTS (
      SELECT 1 FROM reengagement_journey rj
      WHERE rj.church_id = p_church_id
        AND rj.person_id = p.id
        AND rj.status NOT IN ('completed','opted_out','unsubscribed')
    );

  -- Ações tomadas: jornadas tocadas nos últimos 7 dias
  SELECT COUNT(*)
  INTO v_acoes_tomadas
  FROM reengagement_journey rj
  WHERE rj.church_id = p_church_id
    AND rj.updated_at >= now() - interval '7 days';

  -- Taxa de retorno: % de jornadas completadas no mês corrente
  SELECT CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE ROUND(
      COUNT(*) FILTER (WHERE rj.status = 'completed')::numeric
        / COUNT(*)::numeric * 100, 1
    )
  END
  INTO v_taxa_retorno
  FROM reengagement_journey rj
  WHERE rj.church_id = p_church_id
    AND rj.created_at >= date_trunc('month', now());

  -- Última execução
  SELECT MAX(ae.created_at)
  INTO v_ultima_execucao
  FROM agent_executions ae
  WHERE ae.church_id = p_church_id
    AND ae.agent_slug = 'agent-reengajamento';

  RETURN jsonb_build_object(
    'pessoas_em_risco_semana',  v_pessoas_em_risco,
    'acoes_tomadas',            v_acoes_tomadas,
    'taxa_retorno',             v_taxa_retorno,
    'creditos_restantes',       v_creditos_restantes,
    'creditos_consumidos_mes',  v_creditos_consumidos_mes,
    'ultima_execucao',          v_ultima_execucao,
    'subscription_status',      COALESCE(v_sub_status, v_activation_status),
    'activation_status',        v_activation_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_agent_reengajamento_dashboard(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_agent_reengajamento_dashboard(uuid) TO authenticated;
