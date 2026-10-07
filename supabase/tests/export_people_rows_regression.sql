-- ============================================================
-- Regressão — itens 21 / 18 / 25 (migration 20261007110000: export_people_rows)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Pessoas sintéticas ZZ-CSV (DDD 20);
-- ministérios sintéticos ZZ-CSV; nada histórico é alterado.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1,
       '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid adm,
       '358cf292-5890-4570-9bc5-dd2f154dd208'::uuid adm2,
       'dcf2852d-e790-46dc-b66b-e8f74977a706'::uuid itaipu,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'visitante') stage_visit;
GRANT ALL ON _r, _c TO authenticated, anon;
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, journey_id, event_type, payload, created_at, actor_id FROM journey_events) x) eventos_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, ministry_id, person_id FROM ministry_members) x) mm_md5,
       (SELECT count(*) FROM volunteers) volunteers_n;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- ── Dados sintéticos: ministérios e pessoas com 0 / 1 / 2 / 3 contatos ──
INSERT INTO ministries (church_id, name, slug, is_active) SELECT c1, 'ZZ-CSV Louvor', 'zz-csv-louvor', true FROM _c;
INSERT INTO ministries (church_id, name, slug, is_active) SELECT c1, 'ZZ-CSV Acolhimento', 'zz-csv-acolhimento', true FROM _c;
INSERT INTO people (church_id, name, phone, email, source, unit_id, created_at, first_visit_date)
SELECT c1, 'ZZ-CSV Zero "Aspas", Vírgula', '+55 20 99930-0001', 'zz1@teste.local', 'manual', itaipu, '2026-09-01T12:00:00Z', '2026-09-01' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CSV Um Contato Ação', '+55 20 99930-0002', 'qr_code', itaipu, '2026-09-02T12:00:00Z' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CSV Dois Contatos', '+55 20 99930-0003', 'manual', NULL, '2026-09-03T12:00:00Z' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, created_at)
SELECT c1, 'ZZ-CSV Tres Contatos Multi', '+55 20 99930-0004', 'manual', itaipu, '2026-09-04T12:00:00Z' FROM _c;
INSERT INTO people (church_id, name, phone, source)
SELECT c2, 'ZZ-CSV Outra Igreja', '+55 20 99930-0005', 'manual' FROM _c;
CREATE TEMP TABLE _p ON COMMIT DROP AS SELECT id, name, church_id FROM people WHERE name LIKE 'ZZ-CSV %';
GRANT ALL ON _p TO authenticated, anon;
-- Ministérios: pessoa 4 em dois; pessoa 2 em um; demais sem
INSERT INTO ministry_members (church_id, ministry_id, person_id)
SELECT c.c1, m.id, p.id FROM _c c, ministries m, _p p WHERE m.name IN ('ZZ-CSV Louvor', 'ZZ-CSV Acolhimento') AND p.name LIKE 'ZZ-CSV Tres%';
INSERT INTO ministry_members (church_id, ministry_id, person_id)
SELECT c.c1, m.id, p.id FROM _c c, ministries m, _p p WHERE m.name = 'ZZ-CSV Louvor' AND p.name LIKE 'ZZ-CSV Um %';

-- Contatos pelas RPCs reais, com atores diferentes (adm e adm2) e datas distintas
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; p1 uuid; p2 uuid; p3 uuid;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT id INTO p1 FROM _p WHERE name LIKE 'ZZ-CSV Um %';
  SELECT id INTO p2 FROM _p WHERE name LIKE 'ZZ-CSV Dois%';
  SELECT id INTO p3 FROM _p WHERE name LIKE 'ZZ-CSV Tres%';
  PERFORM journey_register_attendance(p_person_id => p1, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao',  p_contact_result => 'nao_atendeu', p_contact_date => '2026-09-10T10:00:00Z', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => p2, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao',  p_contact_result => 'nao_atendeu', p_contact_date => '2026-09-11T10:00:00Z', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => p2, p_expected_version => 1, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_notes => 'ok', p_contact_date => '2026-09-12T15:30:00Z', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => p3, p_new_stage_id => c.stage_visit, p_contact_channel => 'ligacao',  p_contact_result => 'nao_atendeu', p_contact_date => '2026-09-13T10:00:00Z', p_register_contact => true);
  PERFORM journey_register_attendance(p_person_id => p3, p_expected_version => 1, p_contact_channel => 'ligacao', p_contact_result => 'sem_resposta', p_contact_date => '2026-09-14T10:00:00Z', p_register_contact => true);
END $$;
-- 3º contato da pessoa 3 por OUTRO ator (admin_departments)
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm2 FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
DO $$
DECLARE p3 uuid;
BEGIN
  SELECT id INTO p3 FROM _p WHERE name LIKE 'ZZ-CSV Tres%';
  PERFORM journey_register_attendance(p_person_id => p3, p_expected_version => 2, p_contact_channel => 'presencial', p_contact_result => 'realizado', p_contact_date => '2026-09-15T10:00:00Z', p_register_contact => true);
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);

-- ── Testes ──
DO $$
DECLARE c record; j jsonb; r jsonb; lista bigint; nome_adm text; nome_adm2 text; n int := 0;
  k text; filtros text[] := ARRAY['todas','itaipu','sem_unidade','etapa','busca','em_atendimento','alerta'];
BEGIN
  SELECT * INTO c FROM _c;
  SELECT COALESCE(pr.name, pr.display_name) INTO nome_adm  FROM profiles pr WHERE pr.user_id = c.adm;
  SELECT COALESCE(pr.name, pr.display_name) INTO nome_adm2 FROM profiles pr WHERE pr.user_id = c.adm2;

  -- 1. > 1000 pessoas, 2–8. universo = lista para cada filtro, 18. sem duplicação
  FOREACH k IN ARRAY filtros LOOP
    n := n + 1;
    j := CASE k
      WHEN 'todas'          THEN export_people_rows(c.c1)
      WHEN 'itaipu'         THEN export_people_rows(c.c1, p_unit_id => c.itaipu::text)
      WHEN 'sem_unidade'    THEN export_people_rows(c.c1, p_unit_id => 'none')
      WHEN 'etapa'          THEN export_people_rows(c.c1, p_stage_key => 'visitante')
      WHEN 'busca'          THEN export_people_rows(c.c1, p_search => 'zz-csv')
      WHEN 'em_atendimento' THEN export_people_rows(c.c1, p_care_status => 'em_atendimento')
      WHEN 'alerta'         THEN export_people_rows(c.c1, p_care_status => 'sem_contato_48h') END;
    lista := CASE k
      WHEN 'todas'          THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_limit => 1))
      WHEN 'itaipu'         THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_unit_id => c.itaipu::text, p_limit => 1))
      WHEN 'sem_unidade'    THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_unit_id => 'none', p_limit => 1))
      WHEN 'etapa'          THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_stage_key => 'visitante', p_limit => 1))
      WHEN 'busca'          THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_search => 'zz-csv', p_limit => 1))
      WHEN 'em_atendimento' THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_care_status => 'em_atendimento', p_limit => 1))
      WHEN 'alerta'         THEN (SELECT max(total_count) FROM get_people_page(c.c1, p_care_status => 'sem_contato_48h', p_limit => 1)) END;
    INSERT INTO _r VALUES (n, format('%s: linhas exportadas = total = total da lista; sem pessoa duplicada%s', k, CASE WHEN k = 'todas' THEN ' (> 1.000)' ELSE '' END),
      jsonb_array_length(j->'rows') = (j->>'total')::int AND (j->>'total')::int = lista
      AND (SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(j->'rows') x) = jsonb_array_length(j->'rows')
      AND (k <> 'todas' OR (j->>'total')::int > 1000),
      format('export=%s lista=%s max_contacts=%s', j->>'total', lista, j->>'max_contacts'));
  END LOOP;

  -- 13. contatos dinâmicos: max_contacts do universo = maior nº de contatos de uma pessoa do universo
  j := export_people_rows(c.c1);
  n := n + 1; INSERT INTO _r VALUES (n, 'max_contacts (Todas) = maior quantidade de contatos entre as pessoas exportadas (sem teto artificial)',
    (j->>'max_contacts')::int = (SELECT max((x->>'contacts_count')::int) FROM jsonb_array_elements(j->'rows') x) AND (j->>'max_contacts')::int >= 3, j->>'max_contacts');

  -- 9–12, 14–17: pessoas sintéticas (busca)
  j := export_people_rows(c.c1, p_search => 'ZZ-CSV');
  n := n + 1; INSERT INTO _r VALUES (n, 'busca ZZ-CSV: 4 pessoas (a de outra igreja NÃO aparece); max_contacts = 3', (j->>'total')::int = 4 AND (j->>'max_contacts')::int = 3
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' = 'ZZ-CSV Outra Igreja'), j->>'total' || '/' || (j->>'max_contacts'));

  SELECT x INTO r FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' LIKE 'ZZ-CSV Zero%';
  n := n + 1; INSERT INTO _r VALUES (n, '9/17. pessoa sem contato e sem ministério: contacts_count 0, contacts [], ministerios "", cadastro e 1ª visita presentes, unidade Itaipu',
    (r->>'contacts_count')::int = 0 AND jsonb_array_length(r->'contacts') = 0 AND r->>'ministerios' = '' AND r->>'created_at' LIKE '2026-09-01%' AND r->>'first_visit_date' = '2026-09-01' AND r->>'unit_name' = 'Itaipu' AND r->>'care_state' = 'nao_atendida' AND (r->>'care_alert')::boolean, r::text);

  SELECT x INTO r FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' LIKE 'ZZ-CSV Um %';
  n := n + 1; INSERT INTO _r VALUES (n, '10/14/15. 1 contato: ordinal 1, nao_atendeu, data 10/09 10:00Z, responsável = ator do evento (admin), 1 ministério',
    (r->>'contacts_count')::int = 1 AND r->'contacts'->0->>'result' = 'nao_atendeu' AND (r->'contacts'->0->>'contact_date')::timestamptz = '2026-09-10T10:00:00Z'
    AND r->'contacts'->0->>'actor_id' = c.adm::text AND r->'contacts'->0->>'actor_name' = nome_adm AND r->>'ministerios' = 'ZZ-CSV Louvor', r::text);

  SELECT x INTO r FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' LIKE 'ZZ-CSV Dois%';
  n := n + 1; INSERT INTO _r VALUES (n, '11/15. 2 contatos em ordem: 1º nao_atendeu 11/09, 2º realizado 12/09 15:30Z com observação; unidade NULL',
    (r->>'contacts_count')::int = 2 AND r->'contacts'->0->>'ordinal' = '1' AND r->'contacts'->0->>'result' = 'nao_atendeu'
    AND r->'contacts'->1->>'ordinal' = '2' AND r->'contacts'->1->>'result' = 'realizado' AND (r->'contacts'->1->>'contact_date')::timestamptz = '2026-09-12T15:30:00Z'
    AND r->'contacts'->1->>'notes' = 'ok' AND r->>'unit_name' IS NULL AND r->>'care_state' = 'em_atendimento', r::text);

  SELECT x INTO r FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' LIKE 'ZZ-CSV Tres%';
  n := n + 1; INSERT INTO _r VALUES (n, '12/14/16. 3 contatos: 3º por OUTRO ator (admin_departments) com o nome dele; 2 ministérios concatenados em ordem alfabética',
    (r->>'contacts_count')::int = 3 AND r->'contacts'->2->>'ordinal' = '3' AND r->'contacts'->2->>'actor_id' = c.adm2::text AND r->'contacts'->2->>'actor_name' = nome_adm2
    AND r->'contacts'->0->>'actor_name' = nome_adm AND r->>'ministerios' = 'ZZ-CSV Acolhimento | ZZ-CSV Louvor', r::text);

  n := n + 1; INSERT INTO _r VALUES (n, 'responsável nunca é o owner da jornada: actor_id de cada contato = actor_id gravado em journey_events',
    (SELECT bool_and(ct->>'actor_id' = (SELECT e.actor_id::text FROM journey_events e WHERE e.id = (ct->>'event_id')::uuid))
       FROM jsonb_array_elements(j->'rows') x, jsonb_array_elements(x->'contacts') ct), '');

  -- 19. acentuação/aspas preservadas no payload (o CSV escapa no frontend)
  n := n + 1; INSERT INTO _r VALUES (n, 'texto com aspas, vírgula e acentos chega íntegro (escape fica no gerador do CSV)',
    EXISTS (SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' = 'ZZ-CSV Zero "Aspas", Vírgula') AND EXISTS (SELECT 1 FROM jsonb_array_elements(j->'rows') x WHERE x->>'name' = 'ZZ-CSV Um Contato Ação'), '');

  -- filtro de alerta dentro da busca: Zero (nunca tentada, cadastro antigo), Um (nao_atendeu antigo), Tres? última realizado → não; Dois última realizado → não
  j := export_people_rows(c.c1, p_search => 'ZZ-CSV', p_care_status => 'sem_contato_48h');
  n := n + 1; INSERT INTO _r VALUES (n, 'alerta + busca: exporta só Zero e Um (última tentativa não atendida / nunca tentada)', (j->>'total')::int = 2
    AND (SELECT bool_and(x->>'name' LIKE 'ZZ-CSV Zero%' OR x->>'name' LIKE 'ZZ-CSV Um %') FROM jsonb_array_elements(j->'rows') x), j->>'total');
  j := export_people_rows(c.c1, p_search => 'ZZ-CSV', p_unit_id => c.itaipu::text);
  n := n + 1; INSERT INTO _r VALUES (n, 'Itaipu + busca: 3 pessoas (Dois tem unidade NULL)', (j->>'total')::int = 3, j->>'total');
  j := export_people_rows(c.c1, p_search => 'ZZ-CSV', p_unit_id => 'none');
  n := n + 1; INSERT INTO _r VALUES (n, 'Sem unidade + busca: 1 pessoa (Dois)', (j->>'total')::int = 1 AND j->'rows'->0->>'name' LIKE 'ZZ-CSV Dois%', j->>'total');

  -- 20. contadores homologados inalterados pela migration
  j := get_care_status_counts(c.c1, p_search => 'ZZ-CSV');
  n := n + 1; INSERT INTO _r VALUES (n, 'contadores (busca ZZ-CSV): 1 não atendida + 3 em atendimento = 4; alerta 2', (j->>'nao_atendida')::int = 1 AND (j->>'em_atendimento')::int = 3 AND (j->>'total')::int = 4 AND (j->>'sem_contato_48h')::int = 2, j::text);
END $$;

-- Isolamento de tenant: outra igreja não vê as pessoas da IGV; igreja errada no parâmetro → FORBIDDEN
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c2 FROM _c)))::text, true);
DO $$
DECLARE c record; j jsonb;
BEGIN
  SELECT * INTO c FROM _c;
  j := export_people_rows(c.c2, p_search => 'ZZ-CSV');
  INSERT INTO _r VALUES (40, 'tenant: usuário da igreja c2 exporta só a pessoa da c2', (j->>'total')::int = 1 AND j->'rows'->0->>'name' = 'ZZ-CSV Outra Igreja', j->>'total');
  BEGIN
    PERFORM export_people_rows(c.c1);
    INSERT INTO _r VALUES (41, 'tenant: p_church_id de outra igreja → FORBIDDEN', false, 'executou');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES (41, 'tenant: p_church_id de outra igreja → FORBIDDEN', SQLERRM LIKE '%FORBIDDEN%', SQLERRM);
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid);
    INSERT INTO _r VALUES (42, 'anon: export_people_rows negado', false, 'executou');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN
    INSERT INTO _r VALUES (42, 'anon: export_people_rows negado', true, SQLERRM);
  END;
END $$;
RESET ROLE;

-- Nada histórico alterado; volunteers intocado
INSERT INTO _r
SELECT 50, 'histórico: eventos e ministry_members pré-existentes intactos; volunteers não usado nem alterado',
  s.eventos_md5 = (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, journey_id, event_type, payload, created_at, actor_id FROM journey_events WHERE journey_id NOT IN (SELECT id FROM person_journey WHERE person_id IN (SELECT id FROM _p))) x)
  AND s.mm_md5 = (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, ministry_id, person_id FROM ministry_members WHERE person_id NOT IN (SELECT id FROM _p)) x)
  AND s.volunteers_n = (SELECT count(*) FROM volunteers), ''
FROM _snap s;

SELECT n, teste, ok, info FROM _r ORDER BY n;
ROLLBACK;
