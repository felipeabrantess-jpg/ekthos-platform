-- ============================================================
-- Itens 21 / 18 / 25 — Exportação CSV de Pessoas
--
-- Causa raiz do item 21: a tela chamava get_people_page (set-returning) com
-- p_limit = 5000, e o PostgREST deste projeto corta QUALQUER resposta em
-- max_rows = 1000 linhas → 1.000 pessoas + cabeçalho = 1.001 linhas.
--
-- Solução: RPC dedicada que devolve UM valor escalar jsonb (o PostgREST só
-- limita linhas, nunca o tamanho de um escalar) com o MESMO universo da lista
-- (people_filter_base + filtro de estado/alerta, idêntico a get_people_page):
--   { total, max_contacts, rows: [ { ...pessoa, ministerios, contatos:[...] } ] }
--
-- 1 pessoa = 1 linha. Contatos ilimitados: cada pessoa traz a lista completa de
-- pastoral_contact na ordem canônica de get_person_contacts (created_at,
-- contact_date, id); max_contacts = maior ordinal do universo exportado, para a
-- tela gerar as colunas "Nº contato — data/resultado/responsável" dinamicamente.
-- Responsável = ator persistido no evento (actor_id), resolvido como em
-- get_person_contacts (profiles → auth.users → Agente/Sistema); nunca o owner.
-- Ministério = ministry_members ⟶ ministries (nunca volunteers), ordenado por
-- nome e concatenado com " | ".
-- ============================================================

CREATE OR REPLACE FUNCTION public.export_people_rows(
  p_church_id uuid,
  p_care_status text DEFAULT NULL,
  p_unit_id text DEFAULT NULL,
  p_stage text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_created_from date DEFAULT NULL,
  p_created_to date DEFAULT NULL,
  p_stage_key text DEFAULT NULL,
  p_tag_id uuid DEFAULT NULL,
  p_birth_month integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM assert_church_access(p_church_id);

  WITH filtered AS (
    -- Exatamente o universo de get_people_page (mesmos filtros + estado/alerta)
    SELECT b.id, b.created_at, b.name_sort
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search) b
    WHERE p_care_status IS NULL
       OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado')
           AND person_care_state(b.id) = p_care_status)
       OR (p_care_status = 'sem_contato_48h' AND person_care_alert(b.id))
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
  contacts_agg AS (
    SELECT person_id,
           COUNT(*) AS n,
           jsonb_agg(jsonb_build_object(
             'ordinal', ordinal, 'event_id', event_id, 'contact_date', contact_date,
             'result', result, 'channel', channel, 'notes', notes,
             'actor_id', actor_id, 'actor_name', actor_name) ORDER BY ordinal) AS items
    FROM contacts GROUP BY person_id
  ),
  ministries_agg AS (
    SELECT mm.person_id, string_agg(m.name, ' | ' ORDER BY m.name, m.id) AS nomes
    FROM ministry_members mm
    JOIN ministries m ON m.id = mm.ministry_id
    WHERE mm.church_id = p_church_id AND m.church_id = p_church_id
      AND mm.person_id IN (SELECT id FROM filtered)
    GROUP BY mm.person_id
  ),
  rows_ AS (
    SELECT jsonb_build_object(
      'id',               p.id,
      'name',             p.name,
      'phone',            p.phone,
      'email',            p.email,
      'etapa',            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id
                            WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
      'care_state',       person_care_state(p.id),
      'care_alert',       person_care_alert(p.id),
      'unit_id',          p.unit_id,
      'unit_name',        (SELECT cu.name FROM church_units cu WHERE cu.id = p.unit_id),
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

REVOKE ALL ON FUNCTION public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer) TO authenticated, service_role;
