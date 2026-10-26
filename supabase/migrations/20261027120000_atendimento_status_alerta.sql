-- ============================================================
-- STATUS e alerta do Atendimento (reunião IGV 26/10)
--  1. "Em atendimento" só com tentativa real (pastoral_contact) ou encaminhamento (ministry_referral) humanos.
--     Abrir jornada, mudar etapa ou salvar dados ("Não tentei") não tira a pessoa de "Não atendida".
--  2. Alerta "Sem contato +48h" só para "Não atendida" (nunca maior que ela). Limite segue 48 h (care_alert_threshold).
--  3. journey_register_attendance: "Não tentei" em pessoa sem jornada salva os dados sem exigir etapa.
-- Definições = produção de 26/10 (após #484) + só as linhas marcadas (gerado por script). CREATE OR REPLACE mantém
-- assinaturas e privilégios. Nenhum dado é alterado. Rollback: docs/rollbacks/20261027120000_atendimento_status_alerta.rollback.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.person_care_state(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Em atendimento: jornada aberta com atividade HUMANA registrada.
    -- Só eventos actor_type = 'human' (CHECK do schema: human ⇒ actor_id NOT NULL).
    -- Eventos 'system'/'agent' (journey_advance/assign/close/transfer/update_next_step
    -- chamadas por service_role, journey_register_touch, agentes) NÃO colocam ninguém em atendimento.
    WHEN EXISTS (
      SELECT 1 FROM person_journey j
      WHERE j.person_id = p_person_id AND j.closed_at IS NULL
        AND EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = j.id AND e.actor_type = 'human'
                    -- ata IGV 26/10: só tentativa real ou encaminhamento; abrir jornada/salvar dados não é atendimento
                    AND e.event_type IN ('pastoral_contact', 'ministry_referral')))
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

CREATE OR REPLACE FUNCTION public.person_care_alert_ref(p_person_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
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
    WHEN person_care_state(p_person_id) <> 'nao_atendida' THEN NULL   -- ata IGV: alerta ⊆ Não atendida
    WHEN NOT EXISTS (SELECT 1 FROM last_attempt) THEN (SELECT p.created_at FROM people p WHERE p.id = p_person_id)
    WHEN (SELECT result FROM last_attempt) IN ('nao_atendeu', 'sem_resposta') THEN (SELECT at FROM last_attempt)
    ELSE NULL
  END
$function$;

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
             WHEN st.s <> 'nao_atendida' THEN NULL   -- ata IGV: alerta ⊆ Não atendida
             WHEN la.person_id IS NULL THEN st.created_at
             WHEN la.result IN ('nao_atendeu', 'sem_resposta') THEN la.at
             ELSE NULL
           END <= NOW() - care_alert_threshold(),
           false)
  FROM st LEFT JOIN la ON la.person_id = st.id
$function$;

CREATE OR REPLACE FUNCTION public.export_people_rows(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_contact text DEFAULT NULL::text)
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
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role, p_contact) b
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
               WHEN x.care_state <> 'nao_atendida' THEN NULL   -- ata IGV: alerta ⊆ Não atendida
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

CREATE OR REPLACE FUNCTION public.export_people_rows_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000, p_contact text DEFAULT NULL::text)
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
                              p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role, p_contact) b2
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
               WHEN x.care_state <> 'nao_atendida' THEN NULL   -- ata IGV: alerta ⊆ Não atendida
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

CREATE OR REPLACE FUNCTION public.journey_register_attendance(p_person_id uuid, p_expected_version integer DEFAULT NULL::integer, p_people_updates jsonb DEFAULT '{}'::jsonb, p_contact_channel text DEFAULT 'presencial'::text, p_contact_result text DEFAULT 'realizado'::text, p_contact_notes text DEFAULT NULL::text, p_contact_date timestamp with time zone DEFAULT now(), p_new_stage_id uuid DEFAULT NULL::uuid, p_next_step text DEFAULT NULL::text, p_next_step_due_at date DEFAULT NULL::date, p_ministry_id uuid DEFAULT NULL::uuid, p_close_journey boolean DEFAULT NULL::boolean, p_register_contact boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_person          people%ROWTYPE;
  v_journey         person_journey%ROWTYPE;
  v_actor_id        uuid;
  v_prev_stage      uuid;
  v_has_stage_change boolean;
  v_should_close    boolean;
  v_leader_user_id  uuid;
  v_ministry_name   text;
  v_person_name     text;
BEGIN
  v_actor_id := auth.uid();
  PERFORM set_config('ekthos.pipeline_write', 'rpc', true);   -- Release 1: escrita de etapa autorizada por esta RPC

  -- Outcomes que encerram a jornada
  v_should_close := COALESCE(p_close_journey, FALSE)
                 OR p_contact_result IN ('nao_quer_contato', 'mudou_de_igreja');

  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  -- ── Autorização (validada no banco; a tela não é barreira) ──────────────
  -- Permitido: service_role; ou usuário autenticado da MESMA igreja da pessoa
  -- (tenant efetivo, cobre impersonação) com perfil autorizado a atender.
  -- Negado: anon, outra igreja, perfil não listado (volunteer, ministry_leader, treasurer…).
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_actor_id IS NULL
       OR auth_church_id() IS NULL
       OR v_person.church_id <> auth_church_id()
       OR COALESCE(auth_user_role()::text, '') NOT IN ('admin','admin_departments','pastor_celulas','supervisor','cell_leader','secretary') THEN
      RAISE EXCEPTION 'FORBIDDEN: sem permissão para registrar este atendimento' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_person_name := COALESCE(
    NULLIF(TRIM(COALESCE(v_person.first_name,'') || ' ' || COALESCE(v_person.last_name,'')), ''),
    v_person.name
  );

  -- 1. Atualiza campos da pessoa (nunca sobrescreve valor existente com vazio)
  UPDATE people SET
    neighborhood          = COALESCE(NULLIF(p_people_updates->>'neighborhood',''),          neighborhood),
    city                  = COALESCE(NULLIF(p_people_updates->>'city',''),                  city),
    como_conheceu         = COALESCE(NULLIF(p_people_updates->>'como_conheceu',''),         como_conheceu),
    phone                 = COALESCE(NULLIF(p_people_updates->>'phone',''),                 phone),
    marital_status        = COALESCE(NULLIF(p_people_updates->>'marital_status',''),        marital_status),
    observacoes_pastorais = COALESCE(NULLIF(p_people_updates->>'observacoes_pastorais',''), observacoes_pastorais),
    birth_date = CASE
      WHEN p_people_updates ? 'birth_date' AND NULLIF(p_people_updates->>'birth_date','') IS NOT NULL
        THEN (p_people_updates->>'birth_date')::date
      ELSE birth_date
    END,
    updated_at = NOW()
  WHERE id = p_person_id;

  -- 2. Localiza jornada ativa
  SELECT * INTO v_journey
  FROM person_journey
  WHERE person_id = p_person_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Sem jornada aberta e sem etapa: não pode haver sucesso silencioso sem contato
    -- ata IGV 26/10: "Não tentei" (sem contato, sem encaminhamento, sem encerramento) só salva os dados da pessoa
    IF p_new_stage_id IS NULL AND (COALESCE(p_register_contact, true) OR p_ministry_id IS NOT NULL OR COALESCE(p_close_journey, false)) THEN
      RAISE EXCEPTION 'JOURNEY_REQUIRED'
        USING ERRCODE = 'P0001',
              HINT = 'Pessoa sem jornada aberta: informe a etapa para abrir a jornada e registrar o contato';
    END IF;
    IF p_new_stage_id IS NOT NULL THEN
      INSERT INTO person_journey (person_id, church_id, stage_id, owner_id, agent_locked_at, version,
                                  next_step, next_step_due_at, ministry_id)
      VALUES (p_person_id, v_person.church_id, p_new_stage_id, v_actor_id, NOW(), 1,
              NULLIF(p_next_step,''), p_next_step_due_at, p_ministry_id)
      RETURNING * INTO v_journey;

      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'journey_opened', v_actor_id, 'human',
        jsonb_build_object('stage_id', p_new_stage_id, 'source', 'attendance_registration'));
    END IF;

  ELSE
    IF p_expected_version IS NOT NULL AND v_journey.version != p_expected_version THEN
      RAISE EXCEPTION 'JOURNEY_VERSION_CONFLICT';
    END IF;

    v_prev_stage      := v_journey.stage_id;
    v_has_stage_change := p_new_stage_id IS NOT NULL AND p_new_stage_id <> v_prev_stage;

    UPDATE person_journey SET
      stage_id         = COALESCE(p_new_stage_id, stage_id),
      owner_id         = CASE WHEN owner_id IS NULL THEN v_actor_id ELSE owner_id END,
      ministry_id      = COALESCE(p_ministry_id, ministry_id),
      next_step        = CASE WHEN NULLIF(p_next_step,'') IS NOT NULL THEN p_next_step ELSE next_step END,
      next_step_due_at = CASE
                           WHEN v_has_stage_change THEN p_next_step_due_at
                           WHEN p_next_step_due_at IS NOT NULL THEN p_next_step_due_at
                           ELSE next_step_due_at
                         END,
      closed_at        = CASE WHEN v_should_close THEN NOW() ELSE closed_at END,
      outcome          = CASE WHEN v_should_close THEN p_contact_result ELSE outcome END,
      version          = version + 1,
      updated_at       = NOW()
    WHERE id = v_journey.id
    RETURNING * INTO v_journey;

    IF v_has_stage_change THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'stage_advance', v_actor_id, 'human',
        jsonb_build_object(
          'from_stage_id', v_prev_stage,
          'to_stage_id',   p_new_stage_id,
          'source',        'attendance_registration'
        ));
    END IF;
  END IF;

  -- 3. Sincroniza Kanban (person_pipeline + people.pipeline_stage_id)
  IF p_new_stage_id IS NOT NULL AND v_journey.id IS NOT NULL THEN
    INSERT INTO person_pipeline (id, church_id, person_id, stage_id,
                                 entered_at, last_activity_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_person.church_id, p_person_id, p_new_stage_id,
            NOW(), NOW(), NOW(), NOW())
    ON CONFLICT (church_id, person_id)
    DO UPDATE SET
      stage_id         = EXCLUDED.stage_id,
      last_activity_at = NOW(),
      updated_at       = NOW();

    UPDATE people
    SET pipeline_stage_id = p_new_stage_id, updated_at = NOW()
    WHERE id = p_person_id;
  END IF;

  -- 4. Registra evento de contato pastoral — SOMENTE quando houve contato de fato
  --    (p_register_contact). Salvar correções sem contato não cria pastoral_contact
  --    nem avança a numeração. A sequência de contatos continua ilimitada.
  IF v_journey.id IS NOT NULL AND p_register_contact THEN
    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (v_journey.id, v_person.church_id, 'pastoral_contact', v_actor_id, 'human',
      jsonb_build_object(
        'channel',      p_contact_channel,
        'result',       p_contact_result,
        'notes',        p_contact_notes,
        'contact_date', p_contact_date
      ));
  END IF;

  -- 5. Encaminhamento para ministério — evento + notificação para o líder (E7)
  IF p_ministry_id IS NOT NULL AND v_journey.id IS NOT NULL THEN
    SELECT name INTO v_ministry_name FROM ministries WHERE id = p_ministry_id;

    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (v_journey.id, v_person.church_id, 'ministry_referral', v_actor_id, 'human',
      jsonb_build_object(
        'ministry_id',   p_ministry_id,
        'ministry_name', v_ministry_name
      ));

    -- Notificar a conta vinculada ao ministério (ministries.leader_user_id).
    -- Sem conta vinculada = "sem conta de líder": ninguém é notificado.
    -- Não procura conta pelo e-mail da pessoa líder (leader_id).
    SELECT m.leader_user_id INTO v_leader_user_id
    FROM ministries m
    WHERE m.id = p_ministry_id
      AND m.church_id = v_person.church_id;

    IF v_leader_user_id IS NOT NULL THEN
      INSERT INTO notifications (church_id, user_id, title, body, type, read, link, person_id)
      VALUES (
        v_person.church_id,
        v_leader_user_id,
        'Novo encaminhamento para o ministério',
        COALESCE(v_person_name, 'Uma pessoa') || ' foi encaminhada para ' || COALESCE(v_ministry_name, 'o seu ministério'),
        'ministry_referral',
        false,
        '/ministerios?tab=fila',   -- abre a Fila de Encaminhamentos (a conta do líder não acessa o Atendimento)
        p_person_id
      );
    END IF;
  END IF;

  PERFORM set_config('ekthos.pipeline_write', '', true);
  RETURN jsonb_build_object(
    'person_id',      p_person_id,
    'journey_id',     v_journey.id,
    'stage_id',       v_journey.stage_id,
    'version',        v_journey.version,
    'owner_id',       v_journey.owner_id,
    'journey_closed', v_should_close AND v_journey.id IS NOT NULL
  );
END;
$function$;
