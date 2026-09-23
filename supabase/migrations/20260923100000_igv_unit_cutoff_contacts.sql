-- Ajustes /pessoas 23/09:
--  1. churches.unit_cutoff_date — pessoas cadastradas ANTES desta data são tratadas
--     como "sem unidade" nos contadores e filtros de /pessoas (unit_id NÃO é alterado).
--     Configuração por igreja é feita fora desta migration (UPDATE pontual).
--  2. get_unit_counts / get_people_page passam a respeitar o cutoff.
--  3. get_people_page: busca por nome insensível a acento/caixa via name_sort.
--  4. get_contact_counts — nº de contatos pastorais por pessoa (coluna na tabela).
--
-- Rollback:
--   ALTER TABLE churches DROP COLUMN unit_cutoff_date;
--   DROP FUNCTION get_contact_counts(uuid, uuid[]);
--   reaplicar get_unit_counts (20260910000001) e get_people_page (20260909120000).

ALTER TABLE churches ADD COLUMN IF NOT EXISTS unit_cutoff_date date;

-- ── get_unit_counts: unidade efetiva = NULL quando created_at < cutoff ────────
CREATE OR REPLACE FUNCTION get_unit_counts(p_church_id uuid)
RETURNS TABLE (unit_id uuid, person_stage text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT
    CASE WHEN c.unit_cutoff_date IS NULL OR p.created_at::date >= c.unit_cutoff_date
         THEN p.unit_id ELSE NULL END AS unit_id,
    p.person_stage,
    COUNT(*) AS cnt
  FROM people p
  JOIN churches c ON c.id = p.church_id
  WHERE p.church_id = p_church_id
    AND p.deleted_at IS NULL
  GROUP BY 1, 2;
$$;
REVOKE ALL ON FUNCTION get_unit_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_unit_counts(uuid) TO authenticated;

-- ── get_people_page: cutoff no filtro de unidade + busca sem acento ───────────
CREATE OR REPLACE FUNCTION get_people_page(
  p_church_id     uuid,
  p_care_status   text    DEFAULT NULL,
  p_unit_id       text    DEFAULT NULL,
  p_stage         text    DEFAULT NULL,
  p_source        text    DEFAULT NULL,
  p_search        text    DEFAULT NULL,
  p_date_from     date    DEFAULT NULL,
  p_date_to       date    DEFAULT NULL,
  p_limit         int     DEFAULT 50,
  p_offset        int     DEFAULT 0,
  p_created_from  date    DEFAULT NULL,
  p_created_to    date    DEFAULT NULL
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
    SELECT p.id
    FROM people p
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND (p_unit_id IS NULL
           OR (p_unit_id = 'none'
               AND (p.unit_id IS NULL OR (v_cutoff IS NOT NULL AND p.created_at::date < v_cutoff)))
           OR (p_unit_id <> 'none'
               AND p.unit_id = p_unit_id::uuid
               AND (v_cutoff IS NULL OR p.created_at::date >= v_cutoff)))
      AND (p_stage IS NULL OR p.person_stage::text = p_stage)
      AND (p_source IS NULL OR p.source::text = p_source)
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
    ORDER BY p.created_at DESC, p.id DESC
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
REVOKE ALL ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date) TO authenticated;

-- ── get_contact_counts: contatos pastorais por pessoa (ids da página, ≤ 500) ──
CREATE OR REPLACE FUNCTION get_contact_counts(p_church_id uuid, p_person_ids uuid[])
RETURNS TABLE (person_id uuid, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT pj.person_id, COUNT(*) AS cnt
  FROM journey_events je
  JOIN person_journey pj ON pj.id = je.journey_id
  WHERE pj.church_id = p_church_id
    AND je.event_type = 'pastoral_contact'
    AND pj.person_id = ANY(p_person_ids)
  GROUP BY pj.person_id;
$$;
REVOKE ALL ON FUNCTION get_contact_counts(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_contact_counts(uuid, uuid[]) TO authenticated;
