-- ============================================================
-- ROLLBACK de 20261010120000_people_care_counts_performance.sql
-- Restaura get_people_page e get_care_status_counts para as definições anteriores (capturadas de produção em
-- 2026-10-10) e remove o helper person_care_rows. Mesmas assinaturas: CREATE OR REPLACE preserva ACL.
-- ATENÇÃO: as definições anteriores podem estourar o statement_timeout de 8 s com filtros pesados.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_people_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(row_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM assert_church_access(p_church_id);

  RETURN QUERY
  WITH filtered AS (
    SELECT b.id, b.created_at, b.birth_day, b.name_sort
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
    WHERE p_care_status IS NULL
       -- Estado (mesma regra do contador e da etiqueta)
       OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado')
           AND person_care_state(b.id) = p_care_status)
       -- Alerta operacional (separado dos estados)
       OR (p_care_status = 'sem_contato_48h' AND person_care_alert(b.id))
  ),
  total AS (SELECT COUNT(*) AS cnt FROM filtered),
  paged_ids AS (
    SELECT id FROM filtered
    ORDER BY
      CASE WHEN p_birth_month IS NOT NULL THEN birth_day END ASC NULLS LAST,
      CASE WHEN p_birth_month IS NOT NULL THEN name_sort END ASC,
      created_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (to_jsonb(p) || jsonb_build_object(
      'care_state', person_care_state(p.id),
      'care_alert', person_care_alert(p.id),
      'classification', person_classification(p.id),
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
  JOIN people p ON p.id = pi.id
  ORDER BY
    CASE WHEN p_birth_month IS NOT NULL THEN p.birth_day END ASC NULLS LAST,
    CASE WHEN p_birth_month IS NOT NULL THEN p.name_sort END ASC,
    p.created_at DESC, p.id DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_care_status_counts(p_church_id uuid, p_unit_id text DEFAULT NULL::text, p_stage_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM assert_church_access(p_church_id);

  WITH base AS (
    SELECT b.id, person_care_state(b.id) AS st, person_care_alert(b.id) AS alert
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
  )
  SELECT jsonb_build_object(
    'nao_atendida',    (SELECT COUNT(*) FROM base WHERE st = 'nao_atendida'),
    'em_atendimento',  (SELECT COUNT(*) FROM base WHERE st = 'em_atendimento'),
    'atendida',        (SELECT COUNT(*) FROM base WHERE st = 'atendida'),
    'cancelado',       (SELECT COUNT(*) FROM base WHERE st = 'cancelado'),
    'total',           (SELECT COUNT(*) FROM base),
    'sem_contato_48h', (SELECT COUNT(*) FROM base WHERE alert),
    'alert_threshold_hours', EXTRACT(EPOCH FROM care_alert_threshold())::int / 3600
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

DROP FUNCTION IF EXISTS public.person_care_rows(uuid);
