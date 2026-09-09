-- Frente 2: RPCs de status de atendimento (server-side, sem lista de IDs)
-- Rollback: DROP FUNCTION IF EXISTS get_care_status_counts(uuid);
--           DROP FUNCTION IF EXISTS get_people_page(uuid,text,text,text,text,text,date,date,int,int);

-- ── RPC 1: contadores por status de atendimento ──────────────────────────────
CREATE OR REPLACE FUNCTION get_care_status_counts(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nao_atendida   bigint;
  v_em_atendimento bigint;
  v_atendida       bigint;
  v_sem_contato    bigint;
BEGIN
  SELECT COUNT(DISTINCT aj.person_id) INTO v_em_atendimento
  FROM acolhimento_journey aj
  JOIN people p ON p.id = aj.person_id
  WHERE aj.church_id = p_church_id AND aj.status = 'pending' AND p.deleted_at IS NULL;

  SELECT COUNT(DISTINCT aj.person_id) INTO v_atendida
  FROM journey_events je
  JOIN acolhimento_journey aj ON aj.id = je.journey_id
  JOIN people p ON p.id = aj.person_id
  WHERE aj.church_id = p_church_id AND je.church_id = p_church_id
    AND je.event_type = 'pastoral_contact' AND p.deleted_at IS NULL;

  SELECT COUNT(*) INTO v_nao_atendida
  FROM people p
  WHERE p.church_id = p_church_id AND p.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM acolhimento_journey aj WHERE aj.person_id = p.id AND aj.church_id = p_church_id);

  SELECT COUNT(*) INTO v_sem_contato
  FROM people p
  WHERE p.church_id = p_church_id AND p.deleted_at IS NULL
    AND p.created_at <= NOW() - INTERVAL '48 hours'
    AND NOT EXISTS (
      SELECT 1 FROM journey_events je
      JOIN acolhimento_journey aj ON aj.id = je.journey_id
      WHERE aj.person_id = p.id AND aj.church_id = p_church_id AND je.event_type = 'pastoral_contact');

  RETURN jsonb_build_object(
    'nao_atendida',    v_nao_atendida,
    'em_atendimento',  v_em_atendimento,
    'atendida',        v_atendida,
    'sem_contato_48h', v_sem_contato);
END;
$$;

REVOKE ALL ON FUNCTION get_care_status_counts(uuid) FROM anon;
REVOKE ALL ON FUNCTION get_care_status_counts(uuid) FROM authenticated;
GRANT  EXECUTE ON FUNCTION get_care_status_counts(uuid) TO authenticated;

-- ── RPC 2: página de pessoas com filtro de atendimento server-side ───────────
CREATE OR REPLACE FUNCTION get_people_page(
  p_church_id   uuid,
  p_care_status text  DEFAULT NULL,
  p_unit_id     text  DEFAULT NULL,
  p_stage       text  DEFAULT NULL,
  p_source      text  DEFAULT NULL,
  p_search      text  DEFAULT NULL,
  p_date_from   date  DEFAULT NULL,
  p_date_to     date  DEFAULT NULL,
  p_limit       int   DEFAULT 50,
  p_offset      int   DEFAULT 0
)
RETURNS TABLE(row_data jsonb, total_count bigint)
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
              JOIN acolhimento_journey aj ON aj.id = je.journey_id
              WHERE aj.person_id = p.id AND aj.church_id = p_church_id AND je.event_type = 'pastoral_contact'))
        OR (p_care_status = 'sem_contato_48h'
              AND p.created_at <= NOW() - INTERVAL '48 hours'
              AND NOT EXISTS (
                SELECT 1 FROM journey_events je
                JOIN acolhimento_journey aj ON aj.id = je.journey_id
                WHERE aj.person_id = p.id AND aj.church_id = p_church_id AND je.event_type = 'pastoral_contact'))
      )
    ORDER BY p.name_sort ASC
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
