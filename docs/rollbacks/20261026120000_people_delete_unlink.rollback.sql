-- Rollback de 20261026120000_people_delete_unlink.sql
-- 1) Para de desfazer vínculos em exclusões futuras.
-- 2) Devolve get_ministry_referrals à versão de 20261005100000 (sem o filtro de pessoa excluída).
-- A tabela people_deletion_unlinks é MANTIDA de propósito: guarda o estado anterior das linhas já
-- alteradas. Para desfazer o que o trigger já fez, use o bloco "RESTAURAR" abaixo (revisar antes).
DROP TRIGGER IF EXISTS people_unlink_on_delete ON public.people;
DROP FUNCTION IF EXISTS public.people_unlink_on_delete();

-- ── 1. Fila de encaminhamentos ───────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ministry_referrals(p_ministry_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(journey_id uuid, journey_version integer, person_id uuid, person_name text, person_phone text, etapa_nome text, ministry_id uuid, ministry_name text, encaminhado_em timestamp with time zone, encaminhado_por text, dias_esperando integer, anotacao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Escopo pela autoridade canônica do ministério (can_manage_ministry):
    --   admin / admin_departments → todos os ministérios da igreja;
    --   conta vinculada em ministries.leader_user_id → só o(s) ministério(s) que administra;
    --   qualquer outro usuário → nada.
    -- Nunca por e-mail e nunca por leader_id (pessoa líder não é permissão de sistema).
    AND can_manage_ministry(pj.ministry_id)
    AND (p_ministry_id IS NULL OR pj.ministry_id = p_ministry_id)

  ORDER BY ev.created_at ASC;  -- mais antigos primeiro (maior urgência)
END;
$function$;

-- ── RESTAURAR (opcional; executar só com autorização, igreja e pessoa revisadas) ─────────────
-- ministry_members removidos:
--   INSERT INTO public.ministry_members SELECT (jsonb_populate_record(null::public.ministry_members, row_before)).*
--   FROM public.people_deletion_unlinks WHERE table_name = 'ministry_members' AND person_id = '<pessoa>' ON CONFLICT DO NOTHING;
-- liderança de ministério / célula:
--   UPDATE public.ministries m SET leader_id = (u.row_before->>'leader_id')::uuid FROM public.people_deletion_unlinks u
--    WHERE u.table_name = 'ministries' AND u.row_id = m.id AND u.person_id = '<pessoa>' AND m.leader_id IS NULL;
--   UPDATE public.groups g SET leader_id = (u.row_before->>'leader_id')::uuid FROM public.people_deletion_unlinks u
--    WHERE u.table_name = 'groups' AND u.action = 'clear_leader_id' AND u.row_id = g.id AND u.person_id = '<pessoa>' AND g.leader_id IS NULL;
--   UPDATE public.groups g SET co_leader_id = (u.row_before->>'co_leader_id')::uuid FROM public.people_deletion_unlinks u
--    WHERE u.table_name = 'groups' AND u.action = 'clear_co_leader_id' AND u.row_id = g.id AND u.person_id = '<pessoa>' AND g.co_leader_id IS NULL;
-- leaders / volunteers:
--   UPDATE public.leaders    SET is_active = true WHERE id IN (SELECT row_id FROM public.people_deletion_unlinks WHERE table_name = 'leaders'    AND person_id = '<pessoa>');
--   UPDATE public.volunteers SET is_active = true WHERE id IN (SELECT row_id FROM public.people_deletion_unlinks WHERE table_name = 'volunteers' AND person_id = '<pessoa>');
-- Remoção definitiva do registro (só depois de confirmar que não será preciso restaurar nada):
--   DROP TABLE public.people_deletion_unlinks;
