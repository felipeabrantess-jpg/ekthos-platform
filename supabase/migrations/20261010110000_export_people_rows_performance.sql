-- ============================================================
-- 20261010110000_export_people_rows_performance.sql
--
-- ATA IGV 05/10 — item 21 (CSV): exportação com filtro de estado falhava com HTTP 500
-- ("canceling statement due to statement timeout"; papel authenticated = 8 s).
--
-- CAUSA COMPROVADA (EXPLAIN ANALYZE em produção, filtro "Não atendida", 5.379 pessoas):
--   o planejador estimou 5 linhas para a CTE filtrada (real 5.379) e reavaliou a CTE legacy_cls
--   dentro de um laço aninhado — ~28,9 milhões de avaliações, 110 s. Além disso, estado e alerta
--   eram calculados duas vezes por linha (person_care_alert ≈ 0,8 ms/linha).
--
-- CORREÇÃO MÍNIMA (somente export_people_rows; contrato, colunas, ordem, filtros e regra inalterados):
--   1. contacts_agg, ministries_agg e legacy_cls viram MATERIALIZED;
--   2. estado e alerta são calculados uma vez por pessoa, o alerta em lote com a MESMA regra de
--      person_care_alert_ref (igualdade linha a linha comprovada em
--      supabase/tests/export_people_rows_perf_regression.sql).
--
-- Medido (5.454 pessoas, IGV): todos 5,3 s → 1,0 s; não atendida 110 s → 0,9 s;
-- sem contato +48h 9,2 s → 0,7 s. Saída idêntica (hash md5) à da função anterior em todos os estados.
--
-- Não altera: get_care_status_counts, person_care_state, person_care_alert*, get_people_page,
-- people_filter_base, ACL (CREATE OR REPLACE preserva).
-- Rollback: reaplicar a definição de export_people_rows de 20261009100000_person_classification_release1.sql.
-- ============================================================

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
      'contacts',         COALESCE(ca.items, '[]'::jsonb)
    ) AS row_, p.created_at, p.id
    FROM filtered f
    JOIN people p ON p.id = f.id
    LEFT JOIN contacts_agg  ca ON ca.person_id = p.id
    LEFT JOIN ministries_agg ma ON ma.person_id = p.id
    LEFT JOIN roles_agg ra ON ra.person_id = p.id
    LEFT JOIN legacy_cls lg ON lg.person_id = p.id
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
