-- ============================================================
-- Regressão — itens 2 / 16 / 22 (migration 20261007100000)
-- Estados mutuamente exclusivos × alerta "Sem contato +48h" × contadores no
-- mesmo universo da lista. Roda inteira em BEGIN … ROLLBACK: nada persiste.
-- Pessoas sintéticas ZZ-CARE (DDD 20). Jornadas legadas: só leitura.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid adm,
       'dcf2852d-e790-46dc-b66b-e8f74977a706'::uuid itaipu,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'visitante') stage_visit,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'membro') stage_membro;
GRANT ALL ON _r, _c TO authenticated, anon;

-- Impressão digital dos dados históricos (nada pode mudar)
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT count(*) FROM person_journey WHERE closed_at IS NULL AND opened_at::date = '2026-08-01'
          AND NOT EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = person_journey.id)) legado_n,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, owner_id, opened_at, closed_at, outcome, version, next_step FROM person_journey) x) jornadas_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, journey_id, event_type, payload, created_at, actor_id FROM journey_events) x) eventos_md5,
       (SELECT count(*) FROM people) pessoas_n;

-- ── ANTES da migration: números atuais da IGV (regra antiga) ──
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
CREATE TEMP TABLE _before ON COMMIT DROP AS
SELECT 'todas' escopo, get_care_status_counts((SELECT c1 FROM _c), NULL) j
UNION ALL SELECT 'itaipu', get_care_status_counts((SELECT c1 FROM _c), (SELECT itaipu::text FROM _c))
UNION ALL SELECT 'sem_unidade', get_care_status_counts((SELECT c1 FROM _c), 'none');

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- ── DEPOIS da migration: mesmos escopos ──
CREATE TEMP TABLE _after ON COMMIT DROP AS
SELECT 'todas' escopo, get_care_status_counts((SELECT c1 FROM _c), NULL) j
UNION ALL SELECT 'itaipu', get_care_status_counts((SELECT c1 FROM _c), (SELECT itaipu::text FROM _c))
UNION ALL SELECT 'sem_unidade', get_care_status_counts((SELECT c1 FROM _c), 'none');

DO $$
DECLARE b record; a record; soma_b bigint; soma_a bigint; n int := 0;
BEGIN
  FOR b IN SELECT * FROM _before LOOP
    SELECT * INTO a FROM _after WHERE escopo = b.escopo;
    soma_b := (b.j->>'nao_atendida')::bigint + (b.j->>'em_atendimento')::bigint + (b.j->>'atendida')::bigint + (b.j->>'cancelado')::bigint;
    soma_a := (a.j->>'nao_atendida')::bigint + (a.j->>'em_atendimento')::bigint + (a.j->>'atendida')::bigint + (a.j->>'cancelado')::bigint;
    n := n + 1;
    INSERT INTO _r VALUES (n, 'IGV ' || b.escopo || ': 4 estados somam o total antes e depois; total não muda',
      soma_b = (b.j->>'total')::bigint AND soma_a = (a.j->>'total')::bigint AND (a.j->>'total') = (b.j->>'total'),
      'antes ' || b.j::text || ' | depois ' || a.j::text);
    n := n + 1;
    INSERT INTO _r VALUES (n, 'IGV ' || b.escopo || ': alerta não entra na soma e threshold = 48h',
      (a.j->>'sem_contato_48h')::bigint <= (a.j->>'total')::bigint AND (a.j->>'alert_threshold_hours')::int = 48,
      'sem_contato_48h=' || (a.j->>'sem_contato_48h'));
  END LOOP;
END $$;

-- ── Impacto das 473 jornadas legadas (só leitura) ──
DO $$
DECLARE c record; n_leg int; n_leg_em int; n_leg_nao int; n_leg_alert int; n_em_sem_evento int;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT count(*), count(*) FILTER (WHERE person_care_state(pj.person_id) = 'em_atendimento'),
         count(*) FILTER (WHERE person_care_state(pj.person_id) = 'nao_atendida'),
         count(*) FILTER (WHERE person_care_alert(pj.person_id))
    INTO n_leg, n_leg_em, n_leg_nao, n_leg_alert
  FROM person_journey pj WHERE pj.church_id = c.c1 AND pj.closed_at IS NULL AND pj.opened_at::date = '2026-08-01'
    AND NOT EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = pj.id);
  INSERT INTO _r VALUES (10, 'I. legado: 473 jornadas abertas sem evento → 0 "Em atendimento", todas "Não atendida"',
    n_leg = 473 AND n_leg_em = 0 AND n_leg_nao = 473, format('legado=%s em=%s nao=%s', n_leg, n_leg_em, n_leg_nao));
  INSERT INTO _r VALUES (11, 'I. legado: pessoas cadastradas há meses sem tentativa → alerta +48h ativo',
    n_leg_alert = 473, format('alerta=%s', n_leg_alert));
  -- Nenhuma pessoa "Em atendimento" sem atividade humana
  SELECT count(*) INTO n_em_sem_evento
  FROM people p WHERE p.church_id = c.c1 AND p.deleted_at IS NULL AND p.left_at IS NULL
    AND person_care_state(p.id) = 'em_atendimento'
    AND NOT EXISTS (SELECT 1 FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = p.id AND e.actor_type = 'human');
  INSERT INTO _r VALUES (12, 'depois: nenhuma pessoa "Em atendimento" sem nenhum evento HUMANO', n_em_sem_evento = 0, n_em_sem_evento::text);
END $$;

-- ── Cenários humanos A–H (pessoas sintéticas) ──
SET LOCAL ROLE authenticated;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE A nunca tentada velha', '+55 20 99920-0001', 'manual', itaipu, now() - interval '5 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE A2 nunca tentada nova', '+55 20 99920-0002', 'manual', itaipu, now() - interval '3 hours' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE B nao atendeu recente', '+55 20 99920-0003', 'manual', itaipu, now() - interval '5 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE C nao atendeu antiga', '+55 20 99920-0004', 'manual', itaipu, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE D duas tentativas ultima nao atendeu', '+55 20 99920-0005', 'manual', itaipu, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE E ultima realizado', '+55 20 99920-0006', 'manual', itaipu, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE F sem resposta antiga', '+55 20 99920-0007', 'manual', itaipu, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE G encerrado', '+55 20 99920-0008', 'manual', itaipu, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE H cancelado', '+55 20 99920-0009', 'manual', itaipu, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE N nao tentei so correcao', '+55 20 99920-0010', 'manual', NULL, now() - interval '10 days' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CARE S so evento de sistema', '+55 20 99920-0011', 'manual', itaipu, now() - interval '10 days' FROM _c;
-- S: jornada aberta só com eventos de sistema/agente (como uma automação faria) → NÃO é atendimento humano
RESET ROLE;
INSERT INTO person_journey (person_id, church_id, stage_id, version)
SELECT id, (SELECT c1 FROM _c), (SELECT stage_visit FROM _c), 1 FROM people WHERE name = 'ZZ-CARE S so evento de sistema';
INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
SELECT j.id, j.church_id, 'stage_advance', NULL, 'system', '{"note":"automação"}'::jsonb FROM person_journey j JOIN people p ON p.id = j.person_id WHERE p.name = 'ZZ-CARE S so evento de sistema';
INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
SELECT j.id, j.church_id, 'touch_sent', NULL, 'agent', '{}'::jsonb FROM person_journey j JOIN people p ON p.id = j.person_id WHERE p.name = 'ZZ-CARE S so evento de sistema';
SET LOCAL ROLE authenticated;

CREATE TEMP TABLE _p ON COMMIT DROP AS SELECT id, name FROM people WHERE name LIKE 'ZZ-CARE %';
GRANT ALL ON _p TO authenticated;

DO $$
DECLARE c record; pid uuid; v int;
BEGIN
  SELECT * INTO c FROM _c;
  -- B: 1ª tentativa não atendeu há 3h
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE B%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '3 hours', p_register_contact => true);
  -- C: 1ª tentativa não atendeu há 3 dias
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE C%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '3 days', p_register_contact => true);
  -- D: duas tentativas, última não atendeu há 3 dias
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE D%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '6 days', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => pid, p_expected_version => 1, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '3 days', p_register_contact => true);
  -- E: não atendeu há 6 dias, depois realizado há 3 dias
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE E%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '6 days', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => pid, p_expected_version => 1, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_date => now() - interval '3 days', p_register_contact => true);
  -- F: sem resposta há 3 dias
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE F%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'whatsapp', p_contact_result => 'sem_resposta', p_contact_date => now() - interval '3 days', p_register_contact => true);
  -- G: encerrado manualmente (não atendeu há 5 dias, depois encerrado com realizado)
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE G%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '5 days', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => pid, p_expected_version => 1, p_contact_channel => 'presencial', p_contact_result => 'realizado', p_contact_date => now() - interval '4 days', p_close_journey => true, p_register_contact => true);
  -- H: cancelado: não atendeu há 6 dias, depois 'não quer contato' há 5 dias (encerra)
  -- (a RPC só encerra no ramo de jornada EXISTENTE: resultado de encerramento na 1ª gravação não fecha — comportamento pré-existente, fora deste escopo)
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE H%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_contact_date => now() - interval '6 days', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => pid, p_expected_version => 1, p_contact_channel => 'ligacao', p_contact_result => 'nao_quer_contato', p_contact_date => now() - interval '5 days', p_register_contact => true);
  -- N: "Não tentei": só correção, jornada aberta via tela, sem tentativa
  SELECT id INTO pid FROM _p WHERE name LIKE 'ZZ-CARE N%';
  PERFORM journey_register_attendance(p_person_id => pid, p_new_stage_id => c.stage_visit, p_people_updates => '{"city":"Niterói"}'::jsonb, p_register_contact => false);
END $$;

-- Estados e alerta por cenário
DO $$
DECLARE r record; st text; al boolean; n int := 20;
  esperado jsonb := '{
    "A":  ["nao_atendida", true],
    "A2": ["nao_atendida", false],
    "B":  ["em_atendimento", false],
    "C":  ["em_atendimento", true],
    "D":  ["em_atendimento", true],
    "E":  ["em_atendimento", false],
    "F":  ["em_atendimento", true],
    "G":  ["atendida", false],
    "H":  ["cancelado", false],
    "N":  ["em_atendimento", true],
    "S":  ["nao_atendida", true]
  }';
  k text;
BEGIN
  FOR r IN SELECT * FROM _p ORDER BY name LOOP
    k := split_part(r.name, ' ', 2);
    st := person_care_state(r.id); al := person_care_alert(r.id);
    n := n + 1;
    INSERT INTO _r VALUES (n, k || '. ' || r.name || ' → ' || (esperado->k->>0) || ' / alerta=' || (esperado->k->>1),
      st = (esperado->k->>0) AND al = (esperado->k->>1)::boolean, format('estado=%s alerta=%s', st, al));
  END LOOP;
END $$;

-- Lista × contadores no MESMO universo (unidade, etapa, busca, período, situação)
DO $$
DECLARE c record; j jsonb; lista bigint; soma bigint; n int := 40;
BEGIN
  SELECT * INTO c FROM _c;

  -- J. unidade Itaipu
  j := get_care_status_counts(c.c1, p_unit_id => c.itaipu::text);
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_unit_id => c.itaipu::text, p_limit => 1);
  soma := (j->>'nao_atendida')::bigint + (j->>'em_atendimento')::bigint + (j->>'atendida')::bigint + (j->>'cancelado')::bigint;
  n := n + 1; INSERT INTO _r VALUES (n, 'J. unidade Itaipu: 4 estados = total do contador = total da lista', soma = (j->>'total')::bigint AND lista = (j->>'total')::bigint, j::text || ' lista=' || lista);

  -- K. etapa Visitante + busca ZZ-CARE: contadores só sobre os sintéticos
  j := get_care_status_counts(c.c1, p_stage_key => 'visitante', p_search => 'ZZ-CARE');
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_stage_key => 'visitante', p_search => 'ZZ-CARE', p_limit => 1);
  soma := (j->>'nao_atendida')::bigint + (j->>'em_atendimento')::bigint + (j->>'atendida')::bigint + (j->>'cancelado')::bigint;
  n := n + 1; INSERT INTO _r VALUES (n, 'K+L. etapa Visitante + busca "ZZ-CARE": 8 pessoas com jornada; 0+6+1+1 = 8; alerta = 4 (C, D, F, N)',
    (j->>'total')::bigint = 8 AND lista = 8 AND soma = 8 AND (j->>'em_atendimento')::bigint = 6 AND (j->>'atendida')::bigint = 1 AND (j->>'cancelado')::bigint = 1 AND (j->>'sem_contato_48h')::bigint = 4, j::text || ' lista=' || lista);

  -- L. busca sozinha: 10 sintéticas, 2 sem jornada (A, A2)
  j := get_care_status_counts(c.c1, p_search => 'zz-care');
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_search => 'zz-care', p_limit => 1);
  n := n + 1; INSERT INTO _r VALUES (n, 'L. busca "zz-care" (normalizada): total 11 = lista; Não atendida 3 (A, A2, S); alerta 6 (A, C, D, F, N, S)',
    (j->>'total')::bigint = 11 AND lista = 11 AND (j->>'nao_atendida')::bigint = 3 AND (j->>'sem_contato_48h')::bigint = 6, j::text || ' lista=' || lista);

  -- M. período de cadastro: últimos 4 dias → só A2 (3h)
  j := get_care_status_counts(c.c1, p_search => 'ZZ-CARE', p_created_from => (now() - interval '4 days')::date);
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CARE', p_created_from => (now() - interval '4 days')::date, p_limit => 1);
  n := n + 1; INSERT INTO _r VALUES (n, 'M. período (cadastro ≥ 4 dias atrás) + busca: total 1 = lista; Não atendida 1; alerta 0',
    (j->>'total')::bigint = 1 AND lista = 1 AND (j->>'nao_atendida')::bigint = 1 AND (j->>'sem_contato_48h')::bigint = 0, j::text || ' lista=' || lista);

  -- Situação: filtro sem_contato_48h devolve exatamente os alertados; filtro de estado = contador
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CARE', p_care_status => 'sem_contato_48h', p_limit => 1);
  n := n + 1; INSERT INTO _r VALUES (n, 'situação: lista "Sem contato +48h" = 6 = contador do alerta', lista = 6, 'lista=' || lista);
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CARE', p_care_status => 'em_atendimento', p_limit => 1);
  n := n + 1; INSERT INTO _r VALUES (n, 'situação: lista "Em atendimento" = 6 = contador', lista = 6, 'lista=' || lista);
  SELECT COALESCE(min(total_count), 0) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CARE', p_care_status => 'nao_atendida', p_limit => 1);
  n := n + 1; INSERT INTO _r VALUES (n, 'situação: lista "Não atendida" = 3 = contador (inclui S: só evento de sistema)', lista = 3, 'lista=' || lista);

  -- Unidade "Sem unidade": só N (unit NULL)
  j := get_care_status_counts(c.c1, p_unit_id => 'none', p_search => 'ZZ-CARE');
  n := n + 1; INSERT INTO _r VALUES (n, 'J. unidade "Sem unidade" + busca: total 1 (N), alerta 1', (j->>'total')::bigint = 1 AND (j->>'sem_contato_48h')::bigint = 1, j::text);

  -- Cenário da IGV (itens 2/16/22): em Itaipu, Em atendimento não pode ser igual a Sem contato +48h vindo de jornadas sem contato
  j := get_care_status_counts(c.c1, p_unit_id => c.itaipu::text);
  n := n + 1; INSERT INTO _r VALUES (n, 'IGV Itaipu: Em atendimento só com atividade humana; soma dos 4 = total; alerta separado',
    (j->>'em_atendimento')::bigint < 100 AND (j->>'nao_atendida')::bigint + (j->>'em_atendimento')::bigint + (j->>'atendida')::bigint + (j->>'cancelado')::bigint = (j->>'total')::bigint, j::text);

  -- row_data expõe care_alert
  n := n + 1; INSERT INTO _r VALUES (n, 'row_data traz care_state e care_alert coerentes com as funções',
    (SELECT bool_and((row_data->>'care_state') = person_care_state((row_data->>'id')::uuid) AND (row_data->>'care_alert')::boolean = person_care_alert((row_data->>'id')::uuid))
       FROM get_people_page(c.c1, p_search => 'ZZ-CARE', p_limit => 50)), '');
END $$;

-- Pessoa real de homologação do item 10 (igreja Mock): só leitura
RESET ROLE;
INSERT INTO _r SELECT 55, 'ZZ Homologação Item 10 (Mock): estado/alerta/contatos/último resultado', true,
  format('estado=%s alerta=%s contatos=%s ultimo=%s', person_care_state(p.id), person_care_alert(p.id),
    (SELECT count(*) FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = p.id AND e.event_type = 'pastoral_contact'),
    (SELECT e.payload->>'result' FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = p.id AND e.event_type = 'pastoral_contact' ORDER BY e.created_at DESC LIMIT 1))
  FROM people p WHERE p.id = '105f5d84-bfb5-49f9-93dc-db263288cab4';

-- anon não executa os contadores
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM get_care_status_counts('6c127559-874a-4748-8fce-55d4079613a5'::uuid);
    INSERT INTO _r VALUES (60, 'anon: get_care_status_counts negado', false, 'executou');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    INSERT INTO _r VALUES (60, 'anon: get_care_status_counts negado', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- Dados históricos intactos (as 473 jornadas e todos os eventos anteriores ao teste)
INSERT INTO _r
SELECT 70, 'histórico: 473 jornadas legadas e eventos anteriores intactos (md5 das jornadas/eventos pré-existentes)',
  s.legado_n = (SELECT count(*) FROM person_journey WHERE closed_at IS NULL AND opened_at::date = '2026-08-01' AND NOT EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = person_journey.id))
  AND s.jornadas_md5 = (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, owner_id, opened_at, closed_at, outcome, version, next_step FROM person_journey WHERE person_id NOT IN (SELECT id FROM _p)) x)
  AND s.eventos_md5 = (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, journey_id, event_type, payload, created_at, actor_id FROM journey_events WHERE journey_id NOT IN (SELECT id FROM person_journey WHERE person_id IN (SELECT id FROM _p))) x),
  ''
FROM _snap s;

SELECT n, teste, ok, info FROM _r ORDER BY n;
ROLLBACK;
