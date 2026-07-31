-- journey_advance: ao avançar etapa, zera next_step_due_at e next_step
-- para que a pessoa saia da categoria "overdue" imediatamente na v_care_queue
CREATE OR REPLACE FUNCTION public.journey_advance(
  p_journey_id       uuid,
  p_expected_version integer,
  p_new_stage_id     uuid,
  p_note             text DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cur        person_journey;
  v_new        person_journey;
  v_prev       UUID;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_prev       := v_cur.stage_id;
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    stage_id         = p_new_stage_id,
    next_step_due_at = NULL,
    next_step        = NULL,
    version          = version + 1,
    updated_at       = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'stage_advance',
    v_actor_id,
    v_actor_type,
    jsonb_build_object(
      'from_stage_id', v_prev,
      'to_stage_id',   p_new_stage_id,
      'note',          p_note
    )
  );

  RETURN v_new;
END;
$$;
