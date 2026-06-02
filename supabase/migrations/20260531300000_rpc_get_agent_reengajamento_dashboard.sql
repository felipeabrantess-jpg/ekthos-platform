-- Migration: RPC get_agent_reengajamento_dashboard
-- A3 — Dashboard Agent Reengajamento

CREATE OR REPLACE FUNCTION get_agent_reengajamento_dashboard(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_scope  text := 'agent-reengajamento';
BEGIN
  SELECT jsonb_build_object(
    'pessoas_em_risco_semana',
      (SELECT count(*) FROM reengagement_journey
       WHERE church_id = p_church_id
         AND created_at >= now() - interval '7 days'),
    'acoes_tomadas',
      COALESCE(
        (SELECT count(*) FROM agent_credit_usage
         WHERE church_id = p_church_id
           AND agent_slug = v_scope
           AND consumed_at >= now() - interval '7 days'), 0),
    'taxa_retorno',
      CASE WHEN (SELECT count(*) FROM reengagement_journey WHERE church_id = p_church_id) = 0
           THEN 0
           ELSE ROUND(
             (SELECT count(*) FROM reengagement_journey
              WHERE church_id = p_church_id AND status = 'completed')::numeric /
             GREATEST((SELECT count(*) FROM reengagement_journey WHERE church_id = p_church_id), 1) * 100, 1)
      END,
    'creditos_restantes',
      COALESCE(
        (SELECT cycle_credits + COALESCE(topup_credits, 0)
         FROM church_agent_credits
         WHERE church_id = p_church_id AND agent_scope = v_scope
         LIMIT 1), 0),
    'creditos_consumidos_mes',
      COALESCE(
        (SELECT sum(credits_consumed) FROM agent_credit_usage
         WHERE church_id = p_church_id AND agent_slug = v_scope
           AND consumed_at >= date_trunc('month', now())), 0),
    'ultima_execucao',
      (SELECT max(consumed_at) FROM agent_credit_usage
       WHERE church_id = p_church_id AND agent_slug = v_scope),
    'subscription_status',
      COALESCE(
        (SELECT s.status FROM subscriptions s
         WHERE s.church_id = p_church_id
         ORDER BY s.created_at DESC LIMIT 1),
        (SELECT ag.grant_type FROM agent_grants ag
         WHERE ag.church_id = p_church_id
           AND ag.agent_slug = 'agent-reengajamento'
           AND ag.revoked_at IS NULL
           AND (ag.ends_at IS NULL OR ag.ends_at > NOW())
         LIMIT 1)
      ),
    'activation_status',
      COALESCE(
        (SELECT activation_status FROM subscription_agents
         WHERE church_id = p_church_id AND agent_slug = 'agent-reengajamento'
         LIMIT 1), 'inactive')
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_agent_reengajamento_dashboard(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_agent_reengajamento_dashboard(uuid) TO authenticated;
