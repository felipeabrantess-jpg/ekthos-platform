-- journey_advance: parâmetro opcional p_owner_id
-- Quando fornecido e a jornada não tem dono, atribui owner_id na mesma transação.
-- Resultado: "quem classifica, assume" — uma operação atômica, sem dois round-trips.
CREATE OR REPLACE FUNCTION public.journey_advance(
  p_journey_id       uuid,
  p_expected_version integer,
  p_new_stage_id     uuid,
  p_note             text DEFAULT NULL,
  p_owner_id         uuid DEFAULT NULL
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
  v_assigned   BOOLEAN := FALSE;
BEGIN
  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_prev       := v_cur.stage_id;
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    stage_id         = p_new_stage_id,
    -- Limpa prazo ao avançar (sai da categoria overdue)
    next_step_due_at = NULL,
    next_step        = NULL,
    -- Atribui dono se ainda não há e p_owner_id foi fornecido
    owner_id         = CASE
                         WHEN p_owner_id IS NOT NULL AND owner_id IS NULL
                         THEN p_owner_id
                         ELSE owner_id
                       END,
    version          = version + 1,
    updated_at       = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  v_assigned := (p_owner_id IS NOT NULL AND v_cur.owner_id IS NULL);

  -- Evento de avanço de etapa
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
      'note',          p_note,
      'auto_assigned', v_assigned
    )
  );

  -- Evento separado de atribuição quando ocorre auto-assign
  IF v_assigned THEN
    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (
      p_journey_id,
      v_cur.church_id,
      'owner_assigned',
      v_actor_id,
      v_actor_type,
      jsonb_build_object('owner_id', p_owner_id, 'source', 'stage_advance')
    );
  END IF;

  RETURN v_new;
END;
$$;
