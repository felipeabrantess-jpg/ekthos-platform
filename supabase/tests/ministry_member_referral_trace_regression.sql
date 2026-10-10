-- ============================================================
-- Regressão — item 19 da ata IGV: origem do encaminhamento preservada ao incluir no ministério
-- (migration 20261010130000). Roda em BEGIN … ROLLBACK; dados sintéticos (ZZ-ORIGEM).
-- Contas reais da IGV só como identidade (nenhuma é alterada).
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1, '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid u_admin,
       '1b0d7654-618e-41e4-bf00-abb58da8aec8'::uuid u_lider,
       '48338f75-b6e8-40c4-871a-5f1193b18af9'::uuid u_comum,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY order_index LIMIT 1) stage,
       NULL::uuid m_a, NULL::uuid m_b, NULL::uuid p1, NULL::uuid p2, NULL::uuid p_out;
GRANT ALL ON _r, _c TO authenticated, anon;
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT count(*) FROM ministry_members) mm,
       (SELECT md5(coalesce(string_agg(md5(v::text), '' ORDER BY v.id), '')) FROM volunteers v) vol,
       (SELECT count(*) FROM journey_events) ev;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

INSERT INTO ministries (church_id, name, slug, leader_user_id) SELECT c1, 'ZZ-ORIGEM A', 'zz-origem-a', u_lider FROM _c;
INSERT INTO ministries (church_id, name, slug) SELECT c1, 'ZZ-ORIGEM B', 'zz-origem-b' FROM _c;
UPDATE _c SET m_a = (SELECT id FROM ministries WHERE slug = 'zz-origem-a'), m_b = (SELECT id FROM ministries WHERE slug = 'zz-origem-b');
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-ORIGEM Pessoa 1', 'manual' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-ORIGEM Pessoa 2 (sem encaminhamento)', 'manual' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c2, 'ZZ-ORIGEM Outra igreja', 'manual' FROM _c;
UPDATE _c SET p1 = (SELECT id FROM people WHERE name = 'ZZ-ORIGEM Pessoa 1'),
              p2 = (SELECT id FROM people WHERE name LIKE 'ZZ-ORIGEM Pessoa 2%'),
              p_out = (SELECT id FROM people WHERE name = 'ZZ-ORIGEM Outra igreja');

CREATE FUNCTION pg_temp.login(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', p_church))::text, true)
$$;

-- admin encaminha a pessoa 1 ao ministério A pelo fluxo real do Atendimento
SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record;
BEGIN
  SELECT * INTO c FROM _c;
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => c.p1, p_contact_channel => 'whatsapp', p_contact_result => 'encaminhado', p_new_stage_id => c.stage, p_ministry_id => c.m_a);
  INSERT INTO _r VALUES (0, 'encaminhamento registrado pelo Atendimento (ator persistido)',
    (SELECT je.actor_id = c.u_admin FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = c.p1 AND je.event_type = 'ministry_referral' ORDER BY je.created_at DESC LIMIT 1), NULL);
END $$;
RESET ROLE;

-- líder (conta vinculada ao A) inclui a pessoa 1 e a pessoa 2 (sem encaminhamento)
SELECT pg_temp.login((SELECT u_lider FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; j jsonb; o record; r text;
BEGIN
  SELECT * INTO c FROM _c;
  j := ministry_member_add(c.m_a, c.p1);
  INSERT INTO _r VALUES (1, 'inclusão continua funcionando e devolve o mesmo formato', (j->>'inserted')::boolean AND j ? 'ministry_id' AND j ? 'person_id', j::text);
  SELECT * INTO o FROM ministry_members WHERE ministry_id = c.m_a AND person_id = c.p1;
  INSERT INTO _r VALUES (2, 'origem gravada: quem encaminhou (admin), quando e o evento', o.referred_by = c.u_admin AND o.referred_at IS NOT NULL AND o.referral_event_id IS NOT NULL, o.referred_by::text);
  INSERT INTO _r VALUES (3, 'quem incluiu (líder) fica registrado', o.added_by = c.u_lider, o.added_by::text);
  j := ministry_member_add(c.m_a, c.p2);
  SELECT * INTO o FROM ministry_members WHERE ministry_id = c.m_a AND person_id = c.p2;
  INSERT INTO _r VALUES (4, 'sem encaminhamento: origem fica NULL (nada é inventado), inclusão registrada', o.referred_by IS NULL AND o.referred_at IS NULL AND o.referral_event_id IS NULL AND o.added_by = c.u_lider, NULL);
  j := ministry_member_add(c.m_a, c.p1);
  INSERT INTO _r VALUES (5, '2ª inclusão não duplica nem sobrescreve a origem',
    NOT (j->>'inserted')::boolean
    AND (SELECT count(*) FROM ministry_members WHERE ministry_id = c.m_a AND person_id = c.p1) = 1
    AND (SELECT referred_by = c.u_admin AND added_by = c.u_lider FROM ministry_members WHERE ministry_id = c.m_a AND person_id = c.p1), j::text);
  INSERT INTO _r SELECT 6, 'get_ministry_member_origins devolve quem encaminhou e quem incluiu',
    count(*) = 2 AND bool_or(x.person_id = c.p1 AND x.referred_by_name IS NOT NULL AND x.added_by_name IS NOT NULL)
    AND bool_or(x.person_id = c.p2 AND x.referred_by_name IS NULL),
    string_agg(coalesce(x.referred_by_name, '-') || '/' || coalesce(x.added_by_name, '-'), ' ; ') FROM get_ministry_member_origins(c.m_a) x;
  BEGIN PERFORM ministry_member_add(c.m_b, c.p1); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (7, 'líder não inclui em ministério que não administra', r = '42501', r);
  BEGIN PERFORM * FROM get_ministry_member_origins(c.m_b); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (8, 'líder não lê a origem de ministério que não administra', r = '42501', r);
  BEGIN j := ministry_member_add(c.m_a, c.p_out); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (9, 'pessoa de outra igreja continua recusada', r = 'P0002', r);
END $$;
RESET ROLE;

-- usuário comum e outra igreja não leem a origem
SELECT pg_temp.login((SELECT u_comum FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; r text;
BEGIN
  SELECT * INTO c FROM _c;
  BEGIN PERFORM * FROM get_ministry_member_origins(c.m_a); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (10, 'usuário comum não lê a origem', r = '42501', r);
END $$;
RESET ROLE;

SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c2 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; r text; n int;
BEGIN
  SELECT * INTO c FROM _c;
  BEGIN SELECT count(*) INTO n FROM get_ministry_member_origins(c.m_a); r := 'n=' || n; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (11, 'admin atuando em outra igreja não vê a origem da IGV', r IN ('n=0', '42501'), r);
END $$;
RESET ROLE;

SET LOCAL ROLE anon;
DO $$
DECLARE r text;
BEGIN
  BEGIN PERFORM * FROM get_ministry_member_origins((SELECT m_a FROM _c)); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (12, 'anon não executa get_ministry_member_origins', r = '42501', r);
END $$;
RESET ROLE;

-- preservação
INSERT INTO _r SELECT 13, 'volunteers idêntico',
  (SELECT md5(coalesce(string_agg(md5(v::text), '' ORDER BY v.id), '')) FROM volunteers v) = s.vol, NULL FROM _snap s;
INSERT INTO _r SELECT 14, 'vínculos reais preexistentes sem origem inventada (só os sintéticos foram criados)',
  (SELECT count(*) FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id WHERE m.slug NOT LIKE 'zz-origem-%') = s.mm
  AND (SELECT count(*) FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id
       WHERE m.slug NOT LIKE 'zz-origem-%' AND (mm.referred_by IS NOT NULL OR mm.added_by IS NOT NULL)) = 0, s.mm::text FROM _snap s;
INSERT INTO _r SELECT 15, 'a inclusão não gera evento de jornada (só o encaminhamento sintético)',
  (SELECT count(*) FROM journey_events) - s.ev BETWEEN 0 AND 3, ((SELECT count(*) FROM journey_events) - s.ev)::text FROM _snap s;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
