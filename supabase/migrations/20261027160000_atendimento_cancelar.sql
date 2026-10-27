-- ============================================================
-- Atendimento: ação explícita "Cancelar atendimento" (reunião IGV 26/10)
-- Regras centralizadas (uma fonte só, usada por todas as transições):
--   care_cancel_outcomes()          desfechos que significam CANCELADO (person_care_state e journey_register_attendance)
--   can_register_attendance(igreja) quem pode registrar/cancelar atendimento (mesma lista de perfis de antes)
-- journey_cancel: encerra o atendimento com motivo obrigatório ('nao_quer_contato' | 'mudou_de_igreja' | 'outro_motivo'),
--   registra responsável, data, motivo e observação (evento journey_cancelled), mantém cadastro e histórico.
--   "Não quer contato": cancela o acolhimento automático ainda não enviado (jornadas pending/processing e fila pending).
-- Reabrir continua sendo journey_reopen (motivo obrigatório) e NÃO reinicia o acolhimento automático.
-- person_care_state e journey_register_attendance = produção de 26/10 (após #485) + só as linhas marcadas (script).
-- Rollback: docs/rollbacks/20261027160000_atendimento_cancelar.rollback.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.care_cancel_outcomes()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$ SELECT ARRAY['nao_quer_contato', 'mudou_de_igreja', 'outro_motivo']::text[] $function$;
GRANT EXECUTE ON FUNCTION public.care_cancel_outcomes() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_register_attendance(p_church_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR (auth.uid() IS NOT NULL
          AND auth_church_id() IS NOT NULL
          AND p_church_id = auth_church_id()
          AND COALESCE(auth_user_role()::text, '') IN ('admin','admin_departments','pastor_celulas','supervisor','cell_leader','secretary'))
$function$;
REVOKE ALL ON FUNCTION public.can_register_attendance(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_register_attendance(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.person_care_state(p_person_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Em atendimento: jornada aberta com atividade HUMANA registrada.
    -- Só eventos actor_type = 'human' (CHECK do schema: human ⇒ actor_id NOT NULL).
    -- Eventos 'system'/'agent' (journey_advance/assign/close/transfer/update_next_step
    -- chamadas por service_role, journey_register_touch, agentes) NÃO colocam ninguém em atendimento.
    WHEN EXISTS (
      SELECT 1 FROM person_journey j
      WHERE j.person_id = p_person_id AND j.closed_at IS NULL
        AND EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = j.id AND e.actor_type = 'human'
                    -- ata IGV 26/10: só tentativa real ou encaminhamento; abrir jornada/salvar dados não é atendimento
                    AND e.event_type IN ('pastoral_contact', 'ministry_referral')))
      THEN 'em_atendimento'
    -- Encerrada: classifica pelo desfecho da última jornada encerrada
    WHEN EXISTS (SELECT 1 FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NOT NULL)
      THEN CASE
        WHEN (SELECT j.outcome FROM person_journey j
               WHERE j.person_id = p_person_id AND j.closed_at IS NOT NULL
               ORDER BY j.closed_at DESC LIMIT 1) = ANY (care_cancel_outcomes())   -- regra única de cancelamento
          THEN 'cancelado'
        ELSE 'atendida'
      END
    -- Sem jornada, ou só jornada aberta sem nenhum evento (legado de backfill)
    ELSE 'nao_atendida'
  END
$function$;

CREATE OR REPLACE FUNCTION public.journey_register_attendance(p_person_id uuid, p_expected_version integer DEFAULT NULL::integer, p_people_updates jsonb DEFAULT '{}'::jsonb, p_contact_channel text DEFAULT 'presencial'::text, p_contact_result text DEFAULT 'realizado'::text, p_contact_notes text DEFAULT NULL::text, p_contact_date timestamp with time zone DEFAULT now(), p_new_stage_id uuid DEFAULT NULL::uuid, p_next_step text DEFAULT NULL::text, p_next_step_due_at date DEFAULT NULL::date, p_ministry_id uuid DEFAULT NULL::uuid, p_close_journey boolean DEFAULT NULL::boolean, p_register_contact boolean DEFAULT true)
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
  PERFORM set_config('ekthos.pipeline_write', 'rpc', true);   -- Release 1: escrita de etapa autorizada por esta RPC

  -- Outcomes que encerram a jornada
  v_should_close := COALESCE(p_close_journey, FALSE)
                 OR p_contact_result = ANY (care_cancel_outcomes());   -- regra única de cancelamento

  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  -- ── Autorização (validada no banco; a tela não é barreira) ──────────────
  -- Permitido: service_role; ou usuário autenticado da MESMA igreja da pessoa
  -- (tenant efetivo, cobre impersonação) com perfil autorizado a atender.
  -- Negado: anon, outra igreja, perfil não listado (volunteer, ministry_leader, treasurer…).
  -- regra única de quem pode atender (can_register_attendance) — mesma lista de perfis de antes
  IF NOT can_register_attendance(v_person.church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão para registrar este atendimento' USING ERRCODE = '42501';
  END IF;

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
    -- ata IGV 26/10: "Não tentei" (sem contato, sem encaminhamento, sem encerramento) só salva os dados da pessoa
    IF p_new_stage_id IS NULL AND (COALESCE(p_register_contact, true) OR p_ministry_id IS NOT NULL OR COALESCE(p_close_journey, false)) THEN
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

  -- 4. Registra evento de contato pastoral — SOMENTE quando houve contato de fato
  --    (p_register_contact). Salvar correções sem contato não cria pastoral_contact
  --    nem avança a numeração. A sequência de contatos continua ilimitada.
  IF v_journey.id IS NOT NULL AND p_register_contact THEN
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
        '/ministerios?tab=fila',   -- abre a Fila de Encaminhamentos (a conta do líder não acessa o Atendimento)
        p_person_id
      );
    END IF;
  END IF;

  PERFORM set_config('ekthos.pipeline_write', '', true);
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

CREATE OR REPLACE FUNCTION public.journey_cancel(p_person_id uuid, p_reason text, p_notes text DEFAULT NULL::text, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor   uuid := auth.uid();
  v_person  people%ROWTYPE;
  v_journey person_journey%ROWTYPE;
  v_stage   uuid;
  v_notes   text := NULLIF(btrim(COALESCE(p_notes, '')), '');
  v_acolh   int := 0;
  v_fila    int := 0;
BEGIN
  IF p_reason IS NULL OR NOT (p_reason = ANY (care_cancel_outcomes())) THEN
    RAISE EXCEPTION 'REASON_REQUIRED: escolha o motivo do cancelamento' USING ERRCODE = '22023';
  END IF;
  IF p_reason = 'outro_motivo' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'NOTES_REQUIRED: descreva o motivo' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_person FROM people WHERE id = p_person_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  -- mesma regra de permissão do registro de atendimento (igreja do usuário + perfil autorizado)
  IF NOT can_register_attendance(v_person.church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão para cancelar este atendimento' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_journey FROM person_journey
   WHERE person_id = p_person_id AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    -- Sem atendimento aberto (ex.: "Não atendida"): abre e encerra no mesmo ato, na etapa atual da pessoa
    SELECT pp.stage_id INTO v_stage FROM person_pipeline pp WHERE pp.person_id = p_person_id AND pp.church_id = v_person.church_id LIMIT 1;
    IF v_stage IS NULL THEN
      SELECT ps.id INTO v_stage FROM pipeline_stages ps WHERE ps.church_id = v_person.church_id
       ORDER BY (ps.stage_key = 'visitante') DESC, ps.order_index LIMIT 1;
    END IF;
    IF v_stage IS NULL THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    INSERT INTO person_journey (person_id, church_id, stage_id, owner_id, version)
    VALUES (p_person_id, v_person.church_id, v_stage, v_actor, 1)
    RETURNING * INTO v_journey;
  ELSIF p_expected_version IS NOT NULL AND v_journey.version <> p_expected_version THEN
    RAISE EXCEPTION 'JOURNEY_VERSION_CONFLICT' USING ERRCODE = 'P0001';
  END IF;

  -- responsável, data, motivo e observação (histórico preservado)
  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (v_journey.id, v_person.church_id, 'journey_cancelled',
          v_actor, CASE WHEN v_actor IS NULL THEN 'system' ELSE 'human' END,
          jsonb_build_object('reason', p_reason, 'notes', v_notes, 'source', 'attendance_cancel'));

  UPDATE person_journey SET closed_at = NOW(), outcome = p_reason, version = version + 1, updated_at = NOW()
   WHERE id = v_journey.id RETURNING * INTO v_journey;

  -- "Não quer contato": nenhum envio automático de acolhimento ainda não realizado
  IF p_reason = 'nao_quer_contato' THEN
    UPDATE acolhimento_journey SET status = 'cancelled', cancelled_reason = 'atendimento_cancelado_nao_quer_contato', updated_at = NOW()
     WHERE person_id = p_person_id AND church_id = v_person.church_id AND status IN ('pending', 'processing');
    GET DIAGNOSTICS v_acolh = ROW_COUNT;
    UPDATE channel_dispatch_queue q SET status = 'failed', error_message = 'cancelado: pessoa não quer contato (atendimento cancelado)', processed_at = NOW()
     WHERE q.church_id = v_person.church_id AND q.status = 'pending'
       AND q.conversation_id IN (SELECT c.id FROM conversations c WHERE c.person_id = p_person_id AND c.church_id = v_person.church_id);
    GET DIAGNOSTICS v_fila = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('journey_id', v_journey.id, 'person_id', p_person_id, 'outcome', v_journey.outcome,
    'care_state', person_care_state(p_person_id), 'acolhimento_cancelado', v_acolh, 'fila_cancelada', v_fila);
END;
$function$;
REVOKE ALL ON FUNCTION public.journey_cancel(uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_cancel(uuid, text, text, integer) TO authenticated, service_role;
