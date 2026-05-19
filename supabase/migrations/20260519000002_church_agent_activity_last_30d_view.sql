-- Fase 6.3 — VIEW agregada de atividade de agentes por church (últimos 30 dias)
-- Compatível com linhas antigas (trigger_type/status NULL) e novas (v19+).
-- Acessada via service_role no cockpit admin.

CREATE OR REPLACE VIEW church_agent_activity_last_30d AS
SELECT
  church_id,
  agent_slug,
  model,
  COUNT(*)                                                                     AS total_executions,
  COUNT(*) FILTER (
    WHERE status = 'success'
       OR (status IS NULL AND success IS TRUE)
  )                                                                            AS success_count,
  COUNT(*) FILTER (
    WHERE status = 'error'
       OR (status IS NULL AND success IS FALSE)
  )                                                                            AS error_count,
  COUNT(*) FILTER (WHERE status = 'rate_limited')                              AS rate_limited_count,
  COUNT(*) FILTER (WHERE status = 'skipped')                                   AS skipped_count,
  SUM(COALESCE(input_tokens, 0))                                               AS total_input_tokens,
  SUM(COALESCE(output_tokens, 0))                                              AS total_output_tokens,
  SUM(COALESCE(cache_read_tokens, 0))                                          AS total_cache_read_tokens,
  SUM(COALESCE(cache_creation_tokens, 0))                                      AS total_cache_creation_tokens,
  ROUND(AVG(duration_ms))::integer                                             AS avg_duration_ms,
  MAX(created_at)                                                              AS last_execution_at
FROM agent_executions
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY church_id, agent_slug, model;

COMMENT ON VIEW church_agent_activity_last_30d IS
  'Agregado de execuções de agentes por church/slug — últimos 30 dias. Fase 6.3.';
