-- Migration: 20260812000002_ministry_referral_queue_rpc
-- RPC: get_ministry_referrals — fila de encaminhamentos pendentes por ministério
--
-- Fonte dos dados:
--   person_journey.ministry_id    → ministério atual (último encaminhamento venceu)
--   journey_events(ministry_referral) → quando e quem encaminhou
--   people                        → nome e telefone da pessoa
--   pipeline_stages               → nome da etapa atual
--   profiles                      → nome de quem encaminhou (via actor_id)
--
-- "Não resolvido" = person_journey.ministry_id IS NOT NULL
--                   AND closed_at IS NULL
--                   AND pessoa NÃO está em ministry_members daquele ministério
--
-- Dívida conhecida: quando PR 3 criar estado de aceite/devolução,
--   a definição de "resolvido" muda — esta RPC precisará de revisão.
--
-- Escopo por papel:
--   admin / admin_departments → p_ministry_id filtra (null = todos)
--   ministry_leader           → p_ministry_id ignorado; escopo via is_ministry_leader_of()

DROP FUNCTION IF EXISTS public.get_ministry_referrals(uuid);

CREATE FUNCTION public.get_ministry_referrals(
  p_ministry_id uuid DEFAULT NULL
)
RETURNS TABLE (
  journey_id       uuid,
  journey_version  integer,
  person_id        uuid,
  person_name      text,
  person_phone     text,
  etapa_nome       text,
  ministry_id      uuid,
  ministry_name    text,
  encaminhado_em   timestamptz,
  encaminhado_por  text,
  dias_esperando   integer,
  anotacao         text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church_id  uuid;
  v_is_admin   boolean;
BEGIN
  v_church_id := auth_church_id();
  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: church_id não identificado';
  END IF;

  SELECT (ur.role IN ('admin', 'admin_departments'))
  INTO   v_is_admin
  FROM   user_roles ur
  WHERE  ur.user_id   = auth.uid()
    AND  ur.church_id = v_church_id
  LIMIT 1;

  -- NULL significa papel não encontrado (ex: ministry_leader sem linha em user_roles … improvável)
  v_is_admin := COALESCE(v_is_admin, false);

  RETURN QUERY
  SELECT
    pj.id                                              AS journey_id,
    pj.version                                         AS journey_version,
    pj.person_id,
    p.name                                             AS person_name,
    p.phone                                            AS person_phone,
    ps.name                                            AS etapa_nome,
    pj.ministry_id,
    m.name                                             AS ministry_name,
    ev.created_at                                      AS encaminhado_em,
    COALESCE(pr.name, pr.display_name, 'Sistema')      AS encaminhado_por,
    GREATEST(0,
      EXTRACT(DAY FROM NOW() - ev.created_at)::integer
    )                                                  AS dias_esperando,
    pj.notes                                           AS anotacao

  FROM person_journey pj
  JOIN people          p  ON  p.id  = pj.person_id
  JOIN ministries      m  ON  m.id  = pj.ministry_id
  LEFT JOIN pipeline_stages ps ON ps.id = pj.stage_id

  -- Evento de encaminhamento mais recente que gerou o ministry_id atual
  JOIN LATERAL (
    SELECT je.actor_id, je.created_at
    FROM   journey_events je
    WHERE  je.journey_id = pj.id
      AND  je.event_type = 'ministry_referral'
      AND  (je.payload->>'ministry_id')::uuid = pj.ministry_id
    ORDER  BY je.created_at DESC
    LIMIT  1
  ) ev ON true

  LEFT JOIN profiles pr ON pr.user_id = ev.actor_id

  WHERE pj.church_id  = v_church_id
    AND pj.ministry_id IS NOT NULL
    AND pj.closed_at   IS NULL
    -- Não resolvido: pessoa não está em ministry_members daquele ministério
    AND NOT EXISTS (
      SELECT 1
      FROM   ministry_members mm
      WHERE  mm.person_id   = pj.person_id
        AND  mm.ministry_id = pj.ministry_id
        AND  mm.church_id   = v_church_id
    )
    -- Escopo por papel
    AND CASE
      WHEN v_is_admin THEN
        -- admin: filtra por p_ministry_id se fornecido, senão todos
        (p_ministry_id IS NULL OR pj.ministry_id = p_ministry_id)
      ELSE
        -- ministry_leader: ignora p_ministry_id, usa escopo de liderança
        is_ministry_leader_of(pj.ministry_id)
    END

  ORDER BY ev.created_at ASC;  -- mais antigos primeiro (maior urgência)
END;
$$;

REVOKE ALL     ON FUNCTION public.get_ministry_referrals(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_ministry_referrals(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_ministry_referrals(uuid) TO authenticated;
