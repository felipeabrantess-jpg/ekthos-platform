-- ============================================================
-- Ata IGV — item 19: auditoria do encaminhamento ao ministério.
--
-- O ator do encaminhamento JÁ é persistido (journey_events.actor_id, event_type='ministry_referral') e
-- aparece na Fila e no histórico do Atendimento. O que se perdia era o vínculo depois de
-- "Incluir no ministério": ministry_members não guardava quem encaminhou nem quando.
--
-- Esta migration é ADITIVA:
--   1. 4 colunas NULLABLE em ministry_members (sem default, sem backfill: linhas existentes ficam NULL —
--      nenhum histórico é inventado);
--   2. ministry_member_add: mesmas regras de antes; ao INSERIR, grava a origem a partir do evento de
--      encaminhamento mais recente daquela pessoa para aquele ministério (se existir) e quem incluiu;
--   3. get_ministry_member_origins(p_ministry_id): leitura da origem, protegida por can_manage_ministry.
-- Não altera RLS, get_ministry_members, a fila, journey_events nem volunteers.
-- ============================================================

ALTER TABLE public.ministry_members
  ADD COLUMN IF NOT EXISTS referred_by        uuid,          -- usuário que encaminhou (journey_events.actor_id)
  ADD COLUMN IF NOT EXISTS referred_at        timestamptz,   -- quando encaminhou
  ADD COLUMN IF NOT EXISTS referral_event_id  uuid,          -- journey_events.id do encaminhamento
  ADD COLUMN IF NOT EXISTS added_by           uuid;          -- usuário que incluiu no ministério

COMMENT ON COLUMN public.ministry_members.referred_by IS 'Item 19 (ata IGV): usuário que encaminhou a pessoa a este ministério; NULL = vínculo sem encaminhamento registrado.';

CREATE OR REPLACE FUNCTION public.ministry_member_add(p_ministry_id uuid, p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church uuid; v_inserted boolean;
  v_ev_id uuid; v_ev_actor uuid; v_ev_at timestamptz;
BEGIN
  IF NOT can_manage_ministry(p_ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'sem permissão para gerir este ministério';
  END IF;
  SELECT m.church_id INTO v_church FROM ministries m WHERE m.id = p_ministry_id AND m.is_active IS NOT FALSE;
  IF v_church IS NULL THEN RAISE EXCEPTION 'MINISTRY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM people p WHERE p.id = p_person_id AND p.church_id = v_church AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'PERSON_NOT_FOUND' USING ERRCODE = 'P0002', HINT = 'pessoa não pertence à igreja ou foi excluída';
  END IF;

  -- Origem: encaminhamento mais recente desta pessoa para ESTE ministério (pode não existir).
  SELECT je.id, je.actor_id, je.created_at
    INTO v_ev_id, v_ev_actor, v_ev_at
  FROM journey_events je
  JOIN person_journey pj ON pj.id = je.journey_id
  WHERE pj.person_id = p_person_id AND pj.church_id = v_church
    AND je.event_type = 'ministry_referral'
    AND je.payload->>'ministry_id' = p_ministry_id::text
  ORDER BY je.created_at DESC
  LIMIT 1;

  INSERT INTO ministry_members (church_id, ministry_id, person_id, role, referred_by, referred_at, referral_event_id, added_by)
  VALUES (v_church, p_ministry_id, p_person_id, 'membro', v_ev_actor, v_ev_at, v_ev_id, auth.uid())
  ON CONFLICT (ministry_id, person_id) DO NOTHING;
  v_inserted := FOUND;
  RETURN jsonb_build_object('ministry_id', p_ministry_id, 'person_id', p_person_id, 'inserted', v_inserted);
END $function$;

-- Leitura da origem dos membros de um ministério (só quem pode gerir o ministério).
CREATE OR REPLACE FUNCTION public.get_ministry_member_origins(p_ministry_id uuid)
 RETURNS TABLE(person_id uuid, referred_by_name text, referred_at timestamptz, added_by_name text, added_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT can_manage_ministry(p_ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'sem permissão para este ministério';
  END IF;
  RETURN QUERY
  SELECT mm.person_id,
         CASE WHEN mm.referred_by IS NULL THEN NULL ELSE COALESCE(rp.name, rp.display_name, 'Usuário removido') END,
         mm.referred_at,
         CASE WHEN mm.added_by IS NULL THEN NULL ELSE COALESCE(ap.name, ap.display_name, 'Usuário removido') END,
         mm.created_at
  FROM ministry_members mm
  LEFT JOIN profiles rp ON rp.user_id = mm.referred_by
  LEFT JOIN profiles ap ON ap.user_id = mm.added_by
  WHERE mm.ministry_id = p_ministry_id
    AND mm.church_id = auth_church_id();
END $function$;

REVOKE ALL ON FUNCTION public.get_ministry_member_origins(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministry_member_origins(uuid) TO authenticated, service_role;
