-- Fix: contadores de unidade via RPC (sem teto PostgREST de 1.000 linhas)
--      + ordering por created_at DESC na get_people_page
--      + índice de suporte para ordenação
-- Rollback:
--   DROP FUNCTION IF EXISTS get_unit_counts(uuid);
--   DROP INDEX CONCURRENTLY IF EXISTS idx_people_church_created_at;
--   (get_people_page: restaurar ORDER BY p.name_sort ASC na CTE filtered)

-- ── Índice de suporte (se já existir, cria sem erro) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_people_church_created_at
  ON people (church_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ── RPC: contagens por unidade + breakdown por stage ─────────────────────────
-- Retorna uma linha por (unit_id, person_stage) com o count.
-- unit_id = null → "Sem unidade definida"
CREATE OR REPLACE FUNCTION get_unit_counts(p_church_id uuid)
RETURNS TABLE (
  unit_id      uuid,
  person_stage text,
  cnt          bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.unit_id,
    p.person_stage,
    COUNT(*) AS cnt
  FROM people p
  WHERE p.church_id = p_church_id
    AND p.deleted_at IS NULL
  GROUP BY p.unit_id, p.person_stage;
$$;

REVOKE ALL ON FUNCTION get_unit_counts(uuid) FROM anon;
REVOKE ALL ON FUNCTION get_unit_counts(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_unit_counts(uuid) TO authenticated;

-- ── get_people_page: trocar ORDER BY para created_at DESC, id DESC ────────────
CREATE OR REPLACE FUNCTION get_people_page(
  p_church_id   uuid,
  p_care_status text    DEFAULT NULL,
  p_unit_id     text    DEFAULT NULL,
  p_stage       text    DEFAULT NULL,
  p_source      text    DEFAULT NULL,
  p_search      text    DEFAULT NULL,
  p_date_from   date    DEFAULT NULL,
  p_date_to     date    DEFAULT NULL,
  p_limit       int     DEFAULT 50,
  p_offset      int     DEFAULT 0
)
RETURNS TABLE (row_data jsonb, total_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT p.id
    FROM people p
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND (p_unit_id IS NULL
           OR (p_unit_id = 'none' AND p.unit_id IS NULL)
           OR (p_unit_id <> 'none' AND p.unit_id = p_unit_id::uuid))
      AND (p_stage IS NULL OR p.person_stage::text = p_stage)
      AND (p_source IS NULL OR p.source::text = p_source)
      AND (p_date_from IS NULL OR p.first_visit_date >= p_date_from)
      AND (p_date_to   IS NULL OR p.first_visit_date <= p_date_to)
      AND (p_search IS NULL
           OR p.name  ILIKE '%' || p_search || '%'
           OR p.phone ILIKE '%' || p_search || '%'
           OR p.email ILIKE '%' || p_search || '%')
      AND (
        p_care_status IS NULL
        OR (p_care_status = 'nao_atendida' AND NOT EXISTS (
              SELECT 1 FROM acolhimento_journey aj
              WHERE aj.person_id = p.id AND aj.church_id = p_church_id))
        OR (p_care_status = 'em_atendimento' AND EXISTS (
              SELECT 1 FROM acolhimento_journey aj
              WHERE aj.person_id = p.id AND aj.church_id = p_church_id AND aj.status = 'pending'))
        OR (p_care_status = 'atendida' AND EXISTS (
              SELECT 1 FROM journey_events je
              JOIN person_journey pj ON pj.id = je.journey_id
              WHERE pj.person_id = p.id AND pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'))
        OR (p_care_status = 'sem_contato_48h'
              AND p.created_at <= NOW() - INTERVAL '48 hours'
              AND NOT EXISTS (
                SELECT 1 FROM journey_events je
                JOIN person_journey pj ON pj.id = je.journey_id
                WHERE pj.person_id = p.id AND pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'))
      )
    ORDER BY p.created_at DESC, p.id DESC
  ),
  total AS (SELECT COUNT(*) AS cnt FROM filtered),
  paged_ids AS (SELECT id FROM filtered LIMIT p_limit OFFSET p_offset)
  SELECT
    (to_jsonb(p) || jsonb_build_object(
      'acolhimento_journey', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id',aj.id,'status',aj.status,'updated_at',aj.updated_at,'started_at',aj.started_at))
         FROM acolhimento_journey aj WHERE aj.person_id = p.id), '[]'::jsonb),
      'person_pipeline', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
           'stage_id',pp.stage_id,'last_activity_at',pp.last_activity_at,'entered_at',pp.entered_at,
           'pipeline_stages',(SELECT to_jsonb(ps) FROM pipeline_stages ps WHERE ps.id = pp.stage_id)))
         FROM person_pipeline pp WHERE pp.person_id = p.id), '[]'::jsonb),
      'person_tags', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
           'tag_id',pt.tag_id,
           'tags',(SELECT to_jsonb(t) FROM tags t WHERE t.id = pt.tag_id)))
         FROM person_tags pt WHERE pt.person_id = p.id), '[]'::jsonb)
    )) AS row_data,
    (SELECT cnt FROM total) AS total_count
  FROM paged_ids pi
  JOIN people p ON p.id = pi.id;
END;
$$;

REVOKE ALL ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int) FROM anon;
REVOKE ALL ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int) TO authenticated;
