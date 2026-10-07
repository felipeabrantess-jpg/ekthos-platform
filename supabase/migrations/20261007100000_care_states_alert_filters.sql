-- ============================================================
-- Itens 2 / 16 / 22 — Estados do atendimento × alerta operacional
--
-- 1. ESTADOS (mutuamente exclusivos, somam o universo da lista):
--      nao_atendida | em_atendimento | atendida | cancelado
--    "Em atendimento" passa a exigir jornada aberta COM atividade humana
--    (ao menos um journey_events). Jornada aberta sem nenhum evento — as 473
--    jornadas legadas de 01/08/2026 criadas por backfill — NÃO conta como
--    atendimento: a pessoa é classificada como "Não atendida". Nenhum dado
--    histórico é alterado; a regra vive só na leitura.
--
-- 2. ALERTA "Sem contato +48h" (separado, sobrepõe um estado, não soma):
--    pessoa que aguarda nova ação humana há mais que care_alert_threshold():
--      - estado nao_atendida ou em_atendimento (atendida/cancelado nunca alertam);
--      - referência = data da última tentativa quando o resultado dela pede
--        nova tentativa (nao_atendeu, sem_resposta);
--      - sem nenhuma tentativa registrada: referência = data de cadastro;
--      - última tentativa com qualquer outro resultado (realizado, encaminhado,
--        reagendado, pediu_retorno, numero_errado…): sem alerta.
--    Threshold centralizado em care_alert_threshold() (48h; "+40h" citado pela
--    IGV fica para decisão explícita).
--
-- 3. CONTADORES NO MESMO UNIVERSO DA LISTA: get_care_status_counts recebe os
--    mesmos filtros de get_people_page (unidade, etapa, origem, etiqueta, mês
--    de aniversário, primeira visita, período de cadastro, busca). O universo
--    comum é people_filter_base(); nenhuma lógica duplicada no frontend.
-- ============================================================

-- ── Threshold único do alerta ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.care_alert_threshold()
RETURNS interval
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$ SELECT interval '48 hours' $$;
REVOKE ALL ON FUNCTION public.care_alert_threshold() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.care_alert_threshold() TO authenticated, service_role;

-- ── Estado único por pessoa ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.person_care_state(p_person_id uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Em atendimento: jornada aberta com atividade humana registrada
    WHEN EXISTS (
      SELECT 1 FROM person_journey j
      WHERE j.person_id = p_person_id AND j.closed_at IS NULL
        AND EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = j.id))
      THEN 'em_atendimento'
    -- Encerrada: classifica pelo desfecho da última jornada encerrada
    WHEN EXISTS (SELECT 1 FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NOT NULL)
      THEN CASE
        WHEN (SELECT j.outcome FROM person_journey j
               WHERE j.person_id = p_person_id AND j.closed_at IS NOT NULL
               ORDER BY j.closed_at DESC LIMIT 1) IN ('nao_quer_contato', 'mudou_de_igreja')
          THEN 'cancelado'
        ELSE 'atendida'
      END
    -- Sem jornada, ou só jornada aberta sem nenhum evento (legado de backfill)
    ELSE 'nao_atendida'
  END
$function$;

REVOKE ALL ON FUNCTION public.person_care_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_care_state(uuid) TO authenticated, service_role;

-- ── Referência temporal do alerta (NULL = não alerta) ────────────────────
CREATE OR REPLACE FUNCTION public.person_care_alert_ref(p_person_id uuid)
RETURNS timestamptz
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  WITH last_attempt AS (
    SELECT je.payload ->> 'result' AS result,
           COALESCE(
             CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (je.payload ->> 'contact_date')::timestamptz END,
             je.created_at) AS at
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE pj.person_id = p_person_id AND je.event_type = 'pastoral_contact'
    -- Última tentativa pela DATA DA TENTATIVA (contact_date), depois pela ordem de registro
    ORDER BY 2 DESC, je.created_at DESC, je.id DESC
    LIMIT 1
  )
  SELECT CASE
    WHEN person_care_state(p_person_id) NOT IN ('nao_atendida', 'em_atendimento') THEN NULL
    WHEN NOT EXISTS (SELECT 1 FROM last_attempt) THEN (SELECT p.created_at FROM people p WHERE p.id = p_person_id)
    WHEN (SELECT result FROM last_attempt) IN ('nao_atendeu', 'sem_resposta') THEN (SELECT at FROM last_attempt)
    ELSE NULL
  END
$function$;
REVOKE ALL ON FUNCTION public.person_care_alert_ref(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_care_alert_ref(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.person_care_alert(p_person_id uuid)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(person_care_alert_ref(p_person_id) <= NOW() - care_alert_threshold(), false)
$function$;
REVOKE ALL ON FUNCTION public.person_care_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_care_alert(uuid) TO authenticated, service_role;

-- ── Universo comum da lista e dos contadores (sem o filtro de atendimento) ─
CREATE OR REPLACE FUNCTION public.people_filter_base(
  p_church_id uuid,
  p_unit_id text DEFAULT NULL,
  p_stage_key text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_birth_month integer DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_created_from date DEFAULT NULL,
  p_created_to date DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(id uuid, created_at timestamptz, birth_day integer, name_sort text)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT (SELECT c.unit_cutoff_date FROM churches c WHERE c.id = p_church_id) AS cutoff,
           NULLIF(extensions.unaccent(lower(trim(COALESCE(p_search, '')))), '') AS q
  )
  SELECT p.id, p.created_at, p.birth_day, p.name_sort
  FROM people p
  CROSS JOIN cfg
  LEFT JOIN person_pipeline pp ON pp.person_id = p.id
  LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
  WHERE p.church_id = p_church_id
    AND p.deleted_at IS NULL
    AND p.left_at IS NULL
    AND people_unit_scope_ok(p.unit_id, p.created_at, cfg.cutoff, p_unit_id)
    AND (p_stage_key IS NULL
         OR (p_stage_key = '__none' AND pp.id IS NULL)
         OR ps.stage_key = p_stage_key)
    AND (p_stage IS NULL OR p.person_stage::text = p_stage)
    AND (p_source IS NULL OR p.source::text = p_source)
    AND (p_tag_id IS NULL OR EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p.id AND pt.tag_id = p_tag_id))
    AND (p_birth_month IS NULL OR p.birth_month = p_birth_month)
    AND (p_date_from IS NULL OR p.first_visit_date >= p_date_from)
    AND (p_date_to   IS NULL OR p.first_visit_date <= p_date_to)
    AND (p_created_from IS NULL OR p.created_at::date >= p_created_from)
    AND (p_created_to   IS NULL OR p.created_at::date <= p_created_to)
    AND (cfg.q IS NULL
         OR p.name_sort ILIKE '%' || cfg.q || '%'
         OR p.phone ILIKE '%' || cfg.q || '%'
         OR p.email ILIKE '%' || cfg.q || '%')
$function$;
-- Interna: só chamada por funções SECURITY DEFINER que já validam o tenant
REVOKE ALL ON FUNCTION public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text) TO service_role;

-- ── Lista + total: mesmo universo, filtro de atendimento por cima ────────
CREATE OR REPLACE FUNCTION public.get_people_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer)
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
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search) b
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

-- ── Contadores: mesmos filtros da lista; estados somam o total; alerta à parte ─
DROP FUNCTION IF EXISTS public.get_care_status_counts(uuid, text);
CREATE OR REPLACE FUNCTION public.get_care_status_counts(
  p_church_id uuid,
  p_unit_id text DEFAULT NULL,
  p_stage_key text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_birth_month integer DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_created_from date DEFAULT NULL,
  p_created_to date DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM assert_church_access(p_church_id);

  WITH base AS (
    SELECT b.id, person_care_state(b.id) AS st, person_care_alert(b.id) AS alert
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search) b
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
REVOKE ALL ON FUNCTION public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text) TO authenticated, service_role;
