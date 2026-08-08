-- Migration: 20260807000002_atendimento_v3
--
-- E3: journey_suggest_stage — adiciona sinais voltou_ao_culto + fez_connect,
--     corrige encoding dos textos de reason (eram Latin-1 no banco).
-- E5+E8: journey_register_attendance — novos params p_ministry_id + p_close_journey
--        fechar jornada automaticamente quando outcome fecha, registrar notificação.

-- ── 1. journey_suggest_stage (E3 + fix encoding) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.journey_suggest_stage(
  p_person_id uuid,
  p_context   jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church_id    uuid;
  v_total        int;
  v_target_idx   int;
  v_stage        record;
  v_reason       text;
BEGIN
  SELECT church_id INTO v_church_id FROM people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  SELECT COUNT(*) INTO v_total
  FROM pipeline_stages
  WHERE church_id = v_church_id AND is_active = true;

  IF v_total = 0 THEN RAISE EXCEPTION 'NO_STAGES_CONFIGURED'; END IF;

  v_target_idx := CASE
    WHEN (p_context->>'membro_outra_igreja')::boolean = true THEN v_total - 1
    WHEN (p_context->>'tem_batismo')::boolean         = true THEN GREATEST(0, v_total - 2)
    WHEN (p_context->>'quer_servir')::boolean         = true THEN GREATEST(0, v_total - 2)
    WHEN (p_context->>'fez_connect')::boolean         = true THEN LEAST(v_total - 1, 4)
    WHEN (p_context->>'quer_celula')::boolean         = true THEN GREATEST(0, v_total / 2)
    WHEN (p_context->>'quer_ser_membro')::boolean     = true THEN GREATEST(0, v_total / 2)
    WHEN (p_context->>'accepted_jesus')::boolean      = true THEN LEAST(1, v_total - 1)
    WHEN (p_context->>'voltou_ao_culto')::boolean     = true THEN LEAST(1, v_total - 1)
    ELSE 0
  END;

  v_reason := CASE
    WHEN (p_context->>'membro_outra_igreja')::boolean = true
      THEN 'Membro transferido — já tem maturidade espiritual comprovada'
    WHEN (p_context->>'tem_batismo')::boolean = true
      THEN 'Já foi batizado — indica avanço no discipulado'
    WHEN (p_context->>'quer_servir')::boolean = true
      THEN 'Quer servir — pronto para integrar equipe de voluntários'
    WHEN (p_context->>'fez_connect')::boolean = true
      THEN 'Fez o Connect — etapa de integração concluída'
    WHEN (p_context->>'quer_celula')::boolean = true
      THEN 'Quer participar de célula — avançando no discipulado'
    WHEN (p_context->>'quer_ser_membro')::boolean = true
      THEN 'Quer se tornar membro — comprometido com a igreja'
    WHEN (p_context->>'accepted_jesus')::boolean = true
      THEN 'Aceitou Jesus recentemente — início da jornada de fé'
    WHEN (p_context->>'voltou_ao_culto')::boolean = true
      THEN 'Voltou ao culto — oportunidade de reconciliação e acolhimento'
    ELSE 'Primeiro contato — início do acompanhamento'
  END;

  SELECT id, name, order_index INTO v_stage
  FROM pipeline_stages
  WHERE church_id = v_church_id AND is_active = true
  ORDER BY order_index ASC
  OFFSET LEAST(v_target_idx, v_total - 1)
  LIMIT 1;

  RETURN jsonb_build_object(
    'stage_id',    v_stage.id,
    'stage_name',  v_stage.name,
    'order_index', v_stage.order_index,
    'reason',      v_reason
  );
END;
$$;

-- ── 2. journey_register_attendance (E5 + E7 + E8) ─────────────────────────────
-- Novos params adicionados ao final (DEFAULT NULL — backward compatible):
--   p_ministry_id  uuid    — encaminhar para ministério; persiste na jornada
--   p_close_journey boolean — fechamento explícito; também auto-detectado por outcome

CREATE OR REPLACE FUNCTION public.journey_register_attendance(
  p_person_id        uuid,
  p_expected_version integer  DEFAULT NULL,
  p_people_updates   jsonb    DEFAULT '{}'::jsonb,
  p_contact_channel  text     DEFAULT 'presencial',
  p_contact_result   text     DEFAULT 'realizado',
  p_contact_notes    text     DEFAULT NULL,
  p_contact_date     timestamptz DEFAULT now(),
  p_new_stage_id     uuid     DEFAULT NULL,
  p_next_step        text     DEFAULT NULL,
  p_next_step_due_at date     DEFAULT NULL,
  p_ministry_id      uuid     DEFAULT NULL,
  p_close_journey    boolean  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_person          people%ROWTYPE;
  v_journey         person_journey%ROWTYPE;
  v_actor_id        uuid;
  v_prev_stage      uuid;
  v_has_stage_change boolean;
  v_should_close    boolean;
  v_leader_user_id  uuid;
  v_ministry_name   text;
  v_person_name     text;
BEGIN
  v_actor_id := auth.uid();

  -- Outcomes que encerram a jornada
  v_should_close := COALESCE(p_close_journey, FALSE)
                 OR p_contact_result IN ('nao_quer_contato', 'mudou_de_igreja');

  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  v_person_name := COALESCE(
    NULLIF(TRIM(COALESCE(v_person.first_name,'') || ' ' || COALESCE(v_person.last_name,'')), ''),
    v_person.name
  );

  -- 1. Atualiza campos da pessoa (nunca sobrescreve valor existente com vazio)
  UPDATE people SET
    neighborhood          = COALESCE(NULLIF(p_people_updates->>'neighborhood',''),          neighborhood),
    city                  = COALESCE(NULLIF(p_people_updates->>'city',''),                  city),
    como_conheceu         = COALESCE(NULLIF(p_people_updates->>'como_conheceu',''),         como_conheceu),
    phone                 = COALESCE(NULLIF(p_people_updates->>'phone',''),                 phone),
    marital_status        = COALESCE(NULLIF(p_people_updates->>'marital_status',''),        marital_status),
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
                                  next_step, next_step_due_at, ministry_id)
      VALUES (p_person_id, v_person.church_id, p_new_stage_id, v_actor_id, NOW(), 1,
              NULLIF(p_next_step,''), p_next_step_due_at, p_ministry_id)
      RETURNING * INTO v_journey;

      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'journey_opened', v_actor_id, 'human',
        jsonb_build_object('stage_id', p_new_stage_id, 'source', 'attendance_registration'));
    END IF;

  ELSE
    IF p_expected_version IS NOT NULL AND v_journey.version != p_expected_version THEN
      RAISE EXCEPTION 'JOURNEY_VERSION_CONFLICT';
    END IF;

    v_prev_stage      := v_journey.stage_id;
    v_has_stage_change := p_new_stage_id IS NOT NULL AND p_new_stage_id <> v_prev_stage;

    UPDATE person_journey SET
      stage_id         = COALESCE(p_new_stage_id, stage_id),
      owner_id         = CASE WHEN owner_id IS NULL THEN v_actor_id ELSE owner_id END,
      ministry_id      = COALESCE(p_ministry_id, ministry_id),
      next_step        = CASE WHEN NULLIF(p_next_step,'') IS NOT NULL THEN p_next_step ELSE next_step END,
      next_step_due_at = CASE
                           WHEN v_has_stage_change THEN p_next_step_due_at
                           WHEN p_next_step_due_at IS NOT NULL THEN p_next_step_due_at
                           ELSE next_step_due_at
                         END,
      closed_at        = CASE WHEN v_should_close THEN NOW() ELSE closed_at END,
      outcome          = CASE WHEN v_should_close THEN p_contact_result ELSE outcome END,
      version          = version + 1,
      updated_at       = NOW()
    WHERE id = v_journey.id
    RETURNING * INTO v_journey;

    IF v_has_stage_change THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'stage_advance', v_actor_id, 'human',
        jsonb_build_object(
          'from_stage_id', v_prev_stage,
          'to_stage_id',   p_new_stage_id,
          'source',        'attendance_registration'
        ));
    END IF;
  END IF;

  -- 3. Sincroniza Kanban (person_pipeline + people.pipeline_stage_id)
  IF p_new_stage_id IS NOT NULL AND v_journey.id IS NOT NULL THEN
    INSERT INTO person_pipeline (id, church_id, person_id, stage_id,
                                 entered_at, last_activity_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_person.church_id, p_person_id, p_new_stage_id,
            NOW(), NOW(), NOW(), NOW())
    ON CONFLICT (church_id, person_id)
    DO UPDATE SET
      stage_id         = EXCLUDED.stage_id,
      last_activity_at = NOW(),
      updated_at       = NOW();

    UPDATE people
    SET pipeline_stage_id = p_new_stage_id, updated_at = NOW()
    WHERE id = p_person_id;
  END IF;

  -- 4. Registra evento de contato pastoral
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

  -- 5. Encaminhamento para ministério — evento + notificação para o líder (E7)
  IF p_ministry_id IS NOT NULL AND v_journey.id IS NOT NULL THEN
    SELECT name INTO v_ministry_name FROM ministries WHERE id = p_ministry_id;

    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (v_journey.id, v_person.church_id, 'ministry_referral', v_actor_id, 'human',
      jsonb_build_object(
        'ministry_id',   p_ministry_id,
        'ministry_name', v_ministry_name
      ));

    -- Notificar o líder do ministério (se tiver e tiver conta)
    SELECT au.id INTO v_leader_user_id
    FROM ministries m
    JOIN people ldr ON ldr.id = m.leader_id
    JOIN auth.users au ON LOWER(TRIM(au.email)) = LOWER(TRIM(ldr.email))
    WHERE m.id = p_ministry_id
      AND ldr.email IS NOT NULL
    LIMIT 1;

    IF v_leader_user_id IS NOT NULL THEN
      INSERT INTO notifications (church_id, user_id, title, body, type, read, link, person_id)
      VALUES (
        v_person.church_id,
        v_leader_user_id,
        'Novo encaminhamento para o ministério',
        COALESCE(v_person_name, 'Uma pessoa') || ' foi encaminhada para ' || COALESCE(v_ministry_name, 'o seu ministério'),
        'ministry_referral',
        false,
        '/pessoas/' || p_person_id || '/atendimento',
        p_person_id
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'person_id',      p_person_id,
    'journey_id',     v_journey.id,
    'stage_id',       v_journey.stage_id,
    'version',        v_journey.version,
    'owner_id',       v_journey.owner_id,
    'journey_closed', v_should_close AND v_journey.id IS NOT NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.journey_suggest_stage(uuid, jsonb)                                                            FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.journey_suggest_stage(uuid, jsonb)                                                        TO authenticated;

REVOKE ALL ON FUNCTION public.journey_register_attendance(uuid,integer,jsonb,text,text,text,timestamptz,uuid,text,date,uuid,boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.journey_register_attendance(uuid,integer,jsonb,text,text,text,timestamptz,uuid,text,date,uuid,boolean) TO authenticated;

-- ── Fix: estender notifications_type_check para ministry_referral ────────────
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check,
  ADD  CONSTRAINT notifications_type_check
    CHECK (type = ANY (ARRAY['alert','info','warning','success','ministry_referral']));

-- ── C1: remover overload antigo de 10 params (substituído pela v12 acima) ─────
-- IF EXISTS: idempotente — em deploy fresh a v10 nunca existiu
DROP FUNCTION IF EXISTS public.journey_register_attendance(
  uuid, integer, jsonb, text, text, text, timestamptz, uuid, text, date
);
