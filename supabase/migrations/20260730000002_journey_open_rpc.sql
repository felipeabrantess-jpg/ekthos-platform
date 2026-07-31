-- ============================================================
-- E2 — journey_open (7ª RPC de jornada)
-- Cria jornada pastoral para uma pessoa. Idempotente via
-- RAISE JOURNEY_ALREADY_OPEN se jornada ativa já existe.
--
-- SECURITY DEFINER — executa com privs do owner (postgres),
-- mas valida tenant via auth_church_id().
-- GRANT apenas para authenticated. REVOKE de anon/public.
-- ============================================================

CREATE OR REPLACE FUNCTION journey_open(
  p_person_id   UUID,
  p_stage_id    UUID,
  p_ministry_id UUID  DEFAULT NULL,
  p_next_step   TEXT  DEFAULT NULL,
  p_due_at      DATE  DEFAULT NULL,
  p_notes       TEXT  DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_church_id UUID;
  v_new       person_journey;
BEGIN
  v_church_id := auth_church_id();

  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  -- Valida pessoa pertence à church e não está deletada
  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id = p_person_id
      AND church_id = v_church_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'JOURNEY_PERSON_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  -- Impede duplicata de jornada ativa
  IF EXISTS (
    SELECT 1 FROM person_journey
    WHERE person_id = p_person_id
      AND church_id = v_church_id
      AND closed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'JOURNEY_ALREADY_OPEN'
      USING ERRCODE = 'P0001';
  END IF;

  -- Cria jornada; pipeline_id derivado do stage
  INSERT INTO person_journey (
    church_id,
    person_id,
    stage_id,
    pipeline_id,
    owner_id,
    ministry_id,
    version,
    next_step,
    next_step_due_at,
    notes,
    opened_at,
    agent_locked_at
  )
  SELECT
    v_church_id,
    p_person_id,
    p_stage_id,
    ps.pipeline_id,
    auth.uid(),
    p_ministry_id,
    1,
    p_next_step,
    p_due_at,
    p_notes,
    NOW(),
    NOW()  -- bloqueia agent-acolhimento em jornadas recém-abertas
  FROM pipeline_stages ps
  WHERE ps.id = p_stage_id
  RETURNING * INTO v_new;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNEY_STAGE_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO journey_events (
    journey_id, church_id, event_type, actor_id, actor_type, payload
  ) VALUES (
    v_new.id,
    v_church_id,
    'journey_open',
    auth.uid(),
    'human',
    jsonb_build_object(
      'stage_id',    p_stage_id,
      'ministry_id', p_ministry_id,
      'next_step',   p_next_step,
      'due_at',      p_due_at
    )
  );

  RETURN v_new;
END;
$$;

REVOKE EXECUTE ON FUNCTION journey_open FROM anon, public;
GRANT  EXECUTE ON FUNCTION journey_open TO authenticated;
