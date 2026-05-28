-- ============================================================
-- Frente 3A — Migration 5 (numerada como 100005)
-- RPC get_church_onboarding_state
-- Retorna estado atual do onboarding da igreja:
--   step, contractor_complete, pastoral_complete, blocked, completed_at
-- Guard: is_ekthos_admin() OU any role em user_roles para p_church_id
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_church_onboarding_state(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step                text;
  v_completed_at        timestamptz;
  v_contractor_complete boolean;
  v_pastoral_complete   boolean;
  v_blocked             boolean;
BEGIN
  -- Guard: ekthos admin OU membro da igreja
  IF NOT (
    is_ekthos_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = p_church_id
    )
  ) THEN
    RAISE EXCEPTION 'permission_denied: not authorized for church %', p_church_id;
  END IF;

  -- Lê onboarding_step e onboarding_completed_at da churches
  SELECT onboarding_step, onboarding_completed_at
    INTO v_step, v_completed_at
    FROM public.churches
   WHERE id = p_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: church % does not exist', p_church_id;
  END IF;

  -- contractor_complete: pelo menos 1 contractor ativo para a igreja
  SELECT EXISTS (
    SELECT 1 FROM public.contractors c
    WHERE c.church_id = p_church_id
      AND c.is_active  = true
  ) INTO v_contractor_complete;

  -- pastoral_complete: onboarding_step = 'completed'
  v_pastoral_complete := (v_step = 'completed');

  -- blocked: onboarding ainda não concluído
  v_blocked := NOT v_pastoral_complete;

  RETURN jsonb_build_object(
    'church_id',          p_church_id,
    'step',               v_step,
    'contractor_complete', v_contractor_complete,
    'pastoral_complete',   v_pastoral_complete,
    'blocked',             v_blocked,
    'completed_at',        v_completed_at
  );
END;
$$;

COMMENT ON FUNCTION public.get_church_onboarding_state(uuid)
  IS 'Retorna estado do onboarding da igreja: step, contractor_complete, pastoral_complete, blocked, completed_at (Frente 3A)';
