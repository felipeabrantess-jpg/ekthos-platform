-- ============================================================
-- E4 — v_care_queue: fila de cuidado pastoral
-- Três categorias, sem sobreposição, ordenadas por urgência:
--   1. overdue  — prazo vencido (priority = 1, mais urgente)
--   2. no_owner — sem responsável pastoral (priority = 2)
--   3. newcomer — novo convertido sem jornada ativa (priority = 3)
--
-- security_invoker = true → executa como o usuário atual,
-- respeitando RLS de person_journey e people.
-- GRANT SELECT para authenticated.
-- ============================================================

CREATE OR REPLACE VIEW v_care_queue
  WITH (security_invoker = true)
AS

-- ── 1. Jornadas com prazo vencido ──────────────────────────
SELECT
  pj.id                                                           AS journey_id,
  pj.person_id,
  p.first_name || ' ' || COALESCE(p.last_name, '')               AS person_name,
  p.phone,
  pj.church_id,
  pj.stage_id,
  ps.name                                                         AS stage_name,
  pj.owner_id,
  pj.next_step_due_at,
  pj.next_step,
  pj.version,
  'overdue'::text                                                 AS category,
  (CURRENT_DATE - pj.next_step_due_at)::integer                  AS days_overdue,
  1                                                               AS priority,
  pj.opened_at
FROM person_journey pj
JOIN people        p  ON p.id  = pj.person_id AND p.deleted_at IS NULL
LEFT JOIN pipeline_stages ps ON ps.id = pj.stage_id
WHERE pj.closed_at        IS NULL
  AND pj.next_step_due_at IS NOT NULL
  AND pj.next_step_due_at <  CURRENT_DATE

UNION ALL

-- ── 2. Jornadas sem responsável pastoral (não vencidas) ────
SELECT
  pj.id,
  pj.person_id,
  p.first_name || ' ' || COALESCE(p.last_name, ''),
  p.phone,
  pj.church_id,
  pj.stage_id,
  ps.name,
  pj.owner_id,
  pj.next_step_due_at,
  pj.next_step,
  pj.version,
  'no_owner'::text,
  NULL::integer,
  2,
  pj.opened_at
FROM person_journey pj
JOIN people        p  ON p.id  = pj.person_id AND p.deleted_at IS NULL
LEFT JOIN pipeline_stages ps ON ps.id = pj.stage_id
WHERE pj.closed_at IS NULL
  AND pj.owner_id  IS NULL
  AND (pj.next_step_due_at IS NULL OR pj.next_step_due_at >= CURRENT_DATE)

UNION ALL

-- ── 3. Novos convertidos sem jornada ativa ─────────────────
SELECT
  NULL::uuid,
  p.id,
  p.first_name || ' ' || COALESCE(p.last_name, ''),
  p.phone,
  p.church_id,
  p.pipeline_stage_id,
  ps.name,
  NULL::uuid,
  NULL::date,
  NULL::text,
  NULL::integer,
  'newcomer'::text,
  NULL::integer,
  3,
  p.conversion_date::timestamptz
FROM people p
LEFT JOIN pipeline_stages ps ON ps.id = p.pipeline_stage_id
WHERE p.deleted_at        IS NULL
  AND p.conversion_date   IS NOT NULL
  AND p.conversion_date  >= CURRENT_DATE - INTERVAL '30 days'
  AND NOT EXISTS (
    SELECT 1 FROM person_journey pj2
    WHERE pj2.person_id = p.id
      AND pj2.church_id = p.church_id
      AND pj2.closed_at IS NULL
  );

-- Índices parciais para performance
CREATE INDEX IF NOT EXISTS idx_pj_care_no_owner
  ON person_journey(church_id, opened_at)
  WHERE closed_at IS NULL AND owner_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_pj_care_overdue
  ON person_journey(church_id, next_step_due_at)
  WHERE closed_at IS NULL AND next_step_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_newcomers
  ON people(church_id, conversion_date)
  WHERE deleted_at IS NULL AND conversion_date IS NOT NULL;

GRANT SELECT ON v_care_queue TO authenticated;
