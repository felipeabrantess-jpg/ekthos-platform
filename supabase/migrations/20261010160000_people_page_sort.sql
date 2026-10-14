-- ============================================================
-- Ata IGV — item 23: ordenação das colunas da aba Pessoas.
--
-- Auditoria (antes): cabeçalhos estáticos; get_people_page ordenava fixo por created_at DESC
-- (ou birth_day nas Aniversários). Filtros por coluna já existem (classificação, estado, origem,
-- cadastro, busca). Faltava a ORDENAÇÃO.
--
-- Mudança (aditiva): get_people_page ganha p_sort_by e p_sort_dir (ambos opcionais).
--   p_sort_by  ∈ nome | telefone | atendimento | contatos | cadastro   (outro valor = ignorado)
--   Classificação NÃO é ordenável: person_classification() por linha custou ~17 s na base inteira (limite do papel
--   authenticated = 8 s). Ela segue filtrável pelas opções Visitantes / Membros / Não classificados.
--   p_sort_dir ∈ asc | desc  (padrão asc; outro valor = asc)
-- Sem p_sort_by a ordem é EXATAMENTE a anterior (created_at DESC, id DESC; birth_day nas Aniversários).
-- Desempate sempre por created_at DESC, id DESC (ordem estável e paginação consistente).
-- A paginação passa a usar a posição calculada (ROW_NUMBER) para a mesma ordem valer na página e no retorno.
-- Contadores, filtros, estado, alerta e classificação não mudam.
--
-- Como a assinatura muda (2 parâmetros novos), a função antiga é removida e recriada com a MESMA ACL
-- (postgres, authenticated, service_role). Chamadas existentes (por nome de parâmetro) seguem válidas.
-- Rollback: docs/rollbacks/20261010160000_people_page_sort.rollback.sql
-- ============================================================

DROP FUNCTION IF EXISTS public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text);

CREATE FUNCTION public.get_people_page(
  p_church_id uuid,
  p_care_status text DEFAULT NULL::text,
  p_unit_id text DEFAULT NULL::text,
  p_stage text DEFAULT NULL::text,
  p_source text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_created_from date DEFAULT NULL::date,
  p_created_to date DEFAULT NULL::date,
  p_stage_key text DEFAULT NULL::text,
  p_tag_id uuid DEFAULT NULL::uuid,
  p_birth_month integer DEFAULT NULL::integer,
  p_classification text DEFAULT NULL::text,
  p_role text DEFAULT NULL::text,
  p_sort_by text DEFAULT NULL::text,
  p_sort_dir text DEFAULT NULL::text)
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

REVOKE ALL ON FUNCTION public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text, text, text) TO authenticated, service_role;
