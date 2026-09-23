-- PR 3 — Dashboard + Caminho de Discipulado por unidade
--
-- Regras: church_id = tenant; unidade = people.unit_id bruto (people_unit_scope_ok, sem corte);
-- classificação = person_pipeline ⟶ pipeline_stages.stage_key; contador e lista na mesma regra.
-- left_at: mantido exatamente como antes em cada RPC (auditoria separada em andamento).
--
-- 1. get_discipulado_overview(+p_unit_id, +stage_key)
-- 2. get_discipulado_stage_people(+p_unit_id, +total_count) — header do painel usa o mesmo total da lista
-- 3. get_dashboard_people_stats(church, unit) — todos os KPIs de pessoas do Dashboard numa RPC
--
-- Rollback: DROP FUNCTION get_dashboard_people_stats(uuid,text);
--           reaplicar get_discipulado_* de 20260801000001_discipulado_rpcs.sql

-- ── 1. overview por unidade ──────────────────────────────────────────────────
DROP FUNCTION IF EXISTS get_discipulado_overview(uuid, integer);

CREATE OR REPLACE FUNCTION get_discipulado_overview(
  p_church_id uuid, p_period_days integer DEFAULT 30, p_unit_id text DEFAULT NULL
)
RETURNS TABLE (
  stage_id uuid, stage_name text, stage_key text, order_index integer,
  total bigint, entraram bigint, avancaram bigint, parados bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid) != p_church_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH active_pp AS (
    SELECT pp.stage_id, pp.entered_at, pe.id AS person_id
    FROM person_pipeline pp
    JOIN people pe ON pe.id = pp.person_id
    WHERE pp.church_id = p_church_id
      AND pe.church_id = p_church_id
      AND pe.deleted_at IS NULL
      AND pe.left_at    IS NULL
      AND people_unit_scope_ok(pe.unit_id, pe.created_at, NULL, p_unit_id)
  ),
  advances AS (
    SELECT (je.payload ->> 'from_stage_id')::uuid AS from_stage_id,
           COUNT(DISTINCT je.journey_id) AS cnt
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    JOIN people pe ON pe.id = pj.person_id
    WHERE je.church_id = p_church_id
      AND je.event_type = 'stage_advance'
      AND je.created_at >= NOW() - (p_period_days || ' days')::interval
      AND people_unit_scope_ok(pe.unit_id, pe.created_at, NULL, p_unit_id)
    GROUP BY 1
  )
  SELECT
    ps.id, ps.name::text, ps.stage_key, ps.order_index,
    COUNT(ap.stage_id),
    COUNT(ap.stage_id) FILTER (WHERE ap.entered_at >= NOW() - (p_period_days || ' days')::interval),
    COALESCE(adv.cnt, 0),
    COUNT(ap.stage_id) FILTER (WHERE ap.entered_at <= NOW() - (COALESCE(ps.sla_hours, 720) || ' hours')::interval)
  FROM pipeline_stages ps
  LEFT JOIN active_pp ap  ON ap.stage_id       = ps.id
  LEFT JOIN advances  adv ON adv.from_stage_id = ps.id
  WHERE ps.church_id = p_church_id AND ps.is_active = true
  GROUP BY ps.id, ps.name, ps.stage_key, ps.order_index, adv.cnt
  ORDER BY ps.order_index;
END;
$$;
REVOKE ALL ON FUNCTION get_discipulado_overview(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_discipulado_overview(uuid,integer,text) TO authenticated;

-- ── 2. pessoas da etapa por unidade + total_count ────────────────────────────
DROP FUNCTION IF EXISTS get_discipulado_stage_people(uuid, uuid, integer, integer, text);

CREATE OR REPLACE FUNCTION get_discipulado_stage_people(
  p_church_id uuid, p_stage_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL, p_unit_id text DEFAULT NULL
)
RETURNS TABLE (
  person_id uuid, nome text, telefone text, dias_na_etapa integer,
  responsavel text, atrasado boolean, total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(extensions.unaccent(lower(trim(COALESCE(p_search, '')))), '');
BEGIN
  IF (SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid) != p_church_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT pe.id, pe.name, pe.phone, pp.entered_at, ps.sla_hours
    FROM person_pipeline pp
    JOIN people pe ON pe.id = pp.person_id
      AND pe.church_id = p_church_id AND pe.deleted_at IS NULL AND pe.left_at IS NULL
    JOIN pipeline_stages ps ON ps.id = pp.stage_id AND ps.church_id = p_church_id
    WHERE pp.church_id = p_church_id
      AND pp.stage_id  = p_stage_id
      AND people_unit_scope_ok(pe.unit_id, pe.created_at, NULL, p_unit_id)
      AND (v_search IS NULL
           OR pe.name_sort ILIKE '%' || v_search || '%'
           OR pe.phone ILIKE '%' || v_search || '%')
  ),
  total AS (SELECT COUNT(*) AS cnt FROM filtered)
  SELECT
    f.id, f.name::text, f.phone::text,
    EXTRACT(DAY FROM NOW() - f.entered_at)::integer,
    COALESCE(au.raw_user_meta_data ->> 'full_name', au.email)::text,
    (f.entered_at <= NOW() - (COALESCE(f.sla_hours, 720) || ' hours')::interval),
    (SELECT cnt FROM total)
  FROM filtered f
  LEFT JOIN LATERAL (
    SELECT pj.owner_id FROM person_journey pj
    WHERE pj.person_id = f.id AND pj.church_id = p_church_id AND pj.closed_at IS NULL
    ORDER BY pj.opened_at DESC LIMIT 1
  ) aj ON TRUE
  LEFT JOIN auth.users au ON au.id = aj.owner_id
  ORDER BY f.entered_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION get_discipulado_stage_people(uuid,uuid,integer,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_discipulado_stage_people(uuid,uuid,integer,integer,text,text) TO authenticated;

-- ── 3. KPIs de pessoas do Dashboard ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_dashboard_people_stats(p_church_id uuid, p_unit_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_result jsonb;
  v_q_start date := date_trunc('quarter', CURRENT_DATE)::date;
BEGIN
  WITH base AS (
    SELECT p.id, p.created_at, p.first_visit_date, p.baptized, p.baptism_date,
           p.last_contact_at, p.name, p.first_name, p.last_name, p.celula_id,
           ps.id AS stage_id, ps.stage_key, ps.name AS stage_name, ps.order_index,
           ps.sla_hours, pp.entered_at
    FROM people p
    LEFT JOIN person_pipeline pp ON pp.person_id = p.id
    LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, NULL, p_unit_id)
  ),
  contacted AS (
    SELECT DISTINCT pj.person_id
    FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id
    WHERE pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'
  ),
  recent90 AS (SELECT * FROM base WHERE created_at >= NOW() - INTERVAL '90 days'),
  grupos AS (
    SELECT g.id, g.name, g.status, g.created_at
    FROM groups g
    WHERE g.church_id = p_church_id
      AND (p_unit_id IS NULL OR (p_unit_id = 'none' AND g.unit_id IS NULL)
           OR (p_unit_id <> 'none' AND g.unit_id = p_unit_id::uuid))
  ),
  membros_celula AS (
    SELECT celula_id, COUNT(*) AS n FROM base WHERE celula_id IS NOT NULL GROUP BY celula_id
  )
  SELECT jsonb_build_object(
    'total',              (SELECT COUNT(*) FROM base),
    'sem_etapa',          (SELECT COUNT(*) FROM base WHERE stage_id IS NULL),
    'novos_semana',       (SELECT COUNT(*) FROM base WHERE created_at >= NOW() - INTERVAL '7 days'),
    'visitantes_30d',     (SELECT COUNT(*) FROM base WHERE stage_key = 'visitante'
                             AND (first_visit_date >= CURRENT_DATE - 30
                                  OR (first_visit_date IS NULL AND created_at >= NOW() - INTERVAL '30 days'))),
    'membros',            (SELECT COUNT(*) FROM base WHERE stage_key = 'membro'),
    'novos_convertidos',  (SELECT COUNT(*) FROM base WHERE stage_key = 'novo_convertido'),
    'novos_convertidos_30d', (SELECT COUNT(*) FROM base WHERE stage_key = 'novo_convertido'
                             AND entered_at >= NOW() - INTERVAL '30 days'),
    'escola_da_fe',       (SELECT COUNT(*) FROM base WHERE stage_key = 'escola_da_fe'),
    'batismos_trimestre', (SELECT COUNT(*) FROM base WHERE baptized AND baptism_date >= v_q_start),
    -- parados: pessoas com etapa cuja permanência excede o SLA da etapa
    'parados',            (SELECT COUNT(*) FROM base WHERE stage_id IS NOT NULL
                             AND entered_at <= NOW() - (COALESCE(sla_hours, 720) || ' hours')::interval),
    -- consolidação 90d: % dos cadastrados nos últimos 90 dias que estão numa etapa além de Visitante
    'consolidacao_90d',   (SELECT CASE WHEN COUNT(*) = 0 THEN 0
                             ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE stage_id IS NOT NULL AND stage_key <> 'visitante') / COUNT(*)) END
                           FROM recent90),
    'por_etapa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage_id', s.id, 'stage_key', s.stage_key, 'name', s.name,
                                          'order_index', s.order_index, 'cnt', COALESCE(c.cnt, 0))
                       ORDER BY s.order_index)
      FROM pipeline_stages s
      LEFT JOIN (SELECT stage_id, COUNT(*) cnt FROM base WHERE stage_id IS NOT NULL GROUP BY 1) c ON c.stage_id = s.id
      WHERE s.church_id = p_church_id AND s.is_active), '[]'::jsonb),
    'evolucao_12m', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
               'novos', (SELECT COUNT(*) FROM base b WHERE date_trunc('month', b.created_at) = m)) ORDER BY m)
      FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
                           date_trunc('month', CURRENT_DATE), '1 month') m), '[]'::jsonb),
    -- visitantes sem consolidação: etapa Visitante, cadastrado há mais de 24h, sem contato pastoral
    'visitantes_sem_consolidacao', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nome', COALESCE(NULLIF(trim(b.name), ''),
               trim(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')), 'Sem nome'), 'created_at', b.created_at)
               ORDER BY b.created_at)
      FROM (SELECT * FROM base WHERE stage_key = 'visitante' AND created_at < NOW() - INTERVAL '24 hours'
              AND id NOT IN (SELECT person_id FROM contacted) ORDER BY created_at LIMIT 20) b), '[]'::jsonb),
    -- membros ausentes: etapa Membro sem contato há mais de 14 dias
    'membros_ausentes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nome', COALESCE(NULLIF(trim(b.name), ''),
               trim(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')), 'Sem nome'),
               'etapa', b.stage_name, 'last_contact_at', b.last_contact_at) ORDER BY b.last_contact_at NULLS FIRST)
      FROM (SELECT * FROM base WHERE stage_key = 'membro'
              AND (last_contact_at IS NULL OR last_contact_at < NOW() - INTERVAL '14 days')
            ORDER BY last_contact_at NULLS FIRST LIMIT 10) b), '[]'::jsonb),
    'celulas_ativas',     (SELECT COUNT(*) FROM grupos WHERE status = 'active'),
    'celulas_total',      (SELECT COUNT(*) FROM grupos),
    'celulas_por_trimestre', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('periodo', 'Q' || EXTRACT(QUARTER FROM q) || '/' || EXTRACT(YEAR FROM q),
               'celulas', (SELECT COUNT(*) FROM grupos g WHERE date_trunc('quarter', g.created_at) = q)) ORDER BY q)
      FROM generate_series(date_trunc('quarter', CURRENT_DATE) - INTERVAL '9 months',
                           date_trunc('quarter', CURRENT_DATE), '3 months') q), '[]'::jsonb),
    'top_celulas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'membros', mc.n) ORDER BY mc.n DESC)
      FROM (SELECT * FROM membros_celula ORDER BY n DESC LIMIT 6) mc JOIN grupos g ON g.id = mc.celula_id), '[]'::jsonb),
    'celulas_em_alerta', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'membros', COALESCE(mc.n, 0)) ORDER BY COALESCE(mc.n, 0))
      FROM (SELECT g.* FROM grupos g LEFT JOIN membros_celula mc ON mc.celula_id = g.id
            WHERE COALESCE(mc.n, 0) < 3 ORDER BY COALESCE(mc.n, 0) LIMIT 5) g
      LEFT JOIN membros_celula mc ON mc.celula_id = g.id), '[]'::jsonb),
    'voluntarios_por_ministerio', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', m.name, 'total', v.n) ORDER BY v.n DESC)
      FROM (SELECT v.ministry_id, COUNT(*) n FROM volunteers v JOIN base b ON b.id = v.person_id
            WHERE v.church_id = p_church_id AND v.is_active GROUP BY 1 ORDER BY n DESC LIMIT 8) v
      JOIN ministries m ON m.id = v.ministry_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION get_dashboard_people_stats(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_people_stats(uuid,text) TO authenticated;
