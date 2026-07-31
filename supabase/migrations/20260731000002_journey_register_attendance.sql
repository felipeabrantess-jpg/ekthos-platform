-- E3: Fase 3 — Atendimento Pastoral
-- Atualiza dados da pessoa + registra contato + abre/avança jornada em uma transação.
-- NÃO toca em care_contacts (read-only por contrato).

CREATE OR REPLACE FUNCTION public.journey_register_attendance(
  p_person_id        uuid,
  p_expected_version integer     DEFAULT NULL,
  p_people_updates   jsonb       DEFAULT '{}'::jsonb,
  p_contact_channel  text        DEFAULT 'presencial',
  p_contact_result   text        DEFAULT 'realizado',
  p_contact_notes    text        DEFAULT NULL,
  p_contact_date     timestamptz DEFAULT NOW(),
  p_new_stage_id     uuid        DEFAULT NULL,
  p_next_step        text        DEFAULT NULL,
  p_next_step_due_at date        DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person     people%ROWTYPE;
  v_journey    person_journey%ROWTYPE;
  v_actor_id   uuid;
  v_prev_stage uuid;
  v_has_change boolean;
BEGIN
  v_actor_id := auth.uid();

  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  -- 1. Atualiza campos seguros (nunca sobrescreve valor existente com vazio)
  UPDATE people SET
    neighborhood          = COALESCE(NULLIF(p_people_updates->>'neighborhood',''),          neighborhood),
    city                  = COALESCE(NULLIF(p_people_updates->>'city',''),                  city),
    como_conheceu         = COALESCE(NULLIF(p_people_updates->>'como_conheceu',''),         como_conheceu),
    phone                 = COALESCE(NULLIF(p_people_updates->>'phone',''),                 phone),
    observacoes_pastorais = COALESCE(NULLIF(p_people_updates->>'observacoes_pastorais',''), observacoes_pastorais),
    birth_date = CASE
      WHEN p_people_updates ? 'birth_date' AND NULLIF(p_people_updates->>'birth_date','') IS NOT NULL
        THEN (p_people_updates->>'birth_date')::date
      ELSE birth_date
    END,
    updated_at = NOW()
  WHERE id = p_person_id;

  -- 2. Localiza jornada ativa
  SELECT * INTO v_journey
  FROM person_journey
  WHERE person_id = p_person_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_new_stage_id IS NOT NULL THEN
      INSERT INTO person_journey (person_id, church_id, stage_id, owner_id, agent_locked_at, version,
                                  next_step, next_step_due_at)
      VALUES (p_person_id, v_person.church_id, p_new_stage_id, v_actor_id, NOW(), 1,
              NULLIF(p_next_step,''), p_next_step_due_at)
      RETURNING * INTO v_journey;

      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'journey_opened', v_actor_id, 'human',
        jsonb_build_object('stage_id', p_new_stage_id, 'source', 'attendance_registration'));
    END IF;

  ELSE
    IF p_expected_version IS NOT NULL AND v_journey.version != p_expected_version THEN
      RAISE EXCEPTION 'JOURNEY_VERSION_CONFLICT';
    END IF;

    v_prev_stage := v_journey.stage_id;
    v_has_change := p_new_stage_id IS NOT NULL AND p_new_stage_id <> v_prev_stage;

    UPDATE person_journey SET
      stage_id         = COALESCE(p_new_stage_id, stage_id),
      owner_id         = CASE WHEN owner_id IS NULL THEN v_actor_id ELSE owner_id END,
      next_step        = CASE WHEN NULLIF(p_next_step,'') IS NOT NULL THEN p_next_step ELSE next_step END,
      next_step_due_at = CASE
                           WHEN v_has_change THEN p_next_step_due_at
                           WHEN p_next_step_due_at IS NOT NULL THEN p_next_step_due_at
                           ELSE next_step_due_at
                         END,
      version          = version + 1,
      updated_at       = NOW()
    WHERE id = v_journey.id
    RETURNING * INTO v_journey;

    IF v_has_change THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'stage_advance', v_actor_id, 'human',
        jsonb_build_object(
          'from_stage_id', v_prev_stage,
          'to_stage_id',   p_new_stage_id,
          'source',        'attendance_registration'
        ));
    END IF;
  END IF;

  -- 3. Registra evento de contato pastoral (somente com jornada ativa)
  IF v_journey.id IS NOT NULL THEN
    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (v_journey.id, v_person.church_id, 'pastoral_contact', v_actor_id, 'human',
      jsonb_build_object(
        'channel',      p_contact_channel,
        'result',       p_contact_result,
        'notes',        p_contact_notes,
        'contact_date', p_contact_date
      ));
  END IF;

  RETURN jsonb_build_object(
    'person_id',  p_person_id,
    'journey_id', v_journey.id,
    'stage_id',   v_journey.stage_id,
    'version',    v_journey.version,
    'owner_id',   v_journey.owner_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.journey_register_attendance(uuid, integer, jsonb, text, text, text, timestamptz, uuid, text, date) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.journey_register_attendance(uuid, integer, jsonb, text, text, text, timestamptz, uuid, text, date) TO authenticated;
