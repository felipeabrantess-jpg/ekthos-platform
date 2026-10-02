-- ============================================================
-- Itens 10 + 13 + reabertura de atendimento (ata IGV)
--
-- 1. person_care_state(): UMA fonte do estado operacional humano, derivada de person_journey:
--      em_atendimento = jornada humana aberta (com ou sem contato);
--      nao_atendida   = nunca teve jornada humana;
--      cancelado      = última jornada encerrada com desfecho negativo (nao_quer_contato, mudou_de_igreja);
--      atendida       = última jornada encerrada com qualquer outro desfecho.
--    Os quatro são mutuamente exclusivos e somam o total elegível. acolhimento_journey (agente)
--    deixa de definir esses estados — a tabela e o agente NÃO são alterados.
-- 2. get_care_status_counts / get_people_page: contador, filtro e etiqueta usam a mesma regra
--    (row_data ganha 'care_state'). 'sem_contato_48h' continua como estava.
-- 3. journey_register_attendance: novo parâmetro p_register_contact (default true = compatível
--    com todos os chamadores atuais). Com false: salva correções, etapa, encaminhamento e
--    próximo passo, mas NÃO cria pastoral_contact. Única alteração: condição do bloco 4.
--    A assinatura muda, por isso a versão anterior é removida (evita duas sobrecargas).
-- 4. journey_reopen(): reabre atendimento encerrado com motivo obrigatório, sem apagar nada,
--    registrando journey_reopened (quem, quando, motivo, desfecho e encerramento anteriores).
-- 5. get_person_timeline: mostra "Atendimento reaberto — Motivo: …".
--
-- Nenhum dado é alterado. Item 11 (contatos ilimitados) intocado. Grants mantidos como estão
-- em produção (a dívida de segurança de journey_register_attendance permanece registrada).
-- ============================================================

-- ── 1. Estado operacional único ──────────────────────────────
CREATE OR REPLACE FUNCTION public.person_care_state(p_person_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NULL)
      THEN 'em_atendimento'
    WHEN NOT EXISTS (SELECT 1 FROM person_journey j WHERE j.person_id = p_person_id)
      THEN 'nao_atendida'
    WHEN (SELECT j.outcome FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NOT NULL
           ORDER BY j.closed_at DESC LIMIT 1) IN ('nao_quer_contato', 'mudou_de_igreja')
      THEN 'cancelado'
    ELSE 'atendida'
  END
$$;
GRANT EXECUTE ON FUNCTION public.person_care_state(uuid) TO authenticated, service_role;

-- ── 2. Contadores e lista com a mesma regra ──────────────────
CREATE OR REPLACE FUNCTION public.get_care_status_counts(p_church_id uuid, p_unit_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff date;
  v_result jsonb;
BEGIN
  PERFORM assert_church_access(p_church_id);
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  WITH base AS (
    SELECT p.id, p.created_at
    FROM people p
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id)
  ),
  contacted AS (
    SELECT DISTINCT pj.person_id
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'
  )
  -- Estado operacional ÚNICO por pessoa (person_care_state): os quatro são mutuamente
  -- exclusivos e somam o total elegível. acolhimento_journey (agente) não define mais o estado.
  SELECT jsonb_build_object(
    'nao_atendida',    (SELECT COUNT(*) FROM base b WHERE person_care_state(b.id) = 'nao_atendida'),
    'em_atendimento',  (SELECT COUNT(*) FROM base b WHERE person_care_state(b.id) = 'em_atendimento'),
    'atendida',        (SELECT COUNT(*) FROM base b WHERE person_care_state(b.id) = 'atendida'),
    'cancelado',       (SELECT COUNT(*) FROM base b WHERE person_care_state(b.id) = 'cancelado'),
    'total',           (SELECT COUNT(*) FROM base b),
    'sem_contato_48h', (SELECT COUNT(*) FROM base b WHERE b.created_at <= NOW() - INTERVAL '48 hours'
                          AND NOT EXISTS (SELECT 1 FROM contacted c WHERE c.person_id = b.id))
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_people_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer)
 RETURNS TABLE(row_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff date;
  v_search text;
BEGIN
  PERFORM assert_church_access(p_church_id);
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;
  v_search := NULLIF(extensions.unaccent(lower(trim(COALESCE(p_search, '')))), '');

  RETURN QUERY
  WITH filtered AS (
    SELECT p.id, p.created_at, p.birth_day, p.name_sort
    FROM people p
    LEFT JOIN person_pipeline pp ON pp.person_id = p.id
    LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id)
      AND (p_stage_key IS NULL
           OR (p_stage_key = '__none' AND pp.id IS NULL)
           OR ps.stage_key = p_stage_key)
      AND (p_stage IS NULL OR p.person_stage::text = p_stage)
      AND (p_source IS NULL OR p.source::text = p_source)
      AND (p_tag_id IS NULL OR EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p.id AND pt.tag_id = p_tag_id))
      AND (p_birth_month IS NULL OR p.birth_month = p_birth_month)
      AND (p_date_from IS NULL OR p.first_visit_date >= p_date_from)
      AND (p_date_to   IS NULL OR p.first_visit_date <= p_date_to)
      AND (p_created_from IS NULL OR p.created_at::date >= p_created_from)
      AND (p_created_to   IS NULL OR p.created_at::date <= p_created_to)
      AND (v_search IS NULL
           OR p.name_sort ILIKE '%' || v_search || '%'
           OR p.phone ILIKE '%' || v_search || '%'
           OR p.email ILIKE '%' || v_search || '%')
      AND (
        p_care_status IS NULL
        -- Mesma regra do contador e da etiqueta: estado operacional único (person_care_state)
        OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado')
              AND person_care_state(p.id) = p_care_status)
        OR (p_care_status = 'sem_contato_48h'
              AND p.created_at <= NOW() - INTERVAL '48 hours'
              AND NOT EXISTS (
                SELECT 1 FROM journey_events je
                JOIN person_journey pj ON pj.id = je.journey_id
                WHERE pj.person_id = p.id AND pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'))
      )
  ),
  total AS (SELECT COUNT(*) AS cnt FROM filtered),
  paged_ids AS (
    SELECT id FROM filtered
    ORDER BY
      CASE WHEN p_birth_month IS NOT NULL THEN birth_day END ASC NULLS LAST,
      CASE WHEN p_birth_month IS NOT NULL THEN name_sort END ASC,
      created_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (to_jsonb(p) || jsonb_build_object(
      'care_state', person_care_state(p.id),
      'acolhimento_journey', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id',aj.id,'status',aj.status,'updated_at',aj.updated_at,'started_at',aj.started_at))
         FROM acolhimento_journey aj WHERE aj.person_id = p.id), '[]'::jsonb),
      'person_pipeline', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
           'stage_id',pp.stage_id,'last_activity_at',pp.last_activity_at,'entered_at',pp.entered_at,
           'pipeline_stages',(SELECT to_jsonb(ps) FROM pipeline_stages ps WHERE ps.id = pp.stage_id)))
         FROM person_pipeline pp WHERE pp.person_id = p.id), '[]'::jsonb),
      'person_tags', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
           'tag_id',pt.tag_id,
           'tags',(SELECT to_jsonb(t) FROM tags t WHERE t.id = pt.tag_id)))
         FROM person_tags pt WHERE pt.person_id = p.id), '[]'::jsonb)
    )) AS row_data,
    (SELECT cnt FROM total) AS total_count
  FROM paged_ids pi
  JOIN people p ON p.id = pi.id
  ORDER BY
    CASE WHEN p_birth_month IS NOT NULL THEN p.birth_day END ASC NULLS LAST,
    CASE WHEN p_birth_month IS NOT NULL THEN p.name_sort END ASC,
    p.created_at DESC, p.id DESC;
END;
$function$;

-- ── 3. Salvar ≠ registrar contato ────────────────────────────
DROP FUNCTION IF EXISTS public.journey_register_attendance(uuid, integer, jsonb, text, text, text, timestamp with time zone, uuid, text, date, uuid, boolean);
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
GRANT EXECUTE ON FUNCTION public.journey_register_attendance(uuid, integer, jsonb, text, text, text, timestamp with time zone, uuid, text, date, uuid, boolean, boolean) TO authenticated, anon, service_role;

-- ── 4. Reabrir atendimento ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.journey_reopen(p_journey_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_church  uuid := auth_church_id();
  v_journey person_journey%ROWTYPE;
  v_reason  text := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF v_actor IS NULL OR v_church IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: usuário não autenticado' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'REASON_REQUIRED: informe o motivo da reabertura' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_journey FROM person_journey WHERE id = p_journey_id FOR UPDATE;
  IF NOT FOUND OR v_journey.church_id <> v_church THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND' USING ERRCODE = '42501';
  END IF;
  IF v_journey.closed_at IS NULL THEN
    RAISE EXCEPTION 'JOURNEY_NOT_CLOSED: este atendimento não está encerrado' USING ERRCODE = 'P0001';
  END IF;
  -- Só UM estado operacional por pessoa: não reabre se já houver outra jornada aberta
  IF EXISTS (SELECT 1 FROM person_journey j WHERE j.person_id = v_journey.person_id AND j.closed_at IS NULL) THEN
    RAISE EXCEPTION 'JOURNEY_ALREADY_OPEN: a pessoa já tem um atendimento em andamento' USING ERRCODE = 'P0001';
  END IF;

  -- Histórico preservado: o encerramento fica no evento que o produziu; aqui só o estado atual muda
  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (v_journey.id, v_journey.church_id, 'journey_reopened', v_actor, 'human',
    jsonb_build_object(
      'reason',             v_reason,
      'previous_outcome',   v_journey.outcome,
      'previous_closed_at', v_journey.closed_at,
      'source',             'attendance_reopen'
    ));

  UPDATE person_journey
     SET closed_at = NULL, outcome = NULL, version = version + 1, updated_at = NOW()
   WHERE id = v_journey.id
   RETURNING * INTO v_journey;

  RETURN jsonb_build_object('journey_id', v_journey.id, 'person_id', v_journey.person_id,
                            'version', v_journey.version, 'care_state', person_care_state(v_journey.person_id));
END;
$$;
REVOKE ALL ON FUNCTION public.journey_reopen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_reopen(uuid, text) TO authenticated, service_role;

-- ── 5. Timeline ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_person_timeline(p_person_id uuid, p_limit integer DEFAULT 50)
 RETURNS TABLE(event_at timestamp with time zone, source text, actor_type text, actor_name text, event_kind text, summary text, raw_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church_id uuid;
BEGIN
  v_church_id := auth_church_id();

  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id        = p_person_id
      AND church_id = v_church_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY

  -- ── 1. Journey events ─────────────────────────────────────────
  SELECT
    je.created_at                                                 AS event_at,
    'journey_event'::text                                         AS source,
    je.actor_type                                                 AS actor_type,

    -- C2: profiles tem prioridade sobre auth.users.raw_user_meta_data
    COALESCE(
      pr.name,
      pr.display_name,
      au.raw_user_meta_data ->> 'full_name',
      au.email,
      CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
    )::text                                                       AS actor_name,

    je.event_type                                                 AS event_kind,

    CASE je.event_type
      WHEN 'pastoral_contact' THEN
        COALESCE(
          NULLIF(je.payload ->> 'notes', ''),
          'Contato via ' || COALESCE(je.payload ->> 'channel', 'canal não informado')
        )
      WHEN 'stage_advance' THEN
        CONCAT(
          'Avançou para ',
          COALESCE(
            (SELECT name FROM pipeline_stages
             WHERE id = (je.payload ->> 'to_stage_id')::uuid LIMIT 1),
            'nova etapa'
          )
        )
      WHEN 'journey_opened' THEN 'Jornada de discipulado iniciada'
      WHEN 'journey_assign' THEN
        -- C2 também aqui: usa profiles para o responsável
        CONCAT(
          'Responsável: ',
          COALESCE(
            pr.name,
            pr.display_name,
            au.raw_user_meta_data ->> 'full_name',
            au.email,
            'atribuído'
          )
        )
      WHEN 'ministry_referral' THEN
        -- C1: nome do ministério via payload (preferido) ou JOIN
        CONCAT(
          'Encaminhado para ',
          COALESCE(
            je.payload ->> 'ministry_name',
            (SELECT m.name FROM ministries m
             WHERE m.id        = (je.payload ->> 'ministry_id')::uuid
               AND m.church_id = v_church_id
             LIMIT 1),
            'ministério'
          )
        )
      WHEN 'journey_reopened' THEN
        CONCAT('Atendimento reaberto — Motivo: ', COALESCE(NULLIF(je.payload ->> 'reason', ''), 'não informado'))
      ELSE je.event_type
    END::text                                                     AS summary,

    je.payload                                                    AS raw_payload

  FROM journey_events  je
  JOIN person_journey  pj ON pj.id       = je.journey_id
  LEFT JOIN auth.users au ON au.id       = je.actor_id
  LEFT JOIN profiles   pr ON pr.user_id  = je.actor_id   -- C2: join adicionado
  WHERE pj.person_id = p_person_id
    AND pj.church_id = v_church_id
    AND je.church_id = v_church_id

  UNION ALL

  -- ── 2. Mensagens de conversa WhatsApp ─────────────────────────
  SELECT
    cm.created_at                                                 AS event_at,
    'message'::text                                               AS source,
    CASE cm.sender_type
      WHEN 'contact'     THEN 'human'
      WHEN 'human_staff' THEN 'human'
      ELSE                    'agent'
    END::text                                                     AS actor_type,
    CASE cm.sender_type
      WHEN 'contact'     THEN 'Visitante'
      WHEN 'human_staff' THEN 'Equipe'
      WHEN 'agent'       THEN 'Agente de Acolhimento'
      ELSE                    'Sistema'
    END::text                                                     AS actor_name,
    'conversation_message'::text                                  AS event_kind,
    format_wa_content(cm.content)::text                           AS summary,
    jsonb_build_object(
      'direction',   cm.direction,
      'sender_type', cm.sender_type
    )                                                             AS raw_payload
  FROM conversation_messages cm
  JOIN conversations         c  ON c.id = cm.conversation_id
  WHERE c.person_id        = p_person_id
    AND c.church_id        = v_church_id
    AND cm.content_type    = 'text'
    AND cm.status         != 'failed'

  UNION ALL

  -- ── 3. Touchpoints de acolhimento enviados ────────────────────
  SELECT
    (tp ->> 'sent_at')::timestamptz                               AS event_at,
    'acolhimento'::text                                           AS source,
    'agent'::text                                                 AS actor_type,
    'Agente de Acolhimento'::text                                 AS actor_name,
    'touch_sent'::text                                            AS event_kind,
    CONCAT(
      'Toque ',
      COALESCE(tp ->> 'touchpoint', tp ->> 'touch_day', '?'),
      ' enviado'
    )::text                                                       AS summary,
    tp                                                            AS raw_payload
  FROM acolhimento_journey aj,
    jsonb_array_elements(COALESCE(aj.touchpoints_sent, '[]'::jsonb)) AS tp
  WHERE aj.person_id = p_person_id
    AND aj.church_id = v_church_id
    AND (tp ->> 'sent_at') IS NOT NULL

  ORDER BY event_at DESC NULLS LAST
  LIMIT p_limit;
END;
$function$;
