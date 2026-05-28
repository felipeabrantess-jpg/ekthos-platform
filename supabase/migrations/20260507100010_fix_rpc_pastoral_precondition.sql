-- ============================================================
-- Frente 3A — Migration 10 (numerada como 100010)
-- FIX: upsert_church_onboarding_pastoral — adiciona pré-condição
-- Bug (IMP-02 code review): Etapa 2 permitia transição direta
-- de 'pending' → 'completed', bypassing Etapa 1.
-- Fix: valida onboarding_step IN ('pastoral', 'completed') antes de executar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_church_onboarding_pastoral(
  p_church_id    uuid,
  p_pastoral_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_estilo_comunicacao         text;
  v_onboarding_completed_at    timestamptz;
  v_current_step               text;
BEGIN
  -- Guard: ekthos admin OU 4 roles autorizados
  IF NOT (
    is_ekthos_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = p_church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  ) THEN
    RAISE EXCEPTION 'permission_denied: not authorized for church %', p_church_id;
  END IF;

  -- Valida existência + lê step atual
  SELECT onboarding_step INTO v_current_step
    FROM public.churches
   WHERE id = p_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found: church % does not exist', p_church_id;
  END IF;

  -- Pré-condição: Etapa 1 deve ter sido concluída (step = 'pastoral' ou já 'completed')
  -- Impede bypass da Etapa 1 (IMP-02 code review)
  IF v_current_step NOT IN ('pastoral', 'completed') THEN
    RAISE EXCEPTION 'precondition_failed: Etapa 1 não concluída — onboarding_step atual é "%" (requerido: pastoral ou completed)', v_current_step;
  END IF;

  -- Valida estilo_comunicacao se fornecido
  v_estilo_comunicacao := NULLIF(TRIM(p_pastoral_data->>'estilo_comunicacao'), '');
  IF v_estilo_comunicacao IS NOT NULL
     AND v_estilo_comunicacao NOT IN ('formal', 'casual', 'intermediario') THEN
    RAISE EXCEPTION 'validation_error: estilo_comunicacao must be formal, casual or intermediario, got "%"', v_estilo_comunicacao;
  END IF;

  -- 1. UPSERT church_pastoral_profile
  INSERT INTO public.church_pastoral_profile (
    church_id,
    estilo_comunicacao,
    horarios_culto,
    maior_desafio,
    foco_pastoral_30_dias,
    algo_importante_comunidade
  ) VALUES (
    p_church_id,
    v_estilo_comunicacao,
    NULLIF(TRIM(p_pastoral_data->>'horarios_culto'), ''),
    NULLIF(TRIM(p_pastoral_data->>'maior_desafio'), ''),
    NULLIF(TRIM(p_pastoral_data->>'foco_pastoral_30_dias'), ''),
    NULLIF(TRIM(p_pastoral_data->>'algo_importante_comunidade'), '')
  )
  ON CONFLICT (church_id) DO UPDATE SET
    estilo_comunicacao          = EXCLUDED.estilo_comunicacao,
    horarios_culto              = EXCLUDED.horarios_culto,
    maior_desafio               = EXCLUDED.maior_desafio,
    foco_pastoral_30_dias       = EXCLUDED.foco_pastoral_30_dias,
    algo_importante_comunidade  = EXCLUDED.algo_importante_comunidade,
    updated_at                  = now();

  -- 2. UPDATE churches: step → 'completed', completed_at preserva primeiro timestamp
  UPDATE public.churches SET
    onboarding_step         = 'completed',
    onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
    updated_at              = now()
  WHERE id = p_church_id
  RETURNING onboarding_completed_at INTO v_onboarding_completed_at;

  RETURN jsonb_build_object(
    'success',              true,
    'church_id',            p_church_id,
    'onboarding_step',      'completed',
    'onboarding_completed_at', v_onboarding_completed_at,
    'pastoral_data', jsonb_build_object(
      'estilo_comunicacao',         v_estilo_comunicacao,
      'horarios_culto',             NULLIF(TRIM(p_pastoral_data->>'horarios_culto'), ''),
      'maior_desafio',              NULLIF(TRIM(p_pastoral_data->>'maior_desafio'), ''),
      'foco_pastoral_30_dias',      NULLIF(TRIM(p_pastoral_data->>'foco_pastoral_30_dias'), ''),
      'algo_importante_comunidade', NULLIF(TRIM(p_pastoral_data->>'algo_importante_comunidade'), '')
    )
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_church_onboarding_pastoral(uuid, jsonb)
  IS 'Etapa 2 do wizard: UPSERT church_pastoral_profile + onboarding_step → completed. Pré-condição: step deve ser pastoral ou completed (IMP-02 fix). (Frente 3A, Decisão 110-111)';
