-- ============================================================
-- Item 15 da ata IGV — governança da fila de encaminhamentos dos Ministérios
--
-- Regra: quem gerencia a fila de um ministério é quem pode administrá-lo
-- (can_manage_ministry): admin / admin_departments (todos) ou a conta vinculada em
-- ministries.leader_user_id (só o próprio ministério). Nada de e-mail; leader_id
-- (pessoa líder) não é permissão de sistema.
--
-- O que muda (as duas funções partem das definições que estavam em produção):
--   1. get_ministry_referrals: o escopo deixa de usar is_ministry_leader_of (ponte por
--      e-mail) e passa a usar can_manage_ministry.
--   2. journey_register_attendance: SOMENTE o bloco que escolhe o destinatário da
--      notificação de encaminhamento — passa a ser ministries.leader_user_id.
--      Nenhuma outra linha da função foi alterada.
--
-- O que NÃO muda: ministry_members, volunteers, leader_id, person_journey,
-- journey_events, RLS, grants e o restante do Atendimento. Nenhum dado é alterado e
-- nenhum leader_user_id é criado. is_ministry_leader_of fica sem uso (não é removida aqui).
-- ============================================================

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

-- ── 2. Atendimento: destinatário da notificação de encaminhamento ──
CREATE OR REPLACE FUNCTION public.journey_register_attendance(p_person_id uuid, p_expected_version integer DEFAULT NULL::integer, p_people_updates jsonb DEFAULT '{}'::jsonb, p_contact_channel text DEFAULT 'presencial'::text, p_contact_result text DEFAULT 'realizado'::text, p_contact_notes text DEFAULT NULL::text, p_contact_date timestamp with time zone DEFAULT now(), p_new_stage_id uuid DEFAULT NULL::uuid, p_next_step text DEFAULT NULL::text, p_next_step_due_at date DEFAULT NULL::date, p_ministry_id uuid DEFAULT NULL::uuid, p_close_journey boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- Sem jornada aberta e sem etapa: não pode haver sucesso silencioso sem contato
    IF p_new_stage_id IS NULL THEN
      RAISE EXCEPTION 'JOURNEY_REQUIRED'
        USING ERRCODE = 'P0001',
              HINT = 'Pessoa sem jornada aberta: informe a etapa para abrir a jornada e registrar o contato';
    END IF;
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

    -- Notificar a conta vinculada ao ministério (ministries.leader_user_id).
    -- Sem conta vinculada = "sem conta de líder": ninguém é notificado.
    -- Não procura conta pelo e-mail da pessoa líder (leader_id).
    SELECT m.leader_user_id INTO v_leader_user_id
    FROM ministries m
    WHERE m.id = p_ministry_id
      AND m.church_id = v_person.church_id;

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
$function$;
