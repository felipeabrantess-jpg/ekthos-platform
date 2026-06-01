-- Migration: RPCs de relatórios de voluntários
-- volunteer_points não existe ainda (SA-GAMIFICATION pendente) — pontos = 0 por ora

-- RPC 1: estatísticas de frequência por período
CREATE OR REPLACE FUNCTION get_volunteer_attendance_stats(
  p_church_id  UUID,
  p_start_date DATE DEFAULT (CURRENT_DATE - INTERVAL '30 days')::DATE,
  p_end_date   DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  volunteer_id   UUID,
  person_name    TEXT,
  ministry_name  TEXT,
  total_escalas  BIGINT,
  confirmados    BIGINT,
  cancelados     BIGINT,
  ausentes       BIGINT,
  taxa_presenca  NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id                        AS volunteer_id,
    p.name                      AS person_name,
    m.name                      AS ministry_name,
    COUNT(ssa.id)               AS total_escalas,
    COUNT(CASE WHEN ssa.attendance_confirmed = true THEN 1 END)                          AS confirmados,
    COUNT(CASE WHEN ssa.status = 'declined' THEN 1 END)                                 AS cancelados,
    COUNT(CASE WHEN ssa.attendance_confirmed = false AND ssa.status != 'declined' THEN 1 END) AS ausentes,
    ROUND(
      CASE WHEN COUNT(ssa.id) = 0 THEN 0
           ELSE COUNT(CASE WHEN ssa.attendance_confirmed = true THEN 1 END)::NUMERIC
                / COUNT(ssa.id)::NUMERIC * 100
      END, 1
    )                           AS taxa_presenca
  FROM volunteers v
  JOIN people p ON p.id = v.person_id
  LEFT JOIN ministries m ON m.id = v.ministry_id
  LEFT JOIN service_schedule_assignments ssa ON ssa.volunteer_id = v.id
  LEFT JOIN service_schedules ss ON ss.id = ssa.schedule_id
    AND ss.event_date BETWEEN p_start_date AND p_end_date
  WHERE v.church_id = p_church_id
    AND v.is_active = true
  GROUP BY v.id, p.name, m.name
  ORDER BY total_escalas DESC, confirmados DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION get_volunteer_attendance_stats(UUID, DATE, DATE) TO authenticated, service_role;

-- RPC 2: top voluntários por frequência
-- volunteer_points não existe ainda: pontos = 0 até SA-GAMIFICATION criar a tabela
CREATE OR REPLACE FUNCTION get_top_volunteers(
  p_church_id UUID,
  p_limit     INTEGER DEFAULT 10,
  p_days_back INTEGER DEFAULT 90
)
RETURNS TABLE (
  volunteer_id   UUID,
  person_name    TEXT,
  ministry_name  TEXT,
  total_servicos BIGINT,
  pontos         BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id           AS volunteer_id,
    p.name         AS person_name,
    m.name         AS ministry_name,
    COUNT(ssa.id)  AS total_servicos,
    0::BIGINT      AS pontos  -- placeholder até SA-GAMIFICATION criar volunteer_points
  FROM volunteers v
  JOIN people p ON p.id = v.person_id
  LEFT JOIN ministries m ON m.id = v.ministry_id
  LEFT JOIN service_schedule_assignments ssa ON ssa.volunteer_id = v.id
    AND ssa.attendance_confirmed = true
  LEFT JOIN service_schedules ss ON ss.id = ssa.schedule_id
    AND ss.event_date >= (CURRENT_DATE - (p_days_back || ' days')::INTERVAL)::DATE
  WHERE v.church_id = p_church_id
    AND v.is_active = true
  GROUP BY v.id, p.name, m.name
  ORDER BY total_servicos DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_top_volunteers(UUID, INTEGER, INTEGER) TO authenticated, service_role;
