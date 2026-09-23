-- PR 2 — Pessoas canônico
--
-- 1. pipeline_stages.stage_key: identidade estável da etapa (regra de negócio nunca
--    depende de name nem do slug ambíguo 'frequentador').
-- 2. people_unit_scope_ok(): ÚNICO predicado de unidade usado por lista e contadores.
-- 3. get_people_page v3: fonte canônica (people ⟶ person_pipeline ⟶ pipeline_stages)
--    com filtros cumulativos: unidade, etapa (stage_key), atendimento, origem, tag,
--    busca, aniversário, período de cadastro, paginação. Retorna items + total_count.
-- 4. get_people_stage_counts(): badges das abas com os MESMOS predicados da lista.
-- 5. get_care_status_counts(p_unit_id): chips de atendimento por unidade.
--
-- Legado preservado (não lido por estas RPCs): people.person_stage,
-- people.pipeline_stage_id, people.membership_status, tags-espelho.
--
-- Rollback: DROP FUNCTION get_people_stage_counts(uuid,text,boolean);
--           DROP FUNCTION people_unit_scope_ok(uuid,timestamptz,date,text,boolean);
--           reaplicar get_people_page/get_care_status_counts de 20260923100000 / 20260910000001;
--           ALTER TABLE pipeline_stages DROP COLUMN stage_key;

-- ── 1. stage_key ─────────────────────────────────────────────────────────────
ALTER TABLE pipeline_stages ADD COLUMN IF NOT EXISTS stage_key text;
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_church_key ON pipeline_stages (church_id, stage_key);

-- Derivação inicial: slug normalizado; a etapa "Novo Convertido" (slug herdado
-- 'frequentador') recebe a chave 'novo_convertido'. Só preenche onde está NULL.
UPDATE pipeline_stages
SET stage_key = CASE
  WHEN slug = 'frequentador' AND extensions.unaccent(lower(name)) LIKE 'novo convertido%' THEN 'novo_convertido'
  ELSE replace(slug, '-', '_')
END
WHERE stage_key IS NULL;

-- ── 2. predicado único de unidade ────────────────────────────────────────────
-- p_scope: NULL = todas | 'none' = sem unidade | uuid = unidade.
-- p_apply_cutoff: quando TRUE e a igreja tem unit_cutoff_date, cadastros anteriores
-- ao corte contam como "sem unidade" (comportamento vigente em /pessoas).
CREATE OR REPLACE FUNCTION people_unit_scope_ok(
  p_unit uuid, p_created timestamptz, p_cutoff date, p_scope text, p_apply_cutoff boolean DEFAULT TRUE
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_scope IS NULL THEN TRUE
    WHEN p_scope = 'none' THEN
      (p_unit IS NULL OR (p_apply_cutoff AND p_cutoff IS NOT NULL AND p_created::date < p_cutoff))
    ELSE
      p_unit = p_scope::uuid
      AND (NOT p_apply_cutoff OR p_cutoff IS NULL OR p_created::date >= p_cutoff)
  END
$$;

-- ── 3. get_people_page v3 ────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date);

CREATE OR REPLACE FUNCTION get_people_page(
  p_church_id     uuid,
  p_care_status   text    DEFAULT NULL,
  p_unit_id       text    DEFAULT NULL,
  p_stage         text    DEFAULT NULL,   -- legado: people.person_stage (mantido por compatibilidade)
  p_source        text    DEFAULT NULL,
  p_search        text    DEFAULT NULL,
  p_date_from     date    DEFAULT NULL,   -- first_visit_date >=
  p_date_to       date    DEFAULT NULL,   -- first_visit_date <=
  p_limit         int     DEFAULT 50,
  p_offset        int     DEFAULT 0,
  p_created_from  date    DEFAULT NULL,
  p_created_to    date    DEFAULT NULL,
  p_stage_key     text    DEFAULT NULL,   -- canônico: pipeline_stages.stage_key ('__none' = sem etapa)
  p_tag_id        uuid    DEFAULT NULL,
  p_birth_month   int     DEFAULT NULL,
  p_apply_cutoff  boolean DEFAULT TRUE
)
RETURNS TABLE (row_data jsonb, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cutoff date;
  v_search text;
BEGIN
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;
  v_search := NULLIF(extensions.unaccent(lower(trim(COALESCE(p_search, '')))), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT p.id, p.created_at, p.birth_day, p.name_sort
    FROM people p
    LEFT JOIN person_pipeline pp ON pp.person_id = p.id
    LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id, p_apply_cutoff)
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
      AND (v_search IS NULL
           OR p.name_sort ILIKE '%' || v_search || '%'
           OR p.phone ILIKE '%' || v_search || '%'
           OR p.email ILIKE '%' || v_search || '%')
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
$$;
REVOKE ALL ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date,text,uuid,int,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date,text,uuid,int,boolean) TO authenticated;

-- ── 4. get_people_stage_counts — badges com os mesmos predicados da lista ────
CREATE OR REPLACE FUNCTION get_people_stage_counts(
  p_church_id uuid, p_unit_id text DEFAULT NULL, p_apply_cutoff boolean DEFAULT TRUE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_cutoff date;
  v_month  int := EXTRACT(MONTH FROM CURRENT_DATE);
  v_result jsonb;
BEGIN
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  WITH base AS (
    SELECT p.id, p.birth_month, ps.id AS stage_id, ps.stage_key
    FROM people p
    LEFT JOIN person_pipeline pp ON pp.person_id = p.id
    LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id, p_apply_cutoff)
  )
  SELECT jsonb_build_object(
    'total',        (SELECT COUNT(*) FROM base),
    'aniversarios', (SELECT COUNT(*) FROM base WHERE birth_month = v_month),
    'sem_etapa',    (SELECT COUNT(*) FROM base WHERE stage_id IS NULL),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'stage_id', s.id, 'stage_key', s.stage_key, 'name', s.name,
               'order_index', s.order_index, 'cnt', COALESCE(c.cnt, 0))
             ORDER BY s.order_index)
      FROM pipeline_stages s
      LEFT JOIN (SELECT stage_id, COUNT(*) cnt FROM base WHERE stage_id IS NOT NULL GROUP BY stage_id) c
             ON c.stage_id = s.id
      WHERE s.church_id = p_church_id AND s.is_active
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION get_people_stage_counts(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_people_stage_counts(uuid,text,boolean) TO authenticated;

-- ── 5. get_care_status_counts por unidade ────────────────────────────────────
DROP FUNCTION IF EXISTS get_care_status_counts(uuid);

CREATE OR REPLACE FUNCTION get_care_status_counts(
  p_church_id uuid, p_unit_id text DEFAULT NULL, p_apply_cutoff boolean DEFAULT TRUE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_cutoff date;
  v_result jsonb;
BEGIN
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  WITH base AS (
    SELECT p.id, p.created_at
    FROM people p
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id, p_apply_cutoff)
  ),
  contacted AS (
    SELECT DISTINCT pj.person_id
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'
  )
  SELECT jsonb_build_object(
    'nao_atendida',    (SELECT COUNT(*) FROM base b WHERE NOT EXISTS (
                          SELECT 1 FROM acolhimento_journey aj WHERE aj.person_id = b.id AND aj.church_id = p_church_id)),
    'em_atendimento',  (SELECT COUNT(*) FROM base b WHERE EXISTS (
                          SELECT 1 FROM acolhimento_journey aj WHERE aj.person_id = b.id AND aj.church_id = p_church_id AND aj.status = 'pending')),
    'atendida',        (SELECT COUNT(*) FROM base b WHERE EXISTS (SELECT 1 FROM contacted c WHERE c.person_id = b.id)),
    'sem_contato_48h', (SELECT COUNT(*) FROM base b WHERE b.created_at <= NOW() - INTERVAL '48 hours'
                          AND NOT EXISTS (SELECT 1 FROM contacted c WHERE c.person_id = b.id))
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION get_care_status_counts(uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_care_status_counts(uuid,text,boolean) TO authenticated;
