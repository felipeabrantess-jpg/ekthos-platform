-- ============================================================
-- Regressão — autorização de journey_register_attendance (migration 20261005120000)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Pessoas sintéticas (ZZ-AUTH).
-- Perfis: usa contas REAIS da IGV só como identidade; os perfis que não existem na IGV
-- (pastor_celulas, supervisor, secretary, volunteer, ministry_leader) são simulados
-- trocando temporariamente o role de uma conta — dentro da transação, desfeito no ROLLBACK.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1, '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid u_admin, '358cf292-5890-4570-9bc5-dd2f154dd208'::uuid u_admdep,
       '1b0d7654-618e-41e4-bf00-abb58da8aec8'::uuid u_cell, '48338f75-b6e8-40c4-871a-5f1193b18af9'::uuid u_treas,
       '08e6cf64-faf5-4d7d-b8c5-54de30bfda7a'::uuid u_var,     -- conta cujo perfil é trocado por teste
       '579d0f7b-9b8b-4c20-94c5-513b4a424642'::uuid u_outra,   -- admin Ekthos atuando em OUTRA igreja (demo)
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY order_index LIMIT 1) stage,
       NULL::uuid p, NULL::uuid p2, NULL::uuid m;
GRANT ALL ON _r, _c TO authenticated, anon;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

INSERT INTO people (church_id, name, source, city) SELECT c1, 'ZZ-AUTH Pessoa', 'manual', 'Niterói' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-AUTH Pessoa 2', 'manual' FROM _c;
INSERT INTO ministries (church_id, name, slug, leader_user_id) SELECT c1, 'ZZ-AUTH Min', 'zz-auth-min', u_cell FROM _c;
UPDATE _c SET p = (SELECT id FROM people WHERE name = 'ZZ-AUTH Pessoa'), p2 = (SELECT id FROM people WHERE name = 'ZZ-AUTH Pessoa 2'), m = (SELECT id FROM ministries WHERE slug = 'zz-auth-min');

CREATE FUNCTION pg_temp.login(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', p_church))::text, true)
$$;
-- tenta registrar contato na pessoa p como o usuário logado; devolve 'ACEITO' ou o erro
CREATE FUNCTION pg_temp.tenta(p_person uuid, p_updates jsonb DEFAULT '{}'::jsonb, p_register boolean DEFAULT true) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  PERFORM journey_register_attendance(p_person_id => p_person, p_new_stage_id => (SELECT stage FROM _c), p_contact_channel => 'whatsapp',
    p_contact_result => 'realizado', p_contact_notes => 'teste', p_people_updates => p_updates, p_register_contact => p_register);
  RETURN 'ACEITO';
EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE || ' ' || left(SQLERRM, 60);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.tenta(uuid, jsonb, boolean) TO authenticated, anon;

INSERT INTO _r SELECT 0, 'grants finais: EXECUTE só para authenticated e service_role (sem PUBLIC/anon)',
  string_agg(grantee, ',' ORDER BY grantee) = 'authenticated,postgres,service_role', string_agg(grantee, ',' ORDER BY grantee)
  FROM information_schema.routine_privileges WHERE routine_name = 'journey_register_attendance' AND privilege_type = 'EXECUTE';

-- ── 1–6. perfis PERMITIDOS da própria igreja ────────────────
DO $$
DECLARE c record; r text; n0 int;
BEGIN
  SELECT * INTO c FROM _c;
  PERFORM pg_temp.login(c.u_admin, c.c1); SET LOCAL ROLE authenticated;
  r := pg_temp.tenta(c.p); RESET ROLE;
  INSERT INTO _r VALUES (1, 'admin da própria igreja → permitido', r = 'ACEITO', r);
  PERFORM pg_temp.login(c.u_admdep, c.c1); SET LOCAL ROLE authenticated;
  r := pg_temp.tenta(c.p); RESET ROLE;
  INSERT INTO _r VALUES (2, 'admin_departments → permitido', r = 'ACEITO', r);
  PERFORM pg_temp.login(c.u_cell, c.c1); SET LOCAL ROLE authenticated;
  r := pg_temp.tenta(c.p); RESET ROLE;
  INSERT INTO _r VALUES (5, 'cell_leader → permitido', r = 'ACEITO', r);
  FOR r IN SELECT unnest(ARRAY['pastor_celulas','supervisor','secretary']) LOOP
    UPDATE user_roles SET role = r::app_role WHERE user_id = c.u_var AND church_id = c.c1;
    PERFORM pg_temp.login(c.u_var, c.c1); SET LOCAL ROLE authenticated;
    INSERT INTO _r VALUES (CASE r WHEN 'pastor_celulas' THEN 3 WHEN 'supervisor' THEN 4 ELSE 6 END, r || ' → permitido', pg_temp.tenta(c.p) = 'ACEITO', pg_temp.tenta(c.p));
    RESET ROLE;
  END LOOP;
  SELECT count(*) INTO n0 FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = c.p AND je.event_type = 'pastoral_contact';
  INSERT INTO _r VALUES (16, 'fluxo normal: contatos registrados pelos perfis permitidos (ilimitados, sequência 1..N)', n0 >= 6, n0 || ' contatos');
END $$;
RESET ROLE;

-- fotografia da pessoa/jornada ANTES das tentativas negadas
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT md5(x::text) FROM (SELECT name, phone, city, neighborhood, observacoes_pastorais, pipeline_stage_id FROM people WHERE id = (SELECT p FROM _c)) x) pessoa_md5,
       (SELECT md5(x::text) FROM (SELECT stage_id, closed_at, outcome, version, next_step, ministry_id FROM person_journey WHERE person_id = (SELECT p FROM _c)) x) jornada_md5,
       (SELECT count(*) FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = (SELECT p FROM _c)) eventos,
       (SELECT count(*) FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = (SELECT p FROM _c) AND je.event_type = 'pastoral_contact') contatos;

-- ── 7–12. NEGADOS ────────────────────────────────────────────
DO $$
DECLARE c record; r text;
BEGIN
  SELECT * INTO c FROM _c;
  PERFORM pg_temp.login(c.u_outra, c.c2); SET LOCAL ROLE authenticated;
  r := pg_temp.tenta(c.p, '{"city":"INVADIDA"}'::jsonb); RESET ROLE;
  INSERT INTO _r VALUES (7, 'admin de OUTRA igreja em pessoa da IGV → NEGADO (42501)', r LIKE '42501%', r);
  PERFORM pg_temp.login(c.u_treas, c.c1); SET LOCAL ROLE authenticated;
  r := pg_temp.tenta(c.p); RESET ROLE;
  INSERT INTO _r VALUES (8, 'tesoureiro → NEGADO', r LIKE '42501%', r);
  FOR r IN SELECT unnest(ARRAY['volunteer','ministry_leader']) LOOP
    UPDATE user_roles SET role = r::app_role WHERE user_id = c.u_var AND church_id = c.c1;
    PERFORM pg_temp.login(c.u_var, c.c1); SET LOCAL ROLE authenticated;
    INSERT INTO _r VALUES (CASE r WHEN 'volunteer' THEN 9 ELSE 10 END, r || ' → NEGADO', pg_temp.tenta(c.p) LIKE '42501%', pg_temp.tenta(c.p));
    RESET ROLE;
  END LOOP;
  -- usuário autenticado sem nenhum perfil na igreja
  PERFORM pg_temp.login(gen_random_uuid(), c.c1); SET LOCAL ROLE authenticated;
  r := pg_temp.tenta(c.p); RESET ROLE;
  INSERT INTO _r VALUES (12, 'autenticado sem perfil na igreja → NEGADO', r LIKE '42501%', r);
END $$;
RESET ROLE;
-- 11. anon (sem login): a função nem pode ser executada
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
DO $$
DECLARE c record; r text; r2 text;
BEGIN
  SELECT * INTO c FROM _c;
  r  := pg_temp.tenta(c.p, '{"city":"ANONIMO"}'::jsonb, true);
  r2 := pg_temp.tenta(c.p, '{"city":"ANONIMO2"}'::jsonb, false);
  INSERT INTO _r VALUES (11, 'anon registrando contato → NEGADO (permission denied)', r LIKE '42501%', r);
  INSERT INTO _r VALUES (14, 'anon com p_register_contact=false (só dados) → NEGADO', r2 LIKE '42501%', r2);
END $$;
RESET ROLE;
-- 12b. chamada sem sessão alguma (claims vazios, role authenticated)
SELECT set_config('request.jwt.claims', '', true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r text;
BEGIN
  r := pg_temp.tenta((SELECT p FROM _c));
  INSERT INTO _r VALUES (12, 'sessão sem usuário (auth.uid() nulo) → NEGADO', r LIKE '42501%', r);
END $$;
RESET ROLE;

-- ── 13. nada mudou com as tentativas negadas ─────────────────
INSERT INTO _r SELECT 13, 'tentativas negadas não alteraram pessoa, jornada, contatos nem eventos',
  (SELECT md5(x::text) FROM (SELECT name, phone, city, neighborhood, observacoes_pastorais, pipeline_stage_id FROM people WHERE id = (SELECT p FROM _c)) x) = s.pessoa_md5
  AND (SELECT md5(x::text) FROM (SELECT stage_id, closed_at, outcome, version, next_step, ministry_id FROM person_journey WHERE person_id = (SELECT p FROM _c)) x) = s.jornada_md5
  AND (SELECT count(*) FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = (SELECT p FROM _c)) = s.eventos
  AND (SELECT count(*) FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = (SELECT p FROM _c) AND je.event_type = 'pastoral_contact') = s.contatos
  AND (SELECT city = 'Niterói' FROM people WHERE id = (SELECT p FROM _c)), s.contatos || ' contatos, ' || s.eventos || ' eventos' FROM _snap s;

-- ── 15–20. fluxos legítimos continuam iguais ─────────────────
SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; n0 int; n1 int; j jsonb;
BEGIN
  SELECT * INTO c FROM _c;
  -- 15. salvar sem contato
  SELECT count(*) INTO n0 FROM get_person_contacts(c.p2);
  PERFORM journey_register_attendance(p_person_id => c.p2, p_new_stage_id => c.stage, p_register_contact => false, p_people_updates => '{"city":"São Gonçalo"}'::jsonb, p_next_step => 'ligar');
  SELECT count(*) INTO n1 FROM get_person_contacts(c.p2);
  INSERT INTO _r VALUES (15, 'salvar sem contato → dados/etapa/próximo passo salvos, zero contato (item 10)', n1 = n0 AND (SELECT city = 'São Gonçalo' FROM people WHERE id = c.p2) AND (SELECT next_step = 'ligar' AND closed_at IS NULL FROM person_journey WHERE person_id = c.p2), n1::text);
  INSERT INTO _r VALUES (19, 'item 13: jornada aberta → Em atendimento', person_care_state(c.p2) = 'em_atendimento', person_care_state(c.p2));
  -- 16/17. registrar contato + encaminhamento (notificação para leader_user_id)
  PERFORM journey_register_attendance(p_person_id => c.p2, p_contact_channel => 'presencial', p_contact_result => 'encaminhado', p_ministry_id => c.m, p_register_contact => true);
  INSERT INTO _r VALUES (16, 'registrar contato → exatamente +1', (SELECT count(*) FROM get_person_contacts(c.p2)) = n0 + 1, NULL);
  INSERT INTO _r VALUES (17, 'encaminhamento para Ministério continua (evento + ministry_id na jornada)',
    (SELECT ministry_id = c.m FROM person_journey WHERE person_id = c.p2) AND EXISTS (SELECT 1 FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = c.p2 AND je.event_type = 'ministry_referral'), NULL);
  -- 20. finalizar e reabrir
  PERFORM journey_register_attendance(p_person_id => c.p2, p_contact_channel => 'whatsapp', p_contact_result => 'nao_quer_contato', p_register_contact => true);
  INSERT INTO _r VALUES (19, 'item 13: finalizar negativo → Cancelado', person_care_state(c.p2) = 'cancelado', NULL);
  j := journey_reopen((SELECT id FROM person_journey WHERE person_id = c.p2), 'engano');
  INSERT INTO _r VALUES (20, 'reabertura continua funcionando → Em atendimento', j->>'care_state' = 'em_atendimento' AND person_care_state(c.p2) = 'em_atendimento', NULL);
END $$;
RESET ROLE;
INSERT INTO _r SELECT 17, 'notificação do encaminhamento foi para leader_user_id', count(*) = 1 AND bool_and(user_id = (SELECT u_cell FROM _c)), count(*)::text FROM notifications WHERE person_id = (SELECT p2 FROM _c) AND type = 'ministry_referral';
-- service_role continua podendo (chamadas internas)
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO _r SELECT 0, 'service_role continua permitido (chamada interna, sem usuário)', pg_temp.tenta((SELECT p2 FROM _c), '{}'::jsonb, false) = 'ACEITO', NULL;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
