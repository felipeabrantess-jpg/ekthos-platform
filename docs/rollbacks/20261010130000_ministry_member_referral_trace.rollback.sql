-- Rollback da 20261010130000: restaura ministry_member_add à definição anterior e remove a leitura/colunas.
-- ATENÇÃO: descarta os dados de origem gravados depois da migration (referred_by/at/event_id, added_by).
DROP FUNCTION IF EXISTS public.get_ministry_member_origins(uuid);

CREATE OR REPLACE FUNCTION public.ministry_member_add(p_ministry_id uuid, p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_church uuid; v_inserted boolean;
BEGIN
  IF NOT can_manage_ministry(p_ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'sem permissão para gerir este ministério';
  END IF;
  SELECT m.church_id INTO v_church FROM ministries m WHERE m.id = p_ministry_id AND m.is_active IS NOT FALSE;
  IF v_church IS NULL THEN RAISE EXCEPTION 'MINISTRY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM people p WHERE p.id = p_person_id AND p.church_id = v_church AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'PERSON_NOT_FOUND' USING ERRCODE = 'P0002', HINT = 'pessoa não pertence à igreja ou foi excluída';
  END IF;
  INSERT INTO ministry_members (church_id, ministry_id, person_id, role)
  VALUES (v_church, p_ministry_id, p_person_id, 'membro')
  ON CONFLICT (ministry_id, person_id) DO NOTHING;
  v_inserted := FOUND;
  RETURN jsonb_build_object('ministry_id', p_ministry_id, 'person_id', p_person_id, 'inserted', v_inserted);
END $function$;

ALTER TABLE public.ministry_members
  DROP COLUMN IF EXISTS referred_by, DROP COLUMN IF EXISTS referred_at,
  DROP COLUMN IF EXISTS referral_event_id, DROP COLUMN IF EXISTS added_by;
