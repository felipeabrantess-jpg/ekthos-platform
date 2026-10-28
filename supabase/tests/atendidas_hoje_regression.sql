-- ============================================================
-- Regressão — "Atendidas hoje" (migration 20261028200000). Dados reais da IGV, transação que termina em
-- EXCEÇÃO PROPOSITAL: nada persiste.  Uso: node supabase/tests/run-regression.mjs <este arquivo> [migration]
-- ============================================================
BEGIN;
SET LOCAL statement_timeout = '240s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _antes (u text, j jsonb) ON COMMIT DROP;
GRANT ALL ON _r, _antes TO authenticated, anon;

-- CONTROLE POSITIVO (desfeito no fim): 3 atendimentos simulados em jornadas abertas reais da IGV
--   A: contato humano HOJE "sem_resposta" + depois "realizado"   → conta 1 vez, último = realizado, 2 registros
--   B: contato humano ONTEM                                       → NÃO conta
--   C: evento do AGENTE hoje                                      → NÃO conta
--   D: encaminhamento humano hoje (sem contato)                   → conta, resultado "encaminhado"
CREATE TEMP TABLE _sim (k text, person_id uuid) ON COMMIT DROP;
GRANT ALL ON _sim TO authenticated;
DO $$
DECLARE c constant uuid := '6c127559-874a-4748-8fce-55d4079613a5'; adm constant uuid := '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349';
        j record; k text; i int := 0;
BEGIN
  FOR j IN SELECT pj.id, pj.person_id FROM person_journey pj JOIN people p ON p.id = pj.person_id
           WHERE pj.church_id = c AND pj.closed_at IS NULL AND p.deleted_at IS NULL AND p.left_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM journey_events e WHERE e.journey_id = pj.id
                             AND e.created_at >= now() - interval '2 days')
           ORDER BY pj.id LIMIT 4 LOOP
    i := i + 1; k := (ARRAY['A','B','C','D'])[i];
    INSERT INTO _sim VALUES (k, j.person_id);
    IF k = 'A' THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload, created_at) VALUES
        (j.id, c, 'pastoral_contact', adm, 'human', '{"result":"sem_resposta","notes":"tentei cedo"}', now() - interval '1 minute'),
        (j.id, c, 'pastoral_contact', adm, 'human', '{"result":"realizado","notes":"conversamos"}', now());
    ELSIF k = 'B' THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload, created_at) VALUES
        (j.id, c, 'pastoral_contact', adm, 'human', '{"result":"realizado"}', date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo' - interval '1 minute');
    ELSIF k = 'C' THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload, created_at) VALUES
        (j.id, c, 'pastoral_contact', NULL, 'agent', '{"result":"realizado"}', now());
    ELSE
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload, created_at) VALUES
        (j.id, c, 'ministry_referral', adm, 'human', '{"ministry_name":"Louvor"}', now());
    END IF;
  END LOOP;
END $$;


-- números ANTES (como admin IGV)
SELECT set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
SET LOCAL ROLE authenticated;
INSERT INTO _antes SELECT coalesce(u, 'todas'), get_care_status_counts(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_unit_id => u)
  FROM unnest(ARRAY[NULL, 'dcf2852d-e790-46dc-b66b-e8f74977a706', 'none']) u;
RESET ROLE;

--@@MIGRATION@@

DO $$
DECLARE
  c constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  inicio constant timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  esperado int; botao int; lista int; csv int; r record; j jsonb; outra uuid; vazamento int;
BEGIN
  -- referência independente: pessoas ativas da IGV com contato/encaminhamento humano registrado desde 00h de Brasília
  SELECT count(DISTINCT pj.person_id) INTO esperado
  FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id JOIN people p ON p.id = pj.person_id
  WHERE pj.church_id = c AND je.actor_type = 'human' AND je.event_type IN ('pastoral_contact', 'ministry_referral')
    AND je.created_at >= inicio AND p.deleted_at IS NULL AND p.left_at IS NULL;

  PERFORM set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
  SET LOCAL ROLE authenticated;

  FOR r IN SELECT * FROM _antes LOOP
    j := get_care_status_counts(p_church_id => c, p_unit_id => NULLIF(r.u, 'todas'));
    INSERT INTO _r VALUES (1, 'demais números iguais aos de antes — ' || r.u, (j - 'atendidas_hoje') = r.j, (j - 'atendidas_hoje')::text);
    botao := (j ->> 'atendidas_hoje')::int;
    SELECT coalesce(max(total_count), 0) INTO lista FROM get_people_page(p_church_id => c, p_unit_id => NULLIF(r.u, 'todas'), p_care_status => 'atendidas_hoje', p_limit => 1, p_offset => 0);
    INSERT INTO _r VALUES (2, 'botão Atendidas hoje = lista — ' || r.u, botao = lista, botao || ' × ' || lista);
    j := export_people_rows(p_church_id => c, p_care_status => 'atendidas_hoje', p_unit_id => NULLIF(r.u, 'todas'), p_stage => NULL, p_source => NULL, p_search => NULL,
           p_date_from => NULL, p_date_to => NULL, p_created_from => NULL, p_created_to => NULL, p_stage_key => NULL, p_tag_id => NULL, p_birth_month => NULL,
           p_classification => NULL, p_role => NULL, p_contact => NULL);
    csv := coalesce(jsonb_array_length(j -> 'people'), jsonb_array_length(j -> 'rows'), -1);
    INSERT INTO _r VALUES (3, 'CSV Atendidas hoje = botão — ' || r.u, csv = botao, csv || ' × ' || botao);
    IF r.u = 'todas' THEN
      INSERT INTO _r VALUES (4, 'botão (todas as unidades) = contagem independente no banco', botao = esperado, botao || ' × ' || esperado);
    END IF;
  END LOOP;

  -- cada linha da lista traz o que aconteceu hoje
  SELECT count(*) FILTER (WHERE row_data -> 'atendimento_hoje' ->> 'result' IS NOT NULL AND row_data -> 'atendimento_hoje' ->> 'at' IS NOT NULL), count(*)
    INTO botao, lista
  FROM get_people_page(p_church_id => c, p_care_status => 'atendidas_hoje', p_limit => 1000, p_offset => 0);
  INSERT INTO _r VALUES (5, 'toda linha de Atendidas hoje tem resultado e hora do atendimento', botao = lista, botao || '/' || lista);
  -- controle positivo
  SELECT count(*) INTO botao FROM get_people_page(p_church_id => c, p_care_status => 'atendidas_hoje', p_limit => 1000, p_offset => 0) g
    WHERE (g.row_data ->> 'id')::uuid IN (SELECT person_id FROM _sim WHERE k IN ('A', 'D'));
  INSERT INTO _r VALUES (9, 'simulação: contato de hoje (A) e encaminhamento de hoje (D) aparecem', botao = 2, botao::text);
  SELECT count(*) INTO botao FROM get_people_page(p_church_id => c, p_care_status => 'atendidas_hoje', p_limit => 1000, p_offset => 0) g
    WHERE (g.row_data ->> 'id')::uuid IN (SELECT person_id FROM _sim WHERE k IN ('B', 'C'));
  INSERT INTO _r VALUES (10, 'simulação: contato de ontem (B) e do agente (C) NÃO aparecem', botao = 0, botao::text);
  SELECT g.row_data -> 'atendimento_hoje' INTO j FROM get_people_page(p_church_id => c, p_care_status => 'atendidas_hoje', p_limit => 1000, p_offset => 0) g
    WHERE (g.row_data ->> 'id')::uuid = (SELECT person_id FROM _sim WHERE k = 'A');
  INSERT INTO _r VALUES (11, 'simulação A: mostra o último (realizado, "conversamos"), quem atendeu e 2 registros no dia',
    j ->> 'result' = 'realizado' AND j ->> 'notes' = 'conversamos' AND j ->> 'actor_name' IS NOT NULL AND (j ->> 'registros_hoje')::int = 2, j::text);
  SELECT g.row_data -> 'atendimento_hoje' INTO j FROM get_people_page(p_church_id => c, p_care_status => 'atendidas_hoje', p_limit => 1000, p_offset => 0) g
    WHERE (g.row_data ->> 'id')::uuid = (SELECT person_id FROM _sim WHERE k = 'D');
  INSERT INTO _r VALUES (12, 'simulação D: resultado "encaminhado" com o ministério', j ->> 'result' = 'encaminhado' AND j ->> 'notes' = 'Encaminhado para Louvor', j::text);
  SELECT count(*) INTO botao FROM get_people_page(p_church_id => c, p_care_status => NULL, p_limit => 50, p_offset => 0) WHERE row_data ? 'care_state';
  INSERT INTO _r VALUES (6, 'lista normal continua devolvendo as linhas', botao = 50, botao::text);
  RESET ROLE;

  -- isolamento: admin de outra igreja não lê os atendimentos de hoje da IGV
  SELECT ur.user_id, ur.church_id INTO r FROM user_roles ur WHERE ur.church_id <> c AND ur.role::text = 'admin' LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', r.user_id, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', r.church_id))::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO vazamento FROM person_attended_today_rows(c);
  RESET ROLE;
  INSERT INTO _r VALUES (7, 'outra igreja não vê os atendimentos de hoje da IGV', vazamento = 0, vazamento::text);
  INSERT INTO _r VALUES (8, 'anon sem acesso à função nova', NOT has_function_privilege('anon', 'person_attended_today_rows(uuid)', 'EXECUTE'), NULL);
END $$;

DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n, teste) FROM _r); END $$;
