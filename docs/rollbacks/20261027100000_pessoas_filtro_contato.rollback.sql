-- Rollback de 20261027100000_pessoas_filtro_contato.sql — volta às definições de produção de 26/10/2026 (sem p_contact).
DROP FUNCTION IF EXISTS public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text, text);
DROP FUNCTION IF EXISTS public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text, text);
DROP FUNCTION IF EXISTS public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text, text);
DROP FUNCTION IF EXISTS public.export_people_rows_page(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text, timestamp with time zone, uuid, integer, text);

CREATE OR REPLACE FUNCTION public.people_filter_base(p_church_id uuid, p_unit_id text DEFAULT NULL::text, p_stage_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, birth_day integer, name_sort text)
 LANGUAGE sql
 STABLE
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
         OR (ps.stage_key = p_stage_key
             -- aba/etapa Visitante nunca lista um Membro identificado (classificação efetiva)
             AND NOT (p_stage_key = 'visitante' AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'member'))))
    AND (p_stage IS NULL OR p.person_stage::text = p_stage)
    AND (p_source IS NULL OR p.source::text = p_source)
    AND (p_tag_id IS NULL OR EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p.id AND pt.tag_id = p_tag_id))
    AND (p_birth_month IS NULL OR p.birth_month = p_birth_month)
    AND (p_date_from IS NULL OR p.first_visit_date >= p_date_from)
    AND (p_date_to   IS NULL OR p.first_visit_date <= p_date_to)
    AND (p_created_from IS NULL OR p.created_at::date >= p_created_from)
    AND (p_created_to   IS NULL OR p.created_at::date <= p_created_to)
    -- Classificação vigente (fonte única) e funções derivadas
    AND (p_classification IS NULL
         OR (p_classification = 'none'   AND p.id NOT IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls IS NOT NULL))
         OR (p_classification IN ('visitor', 'member') AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = p_classification)))
    AND (p_role IS NULL
         OR (p_role = 'member_only'      AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'member' AND pc.roles = '[]'::jsonb))
         OR (p_role = 'volunteer'        AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.roles @> '[{"role":"volunteer"}]'))
         OR (p_role = 'leader'           AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.roles @> '[{"role":"leader"}]'))
         OR (p_role = 'leader_volunteer' AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.roles @> '[{"role":"leader"}]' AND pc.roles @> '[{"role":"volunteer"}]')))
    AND (cfg.q IS NULL
         OR p.name_sort ILIKE '%' || cfg.q || '%'
         OR p.phone ILIKE '%' || cfg.q || '%'
         OR p.email ILIKE '%' || cfg.q || '%')
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

CREATE OR REPLACE FUNCTION public.get_people_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_sort_by text DEFAULT NULL::text, p_sort_dir text DEFAULT NULL::text)
 RETURNS TABLE(row_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sort text := CASE WHEN p_sort_by IN ('nome', 'telefone', 'atendimento', 'contatos', 'cadastro') THEN p_sort_by END;
  v_desc boolean := lower(coalesce(p_sort_dir, 'asc')) = 'desc';
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
  contact_counts AS MATERIALIZED (
    -- só é calculado quando a ordenação pede (mesma contagem de get_contact_counts: pastoral_contact reais)
    SELECT pj.person_id, COUNT(*) AS n
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE v_sort = 'contatos' AND pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'
    GROUP BY pj.person_id
  ),
  keyed AS (
    SELECT f.id, f.created_at, f.birth_day, f.name_sort,
           -- chave textual (nome, telefone, estado de atendimento)
           CASE v_sort
             WHEN 'nome'          THEN f.name_sort
             WHEN 'telefone'      THEN (SELECT pe.phone_normalized FROM people pe WHERE pe.id = f.id)
             WHEN 'atendimento'   THEN person_care_state(f.id)
           END AS sk,
           -- chave numérica (cadastro, contatos)
           CASE v_sort
             WHEN 'cadastro' THEN EXTRACT(EPOCH FROM f.created_at)
             WHEN 'contatos' THEN COALESCE((SELECT cc.n FROM contact_counts cc WHERE cc.person_id = f.id), 0)
           END AS sn
    FROM filtered f
  ),
  ranked AS (
    SELECT k.id,
           ROW_NUMBER() OVER (
             ORDER BY
               CASE WHEN p_birth_month IS NOT NULL THEN k.birth_day END ASC NULLS LAST,
               CASE WHEN p_birth_month IS NOT NULL THEN k.name_sort END ASC,
               CASE WHEN p_birth_month IS NULL AND NOT v_desc THEN k.sk END ASC NULLS LAST,
               CASE WHEN p_birth_month IS NULL AND v_desc THEN k.sk END DESC NULLS LAST,
               CASE WHEN p_birth_month IS NULL AND NOT v_desc THEN k.sn END ASC NULLS LAST,
               CASE WHEN p_birth_month IS NULL AND v_desc THEN k.sn END DESC NULLS LAST,
               k.created_at DESC, k.id DESC
           ) AS ord
    FROM keyed k
  ),
  paged_ids AS (
    SELECT r.id, r.ord FROM ranked r ORDER BY r.ord LIMIT p_limit OFFSET p_offset
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
  ORDER BY pi.ord;
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_people_rows(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_cutoff date;
BEGIN
  PERFORM assert_church_access(p_church_id);
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  -- Desempenho (ata IGV item 21): o estado/alerta de atendimento é calculado uma vez por pessoa e o alerta em lote;
  -- as CTEs de uso único são MATERIALIZED para o planejador não reavaliá-las em laço aninhado (antes: 110 s e erro 500
  -- por statement_timeout de 8 s do papel authenticated). A regra de negócio é a MESMA de person_care_state /
  -- person_care_alert_ref (igualdade linha a linha coberta por supabase/tests/export_people_rows_perf_regression.sql).
  WITH base AS MATERIALIZED (
    SELECT b.id, b.created_at, b.name_sort, person_care_state(b.id) AS care_state
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
  ),
  last_attempt AS MATERIALIZED (
    -- Última tentativa pela DATA DA TENTATIVA (contact_date), depois pela ordem de registro (igual a person_care_alert_ref)
    SELECT DISTINCT ON (pj.person_id)
           pj.person_id,
           je.payload ->> 'result' AS result,
           COALESCE(
             CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (je.payload ->> 'contact_date')::timestamptz END,
             je.created_at) AS at
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE je.event_type = 'pastoral_contact'
    ORDER BY pj.person_id,
             COALESCE(CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                           THEN (je.payload ->> 'contact_date')::timestamptz END, je.created_at) DESC,
             je.created_at DESC, je.id DESC
  ),
  with_alert AS MATERIALIZED (
    SELECT x.id, x.created_at, x.name_sort, x.care_state,
           COALESCE(
             CASE
               WHEN x.care_state NOT IN ('nao_atendida', 'em_atendimento') THEN NULL
               WHEN la.person_id IS NULL THEN pe.created_at
               WHEN la.result IN ('nao_atendeu', 'sem_resposta') THEN la.at
               ELSE NULL
             END <= NOW() - care_alert_threshold(),
             false) AS care_alert
    FROM base x
    LEFT JOIN last_attempt la ON la.person_id = x.id
    LEFT JOIN people pe ON pe.id = x.id
  ),
  filtered AS (
    -- Exatamente o universo de get_people_page (mesmos filtros + estado/alerta)
    SELECT w.id, w.created_at, w.name_sort, w.care_state, w.care_alert
    FROM with_alert w
    WHERE p_care_status IS NULL
       OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado') AND w.care_state = p_care_status)
       OR (p_care_status = 'sem_contato_48h' AND w.care_alert)
  ),
  contacts AS (
    -- Um item por pastoral_contact real, ordem canônica de get_person_contacts
    SELECT pj.person_id,
           je.id AS event_id,
           ROW_NUMBER() OVER (PARTITION BY pj.person_id ORDER BY je.created_at, je.payload ->> 'contact_date', je.id) AS ordinal,
           COALESCE(
             CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (je.payload ->> 'contact_date')::timestamptz END,
             je.created_at) AS contact_date,
           je.payload ->> 'result'  AS result,
           je.payload ->> 'channel' AS channel,
           NULLIF(je.payload ->> 'notes', '') AS notes,
           je.actor_id,
           COALESCE(
             pr.name, pr.display_name,
             au.raw_user_meta_data ->> 'full_name', au.email,
             CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
           )::text AS actor_name
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    LEFT JOIN auth.users au ON au.id      = je.actor_id
    LEFT JOIN profiles   pr ON pr.user_id = je.actor_id
    WHERE pj.church_id = p_church_id
      AND je.event_type = 'pastoral_contact'
      AND pj.person_id IN (SELECT id FROM filtered)
  ),
  contacts_agg AS MATERIALIZED (
    SELECT person_id,
           COUNT(*) AS n,
           jsonb_agg(jsonb_build_object(
             'ordinal', ordinal, 'event_id', event_id, 'contact_date', contact_date,
             'result', result, 'channel', channel, 'notes', notes,
             'actor_id', actor_id, 'actor_name', actor_name) ORDER BY ordinal) AS items
    FROM contacts GROUP BY person_id
  ),
  ministries_agg AS MATERIALIZED (
    SELECT mm.person_id, string_agg(m.name, ' | ' ORDER BY m.name, m.id) AS nomes
    FROM ministry_members mm
    JOIN ministries m ON m.id = mm.ministry_id
    WHERE mm.church_id = p_church_id AND m.church_id = p_church_id
      AND mm.person_id IN (SELECT id FROM filtered)
    GROUP BY mm.person_id
  ),
  roles_agg AS (
    SELECT s.person_id, jsonb_agg(s.r ORDER BY (s.r->>'role') = 'leader' DESC, s.r->>'ref_name') AS roles
    FROM (
      SELECT m.leader_id AS person_id, jsonb_build_object('role','leader','basis','ministry_leader','ref_id',m.id,'ref_name',m.name) AS r
        FROM ministries m WHERE m.church_id = p_church_id AND m.is_active IS NOT FALSE AND m.leader_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT mm.person_id, jsonb_build_object('role','leader','basis','ministry_' || mm.role::text,'ref_id',m.id,'ref_name',m.name)
        FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id
       WHERE mm.church_id = p_church_id AND mm.role::text IN ('lider','coordenador') AND m.is_active IS NOT FALSE AND mm.person_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT g.leader_id, jsonb_build_object('role','leader','basis','cell_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND COALESCE(g.status,'active') NOT IN ('inactive','archived') AND g.leader_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT g.co_leader_id, jsonb_build_object('role','leader','basis','cell_co_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND COALESCE(g.status,'active') NOT IN ('inactive','archived') AND g.co_leader_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT v.person_id, jsonb_build_object('role','volunteer','basis','volunteer_active','ref_id',v.id,'ref_name',COALESCE(m.name, v.role, 'Voluntário'))
        FROM volunteers v LEFT JOIN ministries m ON m.id = v.ministry_id
       WHERE v.church_id = p_church_id AND v.is_active = true AND v.person_id IN (SELECT id FROM filtered)
    ) s GROUP BY s.person_id
  ),
  legacy_cls AS MATERIALIZED (
    -- derivada do legado em lote (mesma regra de person_legacy_classification)
    SELECT f.id AS person_id,
      CASE
        WHEN EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = f.id AND t.category = 'person_type' AND t.name = 'Membro')
          OR EXISTS (SELECT 1 FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = f.id AND ps.stage_key IN ('membro','membro_afastado','lider','voluntario'))
          OR EXISTS (SELECT 1 FROM roles_agg ra WHERE ra.person_id = f.id)
          OR EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = f.id AND mm.role::text IN ('lider','coordenador'))
        THEN 'member'
        WHEN EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = f.id AND t.category = 'person_type' AND t.name = 'Visitante')
          OR EXISTS (SELECT 1 FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = f.id AND ps.stage_key = 'visitante')
        THEN 'visitor'
      END AS cls
    FROM filtered f
  ),
  stage_now AS MATERIALIZED (
    -- Entrada na etapa ATUAL: person_pipeline.entered_at (mesma linha usada para o nome da etapa). Vazio quando a pessoa não tem etapa.
    SELECT DISTINCT ON (pp.person_id) pp.person_id, pp.entered_at
    FROM person_pipeline pp
    WHERE pp.church_id = p_church_id AND pp.person_id IN (SELECT id FROM filtered)
    ORDER BY pp.person_id, pp.entered_at DESC
  ),
  rows_ AS (
    SELECT jsonb_build_object(
      'id',               p.id,
      'name',             p.name,
      'phone',            p.phone,
      'email',            p.email,
      'etapa',            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id
                            WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
      'care_state',       f.care_state,
      'care_alert',       f.care_alert,
      'classification',   person_classification_build(
                            COALESCE(CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor','member') THEN p.membership_status END, lg.cls),
                            COALESCE(ra.roles, '[]'::jsonb),
                            (SELECT ps.stage_key FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
                            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
                            CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor','member') THEN 'validated' WHEN lg.cls IS NOT NULL THEN 'legacy' END),
      -- Unidade OPERACIONAL canônica (mesma regra do filtro da tela: people_operational_unit + cutoff da igreja).
      -- unit_id cadastral é mantido só como referência; a coluna "Unidade" do CSV usa unit_name (operacional).
      'unit_id',          p.unit_id,
      'unit_operational_id', people_operational_unit(p.unit_id, p.created_at, v_cutoff),
      'unit_name',        (SELECT cu.name FROM church_units cu WHERE cu.id = people_operational_unit(p.unit_id, p.created_at, v_cutoff)),
      'first_visit_date', p.first_visit_date,
      'created_at',       p.created_at,
      'source',           p.source,
      'ministerios',      COALESCE(ma.nomes, ''),
      'contacts_count',   COALESCE(ca.n, 0),
      'contacts',         COALESCE(ca.items, '[]'::jsonb),
      -- Item 18 (ata IGV): tempo na etapa atual. NULL quando não há registro real (nada é inventado).
      'etapa_desde',      sn.entered_at,
      'dias_na_etapa',    CASE WHEN sn.entered_at IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - sn.entered_at::date) END
    ) AS row_, p.created_at, p.id
    FROM filtered f
    JOIN people p ON p.id = f.id
    LEFT JOIN contacts_agg  ca ON ca.person_id = p.id
    LEFT JOIN ministries_agg ma ON ma.person_id = p.id
    LEFT JOIN roles_agg ra ON ra.person_id = p.id
    LEFT JOIN legacy_cls lg ON lg.person_id = p.id
    LEFT JOIN stage_now sn ON sn.person_id = p.id
  )
  SELECT jsonb_build_object(
    'total',        (SELECT COUNT(*) FROM rows_),
    'max_contacts', COALESCE((SELECT MAX(n) FROM contacts_agg), 0),
    'alert_threshold_hours', EXTRACT(EPOCH FROM care_alert_threshold())::int / 3600,
    'rows',         COALESCE((SELECT jsonb_agg(row_ ORDER BY created_at DESC, id DESC) FROM rows_), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.export_people_rows_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_cutoff date;
  v_limit  int := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 2000);
BEGIN
  PERFORM assert_church_access(p_church_id);
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  -- Desempenho (ata IGV item 21): o estado/alerta de atendimento é calculado uma vez por pessoa e o alerta em lote;
  -- as CTEs de uso único são MATERIALIZED para o planejador não reavaliá-las em laço aninhado (antes: 110 s e erro 500
  -- por statement_timeout de 8 s do papel authenticated). A regra de negócio é a MESMA de person_care_state /
  -- person_care_alert_ref (igualdade linha a linha coberta por supabase/tests/export_people_rows_perf_regression.sql).
  WITH base AS MATERIALIZED (
    SELECT b.id, b.created_at, b.name_sort, person_care_state(b.id) AS care_state
    FROM (
      SELECT b2.id, b2.created_at, b2.name_sort
      FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                              p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b2
      WHERE p_after_created_at IS NULL OR (b2.created_at, b2.id) < (p_after_created_at, p_after_id)
      ORDER BY b2.created_at DESC, b2.id DESC
      -- sem filtro de estado: o estado só é calculado para a página (+1 para saber se há mais)
      LIMIT CASE WHEN p_care_status IS NULL THEN v_limit + 1 END
    ) b
  ),
  last_attempt AS MATERIALIZED (
    -- Última tentativa pela DATA DA TENTATIVA (contact_date), depois pela ordem de registro (igual a person_care_alert_ref)
    SELECT DISTINCT ON (pj.person_id)
           pj.person_id,
           je.payload ->> 'result' AS result,
           COALESCE(
             CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (je.payload ->> 'contact_date')::timestamptz END,
             je.created_at) AS at
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE je.event_type = 'pastoral_contact'
    ORDER BY pj.person_id,
             COALESCE(CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                           THEN (je.payload ->> 'contact_date')::timestamptz END, je.created_at) DESC,
             je.created_at DESC, je.id DESC
  ),
  with_alert AS MATERIALIZED (
    SELECT x.id, x.created_at, x.name_sort, x.care_state,
           COALESCE(
             CASE
               WHEN x.care_state NOT IN ('nao_atendida', 'em_atendimento') THEN NULL
               WHEN la.person_id IS NULL THEN pe.created_at
               WHEN la.result IN ('nao_atendeu', 'sem_resposta') THEN la.at
               ELSE NULL
             END <= NOW() - care_alert_threshold(),
             false) AS care_alert
    FROM base x
    LEFT JOIN last_attempt la ON la.person_id = x.id
    LEFT JOIN people pe ON pe.id = x.id
  ),
  filtered AS (
    -- Exatamente o universo de get_people_page (mesmos filtros + estado/alerta)
    SELECT w.id, w.created_at, w.name_sort, w.care_state, w.care_alert
    FROM with_alert w
    WHERE p_care_status IS NULL
       OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado') AND w.care_state = p_care_status)
       OR (p_care_status = 'sem_contato_48h' AND w.care_alert)
  ),
  paged_all AS MATERIALIZED (
    SELECT f.id, f.created_at, f.name_sort, f.care_state, f.care_alert
    FROM filtered f
    ORDER BY f.created_at DESC, f.id DESC
    LIMIT v_limit + 1
  ),
  page_f AS MATERIALIZED (
    SELECT pa.id, pa.created_at, pa.name_sort, pa.care_state, pa.care_alert
    FROM paged_all pa
    ORDER BY pa.created_at DESC, pa.id DESC
    LIMIT v_limit
  ),
  contacts AS (
    -- Um item por pastoral_contact real, ordem canônica de get_person_contacts
    SELECT pj.person_id,
           je.id AS event_id,
           ROW_NUMBER() OVER (PARTITION BY pj.person_id ORDER BY je.created_at, je.payload ->> 'contact_date', je.id) AS ordinal,
           COALESCE(
             CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (je.payload ->> 'contact_date')::timestamptz END,
             je.created_at) AS contact_date,
           je.payload ->> 'result'  AS result,
           je.payload ->> 'channel' AS channel,
           NULLIF(je.payload ->> 'notes', '') AS notes,
           je.actor_id,
           COALESCE(
             pr.name, pr.display_name,
             au.raw_user_meta_data ->> 'full_name', au.email,
             CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
           )::text AS actor_name
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    LEFT JOIN auth.users au ON au.id      = je.actor_id
    LEFT JOIN profiles   pr ON pr.user_id = je.actor_id
    WHERE pj.church_id = p_church_id
      AND je.event_type = 'pastoral_contact'
      AND pj.person_id IN (SELECT id FROM page_f)
  ),
  contacts_agg AS MATERIALIZED (
    SELECT person_id,
           COUNT(*) AS n,
           jsonb_agg(jsonb_build_object(
             'ordinal', ordinal, 'event_id', event_id, 'contact_date', contact_date,
             'result', result, 'channel', channel, 'notes', notes,
             'actor_id', actor_id, 'actor_name', actor_name) ORDER BY ordinal) AS items
    FROM contacts GROUP BY person_id
  ),
  ministries_agg AS MATERIALIZED (
    SELECT mm.person_id, string_agg(m.name, ' | ' ORDER BY m.name, m.id) AS nomes
    FROM ministry_members mm
    JOIN ministries m ON m.id = mm.ministry_id
    WHERE mm.church_id = p_church_id AND m.church_id = p_church_id
      AND mm.person_id IN (SELECT id FROM page_f)
    GROUP BY mm.person_id
  ),
  roles_agg AS (
    SELECT s.person_id, jsonb_agg(s.r ORDER BY (s.r->>'role') = 'leader' DESC, s.r->>'ref_name') AS roles
    FROM (
      SELECT m.leader_id AS person_id, jsonb_build_object('role','leader','basis','ministry_leader','ref_id',m.id,'ref_name',m.name) AS r
        FROM ministries m WHERE m.church_id = p_church_id AND m.is_active IS NOT FALSE AND m.leader_id IN (SELECT id FROM page_f)
      UNION ALL
      SELECT mm.person_id, jsonb_build_object('role','leader','basis','ministry_' || mm.role::text,'ref_id',m.id,'ref_name',m.name)
        FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id
       WHERE mm.church_id = p_church_id AND mm.role::text IN ('lider','coordenador') AND m.is_active IS NOT FALSE AND mm.person_id IN (SELECT id FROM page_f)
      UNION ALL
      SELECT g.leader_id, jsonb_build_object('role','leader','basis','cell_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND COALESCE(g.status,'active') NOT IN ('inactive','archived') AND g.leader_id IN (SELECT id FROM page_f)
      UNION ALL
      SELECT g.co_leader_id, jsonb_build_object('role','leader','basis','cell_co_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND COALESCE(g.status,'active') NOT IN ('inactive','archived') AND g.co_leader_id IN (SELECT id FROM page_f)
      UNION ALL
      SELECT v.person_id, jsonb_build_object('role','volunteer','basis','volunteer_active','ref_id',v.id,'ref_name',COALESCE(m.name, v.role, 'Voluntário'))
        FROM volunteers v LEFT JOIN ministries m ON m.id = v.ministry_id
       WHERE v.church_id = p_church_id AND v.is_active = true AND v.person_id IN (SELECT id FROM page_f)
    ) s GROUP BY s.person_id
  ),
  legacy_cls AS MATERIALIZED (
    -- derivada do legado em lote (mesma regra de person_legacy_classification)
    SELECT f.id AS person_id,
      CASE
        WHEN EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = f.id AND t.category = 'person_type' AND t.name = 'Membro')
          OR EXISTS (SELECT 1 FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = f.id AND ps.stage_key IN ('membro','membro_afastado','lider','voluntario'))
          OR EXISTS (SELECT 1 FROM roles_agg ra WHERE ra.person_id = f.id)
          OR EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = f.id AND mm.role::text IN ('lider','coordenador'))
        THEN 'member'
        WHEN EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = f.id AND t.category = 'person_type' AND t.name = 'Visitante')
          OR EXISTS (SELECT 1 FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = f.id AND ps.stage_key = 'visitante')
        THEN 'visitor'
      END AS cls
    FROM page_f f
  ),
  stage_now AS MATERIALIZED (
    -- Entrada na etapa ATUAL: person_pipeline.entered_at (mesma linha usada para o nome da etapa). Vazio quando a pessoa não tem etapa.
    SELECT DISTINCT ON (pp.person_id) pp.person_id, pp.entered_at
    FROM person_pipeline pp
    WHERE pp.church_id = p_church_id AND pp.person_id IN (SELECT id FROM page_f)
    ORDER BY pp.person_id, pp.entered_at DESC
  ),
  rows_ AS (
    SELECT jsonb_build_object(
      'id',               p.id,
      'name',             p.name,
      'phone',            p.phone,
      'email',            p.email,
      'etapa',            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id
                            WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
      'care_state',       f.care_state,
      'care_alert',       f.care_alert,
      'classification',   person_classification_build(
                            COALESCE(CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor','member') THEN p.membership_status END, lg.cls),
                            COALESCE(ra.roles, '[]'::jsonb),
                            (SELECT ps.stage_key FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
                            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
                            CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor','member') THEN 'validated' WHEN lg.cls IS NOT NULL THEN 'legacy' END),
      -- Unidade OPERACIONAL canônica (mesma regra do filtro da tela: people_operational_unit + cutoff da igreja).
      -- unit_id cadastral é mantido só como referência; a coluna "Unidade" do CSV usa unit_name (operacional).
      'unit_id',          p.unit_id,
      'unit_operational_id', people_operational_unit(p.unit_id, p.created_at, v_cutoff),
      'unit_name',        (SELECT cu.name FROM church_units cu WHERE cu.id = people_operational_unit(p.unit_id, p.created_at, v_cutoff)),
      'first_visit_date', p.first_visit_date,
      'created_at',       p.created_at,
      'source',           p.source,
      'ministerios',      COALESCE(ma.nomes, ''),
      'contacts_count',   COALESCE(ca.n, 0),
      'contacts',         COALESCE(ca.items, '[]'::jsonb),
      -- Item 18 (ata IGV): tempo na etapa atual. NULL quando não há registro real (nada é inventado).
      'etapa_desde',      sn.entered_at,
      'dias_na_etapa',    CASE WHEN sn.entered_at IS NULL THEN NULL ELSE GREATEST(0, CURRENT_DATE - sn.entered_at::date) END
    ) AS row_, p.created_at, p.id
    FROM page_f f
    JOIN people p ON p.id = f.id
    LEFT JOIN contacts_agg  ca ON ca.person_id = p.id
    LEFT JOIN ministries_agg ma ON ma.person_id = p.id
    LEFT JOIN roles_agg ra ON ra.person_id = p.id
    LEFT JOIN legacy_cls lg ON lg.person_id = p.id
    LEFT JOIN stage_now sn ON sn.person_id = p.id
  )
  SELECT jsonb_build_object(
    'count',        (SELECT COUNT(*) FROM rows_),
    'max_contacts', COALESCE((SELECT MAX(n) FROM contacts_agg), 0),
    'alert_threshold_hours', EXTRACT(EPOCH FROM care_alert_threshold())::int / 3600,
    'has_more',     (SELECT COUNT(*) FROM paged_all) > v_limit,
    -- cursor = a linha MAIS ANTIGA da página (a ordem é created_at DESC, id DESC)
    'next_after_created_at', (SELECT pf.created_at FROM page_f pf ORDER BY pf.created_at ASC, pf.id ASC LIMIT 1),
    'next_after_id',         (SELECT pf.id         FROM page_f pf ORDER BY pf.created_at ASC, pf.id ASC LIMIT 1),
    'rows',         COALESCE((SELECT jsonb_agg(row_ ORDER BY created_at DESC, id DESC) FROM rows_), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.export_people_rows_page(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text, timestamp with time zone, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_people_rows_page(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text, timestamp with time zone, uuid, integer) TO authenticated, service_role;
