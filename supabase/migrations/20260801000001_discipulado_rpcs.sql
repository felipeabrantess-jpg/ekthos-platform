-- E1: Visão geral do caminho de discipulado por etapa
-- Retorna uma linha por etapa ativa: totais, entraram, avançaram, parados
-- SECURITY DEFINER + tenant guard: somente o usuário da própria igreja pode chamar

CREATE OR REPLACE FUNCTION public.get_discipulado_overview(
  p_church_id   uuid,
  p_period_days integer DEFAULT 30
)
RETURNS TABLE (
  stage_id    uuid,
  stage_name  text,
  order_index integer,
  total       bigint,
  entraram    bigint,
  avancaram   bigint,
  parados     bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Tenant guard
  IF (SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid) != p_church_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH active_pp AS (
    -- Apenas pessoas ativas (não excluídas, não saíram) com pipeline
    SELECT pp.stage_id, pp.entered_at
    FROM person_pipeline pp
    JOIN people pe ON pe.id = pp.person_id
    WHERE pp.church_id = p_church_id
      AND pe.church_id = p_church_id
      AND pe.deleted_at IS NULL
      AND pe.left_at    IS NULL
  ),
  advances AS (
    -- Avançaram: eventos stage_advance no período, agrupado por etapa de origem
    SELECT (je.payload ->> 'from_stage_id')::uuid AS from_stage_id,
           COUNT(DISTINCT je.journey_id)           AS cnt
    FROM journey_events je
    WHERE je.church_id   = p_church_id
      AND je.event_type  = 'stage_advance'
      AND je.created_at >= NOW() - (p_period_days || ' days')::interval
    GROUP BY 1
  )
  SELECT
    ps.id,
    ps.name::text,
    ps.order_index,
    COUNT(ap.stage_id),
    COUNT(ap.stage_id) FILTER (
      WHERE ap.entered_at >= NOW() - (p_period_days || ' days')::interval
    ),
    COALESCE(adv.cnt, 0),
    COUNT(ap.stage_id) FILTER (
      WHERE ap.entered_at <= NOW() - (COALESCE(ps.sla_hours, 720) || ' hours')::interval
    )
  FROM pipeline_stages ps
  LEFT JOIN active_pp ap  ON ap.stage_id      = ps.id
  LEFT JOIN advances  adv ON adv.from_stage_id = ps.id
  WHERE ps.church_id = p_church_id
    AND ps.is_active = true
  GROUP BY ps.id, ps.name, ps.order_index, adv.cnt
  ORDER BY ps.order_index;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_discipulado_overview(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_discipulado_overview(uuid, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_discipulado_overview(uuid, integer) TO authenticated;


-- E2: Pessoas de uma etapa específica, com paginação e busca
-- Retorna: nome, telefone, dias na etapa, responsável, se está atrasado
-- Ordenado por mais tempo parado primeiro (entered_at ASC)

CREATE OR REPLACE FUNCTION public.get_discipulado_stage_people(
  p_church_id uuid,
  p_stage_id  uuid,
  p_limit     integer DEFAULT 50,
  p_offset    integer DEFAULT 0,
  p_search    text    DEFAULT NULL
)
RETURNS TABLE (
  person_id     uuid,
  nome          text,
  telefone      text,
  dias_na_etapa integer,
  responsavel   text,
  atrasado      boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Tenant guard
  IF (SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid) != p_church_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY
  SELECT
    pe.id,
    pe.name::text,
    pe.phone::text,
    EXTRACT(DAY FROM NOW() - pp.entered_at)::integer,
    COALESCE(
      au.raw_user_meta_data ->> 'full_name',
      au.email
    )::text,
    (pp.entered_at <= NOW() - (COALESCE(ps.sla_hours, 720) || ' hours')::interval)
  FROM person_pipeline pp
  JOIN people pe ON pe.id = pp.person_id
    AND pe.church_id  = p_church_id
    AND pe.deleted_at IS NULL
    AND pe.left_at    IS NULL
  JOIN pipeline_stages ps ON ps.id = pp.stage_id
    AND ps.church_id = p_church_id
  LEFT JOIN LATERAL (
    SELECT pj.owner_id
    FROM person_journey pj
    WHERE pj.person_id = pe.id
      AND pj.church_id = p_church_id
      AND pj.closed_at IS NULL
    ORDER BY pj.opened_at DESC
    LIMIT 1
  ) aj ON TRUE
  LEFT JOIN auth.users au ON au.id = aj.owner_id
  WHERE pp.church_id = p_church_id
    AND pp.stage_id  = p_stage_id
    AND (
      p_search IS NULL
      OR pe.name  ILIKE '%' || p_search || '%'
      OR pe.phone ILIKE '%' || p_search || '%'
    )
  ORDER BY pp.entered_at ASC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_discipulado_stage_people(uuid, uuid, integer, integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_discipulado_stage_people(uuid, uuid, integer, integer, text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_discipulado_stage_people(uuid, uuid, integer, integer, text) TO authenticated;
