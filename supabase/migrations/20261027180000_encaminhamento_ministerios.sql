-- ============================================================
-- Item 15 (ata IGV 24/10) — encaminhamento para ministérios
--   1. Política "quem pode encaminhar", configurável pela administração da igreja (church_settings):
--        'lideres_e_admins' (PADRÃO: só líderes com conta vinculada e administração) | 'equipe_atendimento' | 'somente_lideres'
--      Líder = conta vinculada (ministries.leader_user_id) de algum ministério ativo da igreja.
--   2. can_refer_to_ministry(igreja): regra única, aplicada no banco em journey_register_attendance.
--   3. ministry_referral_decline: o líder/admin do ministério de destino recusa com motivo obrigatório;
--      a pessoa sai da fila e volta ao Atendimento; histórico preservado (evento ministry_referral_declined).
-- Nenhum encaminhamento existente é alterado; os 18 pendentes seguem na fila.
-- journey_register_attendance = produção de 27/10 (após #488) + só o bloco marcado (gerado por script).
-- Rollback: docs/rollbacks/20261027180000_encaminhamento_ministerios.rollback.sql
-- ============================================================

ALTER TABLE public.church_settings
  ADD COLUMN IF NOT EXISTS ministry_referral_policy text NOT NULL DEFAULT 'lideres_e_admins';
DO $$ BEGIN
  ALTER TABLE public.church_settings ADD CONSTRAINT church_settings_ministry_referral_policy_check
    CHECK (ministry_referral_policy IN ('equipe_atendimento', 'lideres_e_admins', 'somente_lideres'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.can_refer_to_ministry(p_church_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pol AS (
    SELECT COALESCE((SELECT cs.ministry_referral_policy FROM church_settings cs WHERE cs.church_id = p_church_id), 'lideres_e_admins') AS p
  ),
  quem AS (
    SELECT auth.uid() IS NOT NULL AND auth_church_id() IS NOT NULL AND p_church_id = auth_church_id() AS mesma_igreja,
           COALESCE(auth_user_role()::text, '') IN ('admin', 'admin_departments') AS admin,
           EXISTS (SELECT 1 FROM ministries m WHERE m.church_id = p_church_id AND m.is_active IS NOT FALSE AND m.leader_user_id = auth.uid()) AS lider
  )
  SELECT COALESCE(auth.role(), '') = 'service_role'
      OR (SELECT CASE pol.p
                   WHEN 'equipe_atendimento' THEN can_register_attendance(p_church_id)
                   WHEN 'lideres_e_admins'   THEN quem.mesma_igreja AND (quem.admin OR quem.lider)
                   WHEN 'somente_lideres'    THEN quem.mesma_igreja AND quem.lider
                   ELSE false
                 END
          FROM pol, quem)
$function$;
REVOKE ALL ON FUNCTION public.can_refer_to_ministry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_refer_to_ministry(uuid) TO authenticated, service_role;

-- Leitura para a tela: política atual e se o usuário logado pode encaminhar
CREATE OR REPLACE FUNCTION public.get_ministry_referral_policy()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'policy',    COALESCE((SELECT cs.ministry_referral_policy FROM church_settings cs WHERE cs.church_id = auth_church_id()), 'lideres_e_admins'),
    'can_refer', COALESCE(can_refer_to_ministry(auth_church_id()), false))
$function$;
REVOKE ALL ON FUNCTION public.get_ministry_referral_policy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ministry_referral_policy() TO authenticated, service_role;

-- Configuração: só administração (mesmo critério de set_ministerios_docs_url)
CREATE OR REPLACE FUNCTION public.set_ministry_referral_policy(p_policy text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church uuid := auth_church_id();
  v_admin  boolean;
BEGIN
  IF v_church IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'igreja não identificada';
  END IF;
  SELECT (ur.role IN ('admin', 'admin_departments')) INTO v_admin
  FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.church_id = v_church LIMIT 1;
  IF NOT COALESCE(v_admin, false) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'somente administração pode configurar quem encaminha';
  END IF;
  IF p_policy IS NULL OR p_policy NOT IN ('equipe_atendimento', 'lideres_e_admins', 'somente_lideres') THEN
    RAISE EXCEPTION 'INVALID_POLICY' USING ERRCODE = '22023';
  END IF;
  UPDATE church_settings SET ministry_referral_policy = p_policy, updated_at = now() WHERE church_id = v_church;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTINGS_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
  VALUES (v_church, 'church_settings', v_church, 'ministry_referral_policy_changed', 'human', auth.uid()::text,
          jsonb_build_object('policy', p_policy));
  RETURN p_policy;
END $function$;
REVOKE ALL ON FUNCTION public.set_ministry_referral_policy(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ministry_referral_policy(text) TO authenticated, service_role;

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
  -- Item 15 (ata IGV): encaminhar para ministério segue a política da igreja (can_refer_to_ministry)
  IF p_ministry_id IS NOT NULL AND NOT can_refer_to_ministry(v_person.church_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_REFERRAL: seu perfil não pode encaminhar para ministérios' USING ERRCODE = '42501';
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

-- Recusar encaminhamento: quem administra o ministério de destino (can_manage_ministry), motivo obrigatório
CREATE OR REPLACE FUNCTION public.ministry_referral_decline(p_journey_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor   uuid := auth.uid();
  v_journey person_journey%ROWTYPE;
  v_reason  text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_name    text;
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: informe o motivo da recusa' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_journey FROM person_journey WHERE id = p_journey_id FOR UPDATE;
  IF NOT FOUND OR v_journey.church_id IS DISTINCT FROM auth_church_id() THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_journey.ministry_id IS NULL OR v_journey.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'NO_PENDING_REFERRAL: não há encaminhamento pendente' USING ERRCODE = 'P0001';
  END IF;
  IF NOT can_manage_ministry(v_journey.ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão neste ministério' USING ERRCODE = '42501';
  END IF;
  SELECT name INTO v_name FROM ministries WHERE id = v_journey.ministry_id;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (v_journey.id, v_journey.church_id, 'ministry_referral_declined', v_actor, 'human',
          jsonb_build_object('ministry_id', v_journey.ministry_id, 'ministry_name', v_name, 'reason', v_reason));

  UPDATE person_journey SET ministry_id = NULL, version = version + 1, updated_at = now()
   WHERE id = v_journey.id RETURNING * INTO v_journey;

  RETURN jsonb_build_object('journey_id', v_journey.id, 'person_id', v_journey.person_id, 'version', v_journey.version);
END $function$;
REVOKE ALL ON FUNCTION public.ministry_referral_decline(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ministry_referral_decline(uuid, text) TO authenticated, service_role;
