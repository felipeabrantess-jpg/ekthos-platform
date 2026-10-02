-- ============================================================
-- Regressão — itens 10 + 13 + reabertura (migration 20261006100000)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Pessoas sintéticas (ZZ-ATD).
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1, '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid adm,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY order_index LIMIT 1) stage,
       NULL::uuid p1, NULL::uuid p2, NULL::uuid p3, NULL::uuid j1;
GRANT ALL ON _r, _c TO authenticated;
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT count(*) FROM journey_events WHERE event_type = 'pastoral_contact') contatos,
       (SELECT count(*) FROM journey_events) eventos, (SELECT count(*) FROM person_journey) jornadas,
       (SELECT md5(string_agg(md5(a::text), '' ORDER BY a.id)) FROM acolhimento_journey a) acolhimento_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, closed_at, outcome, version FROM person_journey) x) jornadas_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, journey_id, event_type, payload, created_at FROM journey_events) x) eventos_md5;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-ATD Pessoa 1', 'manual' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-ATD Pessoa 2', 'manual' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c2, 'ZZ-ATD Outra Igreja', 'manual' FROM _c;
UPDATE _c SET p1 = (SELECT id FROM people WHERE name = 'ZZ-ATD Pessoa 1'), p2 = (SELECT id FROM people WHERE name = 'ZZ-ATD Pessoa 2'), p3 = (SELECT id FROM people WHERE name = 'ZZ-ATD Outra Igreja');

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;

-- ── ITEM 13: números NOVOS da IGV e exclusividade ───────────
DO $$
DECLARE c record; j jsonb; soma bigint; n_dup int; n_none int; n_base bigint;
BEGIN
  SELECT * INTO c FROM _c;
  j := get_care_status_counts(c.c1, NULL);
  soma := (j->>'nao_atendida')::bigint + (j->>'em_atendimento')::bigint + (j->>'atendida')::bigint + (j->>'cancelado')::bigint;
  INSERT INTO _r VALUES (13, 'IGV: Não atendida + Em atendimento + Atendida + Cancelado = total elegível',
    soma = (j->>'total')::bigint,
    format('nao_atendida=%s em_atendimento=%s atendida=%s cancelado=%s | soma=%s total=%s', j->>'nao_atendida', j->>'em_atendimento', j->>'atendida', j->>'cancelado', soma, j->>'total'));
  -- exclusividade: cada pessoa elegível tem exatamente um estado (a função devolve 1 valor); conferência explícita
  SELECT count(*) INTO n_base FROM people p WHERE p.church_id = c.c1 AND p.deleted_at IS NULL AND p.left_at IS NULL;
  SELECT count(*) INTO n_none FROM people p WHERE p.church_id = c.c1 AND p.deleted_at IS NULL AND p.left_at IS NULL
    AND person_care_state(p.id) NOT IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado');
  INSERT INTO _r VALUES (13, 'toda pessoa elegível cai em exatamente UM dos quatro estados', n_none = 0 AND n_base = (j->>'total')::bigint, n_base || ' pessoas elegíveis');
  -- contador = filtro (lista)
  INSERT INTO _r SELECT 13, 'contador = filtro da lista, para os quatro estados',
    bool_and(ok), string_agg(k || ':' || cnt, ' ')
    FROM (SELECT k, (SELECT max(total_count) FROM get_people_page(p_church_id => c.c1, p_care_status => k, p_limit => 1, p_offset => 0)) cnt,
                 (SELECT max(total_count) FROM get_people_page(p_church_id => c.c1, p_care_status => k, p_limit => 1, p_offset => 0)) = (j->>k)::bigint ok
            FROM unnest(ARRAY['nao_atendida','em_atendimento','atendida','cancelado']) k) x;
  -- etiqueta = mesma regra (row_data.care_state)
  INSERT INTO _r SELECT 13, 'etiqueta da lista (care_state) = mesma regra do filtro',
    bool_and(row_data->>'care_state' = 'em_atendimento'), count(*)::text || ' linhas conferidas'
    FROM get_people_page(p_church_id => c.c1, p_care_status => 'em_atendimento', p_limit => 50, p_offset => 0);
  INSERT INTO _r VALUES (13, 'jornada aberta sem contato = Em atendimento (regra definitiva)',
    (SELECT bool_and(person_care_state(j.person_id) = 'em_atendimento') FROM person_journey j JOIN people p ON p.id = j.person_id
      WHERE j.church_id = c.c1 AND j.closed_at IS NULL AND p.deleted_at IS NULL AND p.left_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = j.id AND e.event_type = 'pastoral_contact')),
    (SELECT count(*)::text || ' jornadas abertas sem contato' FROM person_journey j JOIN people p ON p.id = j.person_id
      WHERE j.church_id = c.c1 AND j.closed_at IS NULL AND p.deleted_at IS NULL AND p.left_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = j.id AND e.event_type = 'pastoral_contact')));
  INSERT INTO _r VALUES (13, 'histórico não define o estado: acolhimento_journey (agente) não entra mais na regra',
    (SELECT prosrc NOT ILIKE '%acolhimento_journey%' FROM pg_proc WHERE proname = 'person_care_state')
    AND (SELECT prosrc NOT ILIKE '%acolhimento_journey aj%' FROM pg_proc WHERE proname = 'get_care_status_counts'), NULL);
END $$;

-- ── ITEM 10: salvar ≠ registrar contato ─────────────────────
DO $$
DECLARE c record; n0 int; n1 int; j jsonb; r text;
BEGIN
  SELECT * INTO c FROM _c;
  INSERT INTO _r VALUES (10, 'pessoa nova: estado = Não atendida', person_care_state(c.p1) = 'nao_atendida', person_care_state(c.p1));
  -- salvar correção SEM contato (abre jornada com etapa, atualiza cidade) → zero pastoral_contact
  PERFORM journey_register_attendance(p_person_id => c.p1, p_new_stage_id => c.stage, p_register_contact => false,
    p_people_updates => jsonb_build_object('city', 'Niterói'), p_next_step => 'Ligar semana que vem');
  SELECT count(*) INTO n0 FROM get_person_contacts(c.p1);
  INSERT INTO _r VALUES (10, 'salvar correção sem contato → ZERO pastoral_contact; dados, etapa e próximo passo salvos',
    n0 = 0 AND (SELECT city = 'Niterói' FROM people WHERE id = c.p1)
    AND (SELECT stage_id = c.stage AND next_step = 'Ligar semana que vem' AND closed_at IS NULL FROM person_journey WHERE person_id = c.p1), n0 || ' contatos');
  INSERT INTO _r VALUES (13, 'jornada aberta sem contato → Em atendimento', person_care_state(c.p1) = 'em_atendimento', person_care_state(c.p1));
  -- registrar contato real → exatamente 1
  PERFORM journey_register_attendance(p_person_id => c.p1, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_notes => 'primeiro', p_register_contact => true);
  SELECT count(*) INTO n1 FROM get_person_contacts(c.p1);
  INSERT INTO _r VALUES (10, 'registrar contato real → exatamente 1 pastoral_contact (1º)', n1 = 1 AND (SELECT max(ordinal) FROM get_person_contacts(c.p1)) = 1, n1::text);
  -- salvar de novo sem intenção → não duplica
  PERFORM journey_register_attendance(p_person_id => c.p1, p_register_contact => false, p_people_updates => jsonb_build_object('neighborhood', 'Centro'));
  INSERT INTO _r VALUES (10, 'salvar novamente sem nova intenção → não duplica contato', (SELECT count(*) FROM get_person_contacts(c.p1)) = 1, NULL);
  -- compatibilidade: chamada sem o parâmetro novo continua registrando (default true)
  PERFORM journey_register_attendance(p_person_id => c.p1, p_contact_channel => 'ligacao', p_contact_result => 'sem_resposta');
  INSERT INTO _r VALUES (10, 'compatibilidade: chamador antigo (sem p_register_contact) continua registrando contato', (SELECT count(*) FROM get_person_contacts(c.p1)) = 2, NULL);
  -- item 11: ilimitado
  FOR n0 IN 3..9 LOOP
    PERFORM journey_register_attendance(p_person_id => c.p1, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_notes => 'n' || n0, p_register_contact => true);
  END LOOP;
  INSERT INTO _r VALUES (11, 'contatos continuam ilimitados (9 registrados, ordinais 1..9)', (SELECT string_agg(ordinal::text, ',' ORDER BY ordinal) FROM get_person_contacts(c.p1)) = '1,2,3,4,5,6,7,8,9', NULL);
  INSERT INTO _r VALUES (10, 'sobrecarga antiga removida (uma única journey_register_attendance)', (SELECT count(*) FROM pg_proc WHERE proname = 'journey_register_attendance') = 1, NULL);
END $$;

-- ── FINALIZAR e REABRIR ──────────────────────────────────────
DO $$
DECLARE c record; r text; j jsonb; ev0 int; ct0 int; v0 int; prev_closed timestamptz;
BEGIN
  SELECT * INTO c FROM _c;
  -- finalizar com desfecho negativo → Cancelado
  PERFORM journey_register_attendance(p_person_id => c.p1, p_contact_channel => 'whatsapp', p_contact_result => 'nao_quer_contato', p_register_contact => true);
  INSERT INTO _r VALUES (13, 'finalizar com "não quer contato" → estado Cancelado', person_care_state(c.p1) = 'cancelado', person_care_state(c.p1));
  SELECT id INTO c.j1 FROM person_journey WHERE person_id = c.p1;
  UPDATE _c SET j1 = c.j1;
  SELECT count(*) INTO ev0 FROM journey_events WHERE journey_id = c.j1;
  SELECT count(*) INTO ct0 FROM get_person_contacts(c.p1);
  SELECT version, closed_at INTO v0, prev_closed FROM person_journey WHERE id = c.j1;

  BEGIN PERFORM journey_reopen(c.j1, '   '); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (20, 'reabrir exige motivo (vazio → recusado, nada muda)', r LIKE 'REASON_REQUIRED%' AND (SELECT closed_at IS NOT NULL FROM person_journey WHERE id = c.j1), r);

  j := journey_reopen(c.j1, 'Encerrado por engano');
  INSERT INTO _r VALUES (20, 'reabrir: jornada volta a aberta (closed_at/outcome limpos, version +1)',
    (SELECT closed_at IS NULL AND outcome IS NULL AND version = v0 + 1 FROM person_journey WHERE id = c.j1) AND j->>'care_state' = 'em_atendimento', j::text);
  INSERT INTO _r VALUES (20, 'reabrir: pessoa volta IMEDIATAMENTE para Em atendimento', person_care_state(c.p1) = 'em_atendimento', NULL);
  INSERT INTO _r VALUES (20, 'reabrir: histórico preservado — evento journey_reopened com autor, hora, motivo, desfecho e encerramento anteriores; nenhum evento apagado',
    (SELECT count(*) FROM journey_events WHERE journey_id = c.j1) = ev0 + 1
    AND EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = c.j1 AND e.event_type = 'journey_reopened' AND e.actor_id = c.adm AND e.actor_type = 'human'
                  AND e.payload->>'reason' = 'Encerrado por engano' AND e.payload->>'previous_outcome' = 'nao_quer_contato' AND (e.payload->>'previous_closed_at')::timestamptz = prev_closed),
    (SELECT payload::text FROM journey_events WHERE journey_id = c.j1 AND event_type = 'journey_reopened'));
  INSERT INTO _r VALUES (20, 'reabrir: contatos e numeração preservados (o contato que encerrou continua no histórico)',
    (SELECT count(*) FROM get_person_contacts(c.p1)) = ct0 AND (SELECT string_agg(ordinal::text, ',' ORDER BY ordinal) FROM get_person_contacts(c.p1)) = '1,2,3,4,5,6,7,8,9,10', ct0 || ' contatos');
  INSERT INTO _r SELECT 20, 'timeline mostra "Atendimento reaberto — Motivo: …" com o responsável',
    EXISTS (SELECT 1 FROM get_person_timeline(c.p1, 200) t WHERE t.event_kind = 'journey_reopened' AND t.summary LIKE 'Atendimento reaberto — Motivo: Encerrado por engano%' AND t.actor_name IS NOT NULL), NULL;

  BEGIN PERFORM journey_reopen(c.j1, 'de novo'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (20, 'não reabre o que não está encerrado', r LIKE 'JOURNEY_NOT_CLOSED%', r);

  -- finalizar com desfecho positivo → Atendida; depois abrir outra jornada e tentar reabrir a antiga
  PERFORM journey_register_attendance(p_person_id => c.p1, p_contact_channel => 'presencial', p_contact_result => 'realizado', p_close_journey => true, p_register_contact => true);
  INSERT INTO _r VALUES (13, 'finalizar com desfecho positivo → estado Atendida', person_care_state(c.p1) = 'atendida', (SELECT outcome FROM person_journey WHERE id = c.j1));
  PERFORM journey_register_attendance(p_person_id => c.p1, p_new_stage_id => c.stage, p_register_contact => false);   -- nova jornada
  BEGIN PERFORM journey_reopen(c.j1, 'tentativa'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (20, 'não permite duas jornadas humanas abertas (reabrir antiga com outra aberta → recusado)',
    r LIKE 'JOURNEY_ALREADY_OPEN%' AND (SELECT count(*) FROM person_journey WHERE person_id = c.p1 AND closed_at IS NULL) = 1, r);
  INSERT INTO _r VALUES (13, 'com nova jornada aberta o estado é Em atendimento (um estado só)', person_care_state(c.p1) = 'em_atendimento', NULL);
END $$;
RESET ROLE;

-- ── isolamento por igreja ────────────────────────────────────
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c2 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; r text;
BEGIN
  SELECT * INTO c FROM _c;
  BEGIN PERFORM journey_reopen(c.j1, 'invasor'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (30, 'outra igreja não reabre jornada da IGV', r LIKE 'JOURNEY_NOT_FOUND%', r);
  BEGIN PERFORM get_care_status_counts(c.c1, NULL); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := 'NEGADO'; END;
  INSERT INTO _r VALUES (30, 'outra igreja não lê contadores da IGV', r = 'NEGADO', r);
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims', '', true);   -- sem sessão
DO $$
DECLARE r text;
BEGIN
  BEGIN PERFORM journey_reopen((SELECT j1 FROM _c), 'sem login'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (30, 'sem usuário autenticado não reabre', r LIKE 'FORBIDDEN%', r);
END $$;

-- ── Preservação ──────────────────────────────────────────────
INSERT INTO _r SELECT 40, 'acolhimento_journey intacto (o agente não foi tocado)', (SELECT md5(string_agg(md5(a::text), '' ORDER BY a.id)) FROM acolhimento_journey a) = s.acolhimento_md5, NULL FROM _snap s;
INSERT INTO _r SELECT 40, 'jornadas, eventos e contatos pré-existentes idênticos (nada reclassificado nem apagado)',
  (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT j.id, j.person_id, j.stage_id, j.closed_at, j.outcome, j.version FROM person_journey j JOIN people p ON p.id = j.person_id WHERE coalesce(p.name,'') NOT LIKE 'ZZ-ATD%') x) = s.jornadas_md5
  AND (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT e.id, e.journey_id, e.event_type, e.payload, e.created_at FROM journey_events e JOIN person_journey j ON j.id = e.journey_id JOIN people p ON p.id = j.person_id WHERE coalesce(p.name,'') NOT LIKE 'ZZ-ATD%') x) = s.eventos_md5,
  s.contatos || ' contatos reais' FROM _snap s;
INSERT INTO _r SELECT 40, 'sem_contato_48h continua existindo no contador (compatibilidade)', (get_care_status_counts_exists), NULL FROM (SELECT (SELECT prosrc LIKE '%sem_contato_48h%' FROM pg_proc WHERE proname = 'get_care_status_counts') get_care_status_counts_exists) x;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
