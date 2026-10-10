-- ============================================================
-- 20261010120000_people_care_counts_performance.sql
--
-- Homologação real (2026-10-10): na interface autenticada, get_care_status_counts e get_people_page
-- (filtro "Sem contato +48h") passaram de 8 s sob carga e retornaram HTTP 500 (statement_timeout do papel
-- authenticated = 8 s); o contador ficava com os números da combinação anterior, sem aviso.
--
-- CAUSA: person_care_alert()/person_care_alert_ref() executados uma vez por pessoa (~0,8 ms cada ⇒ ~4,4 s para
-- 5.454 pessoas) dentro do WHERE da lista e do cálculo dos contadores; duas RPCs pesadas por troca de filtro.
--
-- CORREÇÃO MÍNIMA (a regra de negócio não muda):
--   * person_care_rows(church): estado e alerta de todas as pessoas, em lote, com a MESMA regra;
--   * get_care_status_counts: usa person_care_rows (em vez de 2 chamadas por pessoa);
--   * get_people_page: só o ramo 'sem_contato_48h' do filtro passa a usar person_care_rows.
-- Assinaturas, retornos, ordenação e ACL inalterados (CREATE OR REPLACE).
-- Rollback: definições anteriores em 20261009100000_person_classification_release1.sql / docs/rollbacks.
-- ============================================================

CREATE OR REPLACE FUNCTION public.person_care_rows(p_church_id uuid)
 RETURNS TABLE(person_id uuid, care_state text, care_alert boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  -- Estado e alerta de atendimento de TODAS as pessoas da igreja, em lote.
  -- Mesma regra de person_care_state() e person_care_alert()/person_care_alert_ref(); só muda a forma de calcular
  -- (uma passada em vez de uma consulta por pessoa). Uso interno das RPCs SECURITY DEFINER.
  WITH st AS MATERIALIZED (
    SELECT p.id, p.created_at, person_care_state(p.id) AS s
    FROM people p WHERE p.church_id = p_church_id
  ),
  la AS MATERIALIZED (
    -- Última tentativa pela DATA DA TENTATIVA (contact_date), depois pela ordem de registro
    SELECT DISTINCT ON (pj.person_id)
           pj.person_id,
           je.payload ->> 'result' AS result,
           COALESCE(CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                         THEN (je.payload ->> 'contact_date')::timestamptz END, je.created_at) AS at
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE je.event_type = 'pastoral_contact'
    ORDER BY pj.person_id,
             COALESCE(CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                           THEN (je.payload ->> 'contact_date')::timestamptz END, je.created_at) DESC,
             je.created_at DESC, je.id DESC
  )
  SELECT st.id, st.s,
         COALESCE(
           CASE
             WHEN st.s NOT IN ('nao_atendida', 'em_atendimento') THEN NULL
             WHEN la.person_id IS NULL THEN st.created_at
             WHEN la.result IN ('nao_atendeu', 'sem_resposta') THEN la.at
             ELSE NULL
           END <= NOW() - care_alert_threshold(),
           false)
  FROM st LEFT JOIN la ON la.person_id = st.id
$function$;
-- Uso interno: não exposta a anon/authenticated (devolve dados da igreja informada, sem checagem de tenant).
REVOKE ALL ON FUNCTION public.person_care_rows(uuid) FROM PUBLIC, anon, authenticated;

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
       OR (p_care_status = 'sem_contato_48h'
           AND b.id IN (SELECT r.person_id FROM person_care_rows(p_church_id) r WHERE r.care_alert))
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
    SELECT b.id, r.care_state AS st, r.care_alert AS alert
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
    JOIN person_care_rows(p_church_id) r ON r.person_id = b.id
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
