-- SEC-1: Corrigir views com SECURITY DEFINER que bypassavam RLS
-- As views executavam como 'postgres' (superusuário), ignorando o RLS das tabelas subjacentes.
-- Com SECURITY INVOKER, a view roda com o contexto do usuário que a consulta — RLS é respeitado.
-- Definições SQL preservadas exatamente; apenas o security mode mudou.

-- View 1: volunteer_total_points
-- Consulta: volunteers + people + volunteer_points (todas com RLS ativo)
CREATE OR REPLACE VIEW public.volunteer_total_points
  WITH (security_invoker = true) AS
  SELECT v.id AS volunteer_id,
    v.church_id,
    p.name AS person_name,
    COALESCE(sum(vp.points), 0) AS total_points,
    count(vp.id) AS total_awards,
    max(vp.awarded_at) AS last_award_at
  FROM ((volunteers v
    JOIN people p ON (p.id = v.person_id))
    LEFT JOIN volunteer_points vp ON (vp.volunteer_id = v.id))
  GROUP BY v.id, v.church_id, p.name;

-- View 2: church_agent_activity_last_30d
-- Consulta: agent_executions (com RLS ativo, policy church_sees_own_executions)
CREATE OR REPLACE VIEW public.church_agent_activity_last_30d
  WITH (security_invoker = true) AS
  SELECT church_id, agent_slug, model,
    count(*) AS total_executions,
    count(*) FILTER (WHERE (status = 'success') OR ((status IS NULL) AND (success IS TRUE))) AS success_count,
    count(*) FILTER (WHERE (status = 'error') OR ((status IS NULL) AND (success IS FALSE))) AS error_count,
    count(*) FILTER (WHERE status = 'rate_limited') AS rate_limited_count,
    count(*) FILTER (WHERE status = 'skipped') AS skipped_count,
    sum(COALESCE(input_tokens, 0)) AS total_input_tokens,
    sum(COALESCE(output_tokens, 0)) AS total_output_tokens,
    sum(COALESCE(cache_read_tokens, 0)) AS total_cache_read_tokens,
    sum(COALESCE(cache_creation_tokens, 0)) AS total_cache_creation_tokens,
    round(avg(duration_ms))::integer AS avg_duration_ms,
    max(created_at) AS last_execution_at
  FROM agent_executions
  WHERE created_at >= (now() - '30 days'::interval)
  GROUP BY church_id, agent_slug, model;
