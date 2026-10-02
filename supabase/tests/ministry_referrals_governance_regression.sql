-- ============================================================
-- Regressão — item 15: governança da fila de encaminhamentos (migration 20261005100000)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Ministérios/pessoas sintéticos (ZZ-FILA).
-- Usa contas REAIS da IGV só como identidade (nenhuma é alterada):
--   admin, admin_departments, uma conta "líder" (vinculada via leader_user_id ao ministério
--   sintético A) e uma conta comum.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1, '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid u_admin,
       '358cf292-5890-4570-9bc5-dd2f154dd208'::uuid u_admdep,
       '1b0d7654-618e-41e4-bf00-abb58da8aec8'::uuid u_lider,     -- conta que será vinculada ao ministério A
       '48338f75-b6e8-40c4-871a-5f1193b18af9'::uuid u_comum,     -- conta sem vínculo com ministério
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY order_index LIMIT 1) stage,
       NULL::uuid m_a, NULL::uuid m_b, NULL::uuid m_out, NULL::uuid p1, NULL::uuid p2, NULL::uuid p3, NULL::uuid p_lider_b;
GRANT ALL ON _r, _c TO authenticated;

CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT md5(coalesce(string_agg(md5(v::text), '' ORDER BY v.id), '')) FROM volunteers v) volunteers_md5,
       (SELECT count(*) FROM volunteers) volunteers, (SELECT count(*) FROM ministry_members) ministry_members,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, leader_id, leader_user_id, is_active FROM ministries) x) ministries_md5,
       (SELECT count(*) FROM notifications) notifications, (SELECT count(*) FROM journey_events) journey_events;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- ── Cenário sintético ────────────────────────────────────────
INSERT INTO ministries (church_id, name, slug, leader_user_id) SELECT c1, 'ZZ-FILA A (com conta)', 'zz-fila-a', u_lider FROM _c;
INSERT INTO ministries (church_id, name, slug) SELECT c1, 'ZZ-FILA B (só pessoa líder)', 'zz-fila-b' FROM _c;
INSERT INTO ministries (church_id, name, slug) SELECT c2, 'ZZ-FILA Outra Igreja', 'zz-fila-outra' FROM _c;
UPDATE _c SET m_a = (SELECT id FROM ministries WHERE slug = 'zz-fila-a'), m_b = (SELECT id FROM ministries WHERE slug = 'zz-fila-b'), m_out = (SELECT id FROM ministries WHERE slug = 'zz-fila-outra');
-- ministério B: tem PESSOA líder (leader_id) cujo e-mail é o MESMO da conta "líder" — e nenhuma conta vinculada.
-- Pela regra antiga (ponte por e-mail) essa conta veria a fila de B e receberia a notificação.
INSERT INTO people (church_id, name, source, email) SELECT c1, 'ZZ-FILA Pessoa Líder B', 'manual', (SELECT email FROM auth.users WHERE id = u_lider) FROM _c;
UPDATE _c SET p_lider_b = (SELECT id FROM people WHERE name = 'ZZ-FILA Pessoa Líder B');
UPDATE ministries SET leader_id = (SELECT p_lider_b FROM _c) WHERE id = (SELECT m_b FROM _c);
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-FILA Pessoa 1', 'manual' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-FILA Pessoa 2', 'manual' FROM _c;
INSERT INTO people (church_id, name, source) SELECT c1, 'ZZ-FILA Pessoa 3', 'manual' FROM _c;
UPDATE _c SET p1 = (SELECT id FROM people WHERE name = 'ZZ-FILA Pessoa 1'), p2 = (SELECT id FROM people WHERE name = 'ZZ-FILA Pessoa 2'), p3 = (SELECT id FROM people WHERE name = 'ZZ-FILA Pessoa 3');

CREATE FUNCTION pg_temp.login(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', p_church))::text, true)
$$;

-- ── Encaminhamentos criados pelo fluxo real do Atendimento (como admin) ──
SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; n0 int; n1 int;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT count(*) INTO n0 FROM notifications WHERE type = 'ministry_referral';
  -- Pessoa 1 e 2 → ministério A (com conta vinculada)
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => c.p1, p_contact_channel => 'whatsapp', p_contact_result => 'encaminhado', p_new_stage_id => c.stage, p_ministry_id => c.m_a);
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => c.p2, p_contact_channel => 'whatsapp', p_contact_result => 'encaminhado', p_new_stage_id => c.stage, p_ministry_id => c.m_a);
  -- Pessoa 3 → ministério B (pessoa líder com e-mail igual ao da conta, SEM conta vinculada)
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => c.p3, p_contact_channel => 'whatsapp', p_contact_result => 'encaminhado', p_new_stage_id => c.stage, p_ministry_id => c.m_b);
  INSERT INTO _r VALUES (9, 'o encaminhamento e o contato continuam registrados na jornada (Atendimento intacto)',
    (SELECT count(*) FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = c.p3 AND je.event_type = 'ministry_referral') = 1
    AND (SELECT count(*) FROM get_person_contacts(c.p3)) = 1, NULL);

  -- 1. admin vê todas as filas
  INSERT INTO _r SELECT 1, 'admin vê todas as filas (A e B) e filtra por ministério',
    (SELECT count(*) FILTER (WHERE ministry_id = c.m_a) = 2 AND count(*) FILTER (WHERE ministry_id = c.m_b) = 1 FROM get_ministry_referrals(NULL))
    AND (SELECT count(*) = 1 AND bool_and(ministry_id = c.m_b) FROM get_ministry_referrals(c.m_b)),
    (SELECT count(*)::text || ' encaminhamentos visíveis no total' FROM get_ministry_referrals(NULL));
END $$;
RESET ROLE;

-- 8–9. destinatário da notificação (conferido fora da RLS: cada usuário só enxerga as próprias)
INSERT INTO _r SELECT 8, 'notificação do encaminhamento vai para a conta vinculada (leader_user_id)',
  count(*) = 2 AND bool_and(n.user_id = c.u_lider AND n.church_id = c.c1 AND n.type = 'ministry_referral'), count(*)::text || ' notificações'
  FROM notifications n, _c c WHERE n.person_id IN (c.p1, c.p2);
INSERT INTO _r SELECT 9, 'ministério sem leader_user_id: ninguém é notificado (nem a conta de e-mail coincidente)',
  (SELECT count(*) FROM notifications n WHERE n.person_id = c.p3) = 0
  AND (SELECT count(*) FROM notifications) = s.notifications + 2, NULL FROM _c c, _snap s;

-- 2. admin_departments vê todas
SELECT pg_temp.login((SELECT u_admdep FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
INSERT INTO _r SELECT 2, 'admin_departments vê todas as filas',
  count(*) FILTER (WHERE ministry_id = c.m_a) = 2 AND count(*) FILTER (WHERE ministry_id = c.m_b) = 1, count(*)::text
  FROM get_ministry_referrals(NULL), _c c;
RESET ROLE;

-- 3–7, 10–12. conta vinculada (leader_user_id)
SELECT pg_temp.login((SELECT u_lider FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; r text; j jsonb; ev0 int; ev1 int;
BEGIN
  SELECT * INTO c FROM _c;
  INSERT INTO _r SELECT 3, 'conta vinculada vê a fila do SEU ministério', count(*) = 2 AND bool_and(ministry_id = c.m_a), count(*)::text FROM get_ministry_referrals(NULL);
  INSERT INTO _r SELECT 4, 'conta vinculada NÃO vê fila de outro ministério (nem pedindo pelo id)', count(*) = 0, count(*)::text FROM get_ministry_referrals(c.m_b);
  INSERT INTO _r SELECT 6, 'e-mail coincidente com o da pessoa líder NÃO concede acesso (ponte por e-mail removida)',
    NOT EXISTS (SELECT 1 FROM get_ministry_referrals(NULL) WHERE ministry_id = c.m_b) AND NOT can_manage_ministry(c.m_b)
    AND is_ministry_leader_of(c.m_b), 'pela regra antiga (is_ministry_leader_of) esta conta veria B';
  INSERT INTO _r SELECT 7, 'leader_id sem leader_user_id não concede acesso a ninguém além da administração', NOT can_manage_ministry(c.m_b), NULL;

  -- 10–12. aceitar = incluir no ministério pela RPC existente
  SELECT count(*) INTO ev0 FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = c.p1;
  j := ministry_member_add(c.m_a, c.p1);
  INSERT INTO _r VALUES (10, 'líder inclui a pessoa pelo ministry_member_add', (j->>'inserted')::boolean, j::text);
  j := ministry_member_add(c.m_a, c.p1);
  INSERT INTO _r VALUES (11, 'pessoa entra uma única vez (2ª chamada não duplica)',
    NOT (j->>'inserted')::boolean AND (SELECT count(*) FROM ministry_members WHERE ministry_id = c.m_a AND person_id = c.p1) = 1, j::text);
  INSERT INTO _r SELECT 12, 'incluída → sai da fila; o outro encaminhamento do ministério continua',
    count(*) = 1 AND bool_and(person_id = c.p2), string_agg(person_name, ',') FROM get_ministry_referrals(NULL);
  SELECT count(*) INTO ev1 FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = c.p1;
  INSERT INTO _r VALUES (12, 'histórico preservado: jornada aberta e eventos da pessoa intactos após a inclusão',
    ev1 = ev0 AND (SELECT closed_at IS NULL AND ministry_id = c.m_a FROM person_journey WHERE person_id = c.p1), ev0 || ' eventos');
  BEGIN j := ministry_member_add(c.m_b, c.p3); r := 'ACEITO';
  EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (10, 'líder NÃO consegue incluir pessoa em ministério que não administra', r <> 'ACEITO', r);
END $$;
RESET ROLE;

-- 5. usuário comum
SELECT pg_temp.login((SELECT u_comum FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
INSERT INTO _r SELECT 5, 'usuário comum (sem vínculo) não vê nenhuma fila', count(*) = 0, count(*)::text FROM get_ministry_referrals(NULL);
INSERT INTO _r SELECT 5, 'usuário comum não vê fila nem pedindo um ministério específico', count(*) = 0, count(*)::text FROM get_ministry_referrals((SELECT m_a FROM _c));
RESET ROLE;

-- 14. isolamento entre igrejas
SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c2 FROM _c));
SET LOCAL ROLE authenticated;
INSERT INTO _r SELECT 14, 'usuário atuando em outra igreja não vê encaminhamentos da IGV', count(*) FILTER (WHERE ministry_id IN (c.m_a, c.m_b)) = 0, count(*)::text FROM get_ministry_referrals(NULL), _c c;
RESET ROLE;
SELECT pg_temp.login((SELECT u_lider FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
INSERT INTO _r SELECT 14, 'conta da IGV não gerencia ministério de outra igreja', NOT can_manage_ministry(c.m_out) AND (SELECT count(*) FROM get_ministry_referrals(c.m_out)) = 0, NULL FROM _c c;
RESET ROLE;

-- ── Preservação ──────────────────────────────────────────────
INSERT INTO _r SELECT 13, 'volunteers idêntico', (SELECT md5(coalesce(string_agg(md5(v::text), '' ORDER BY v.id), '')) FROM volunteers v) = s.volunteers_md5 AND (SELECT count(*) FROM volunteers) = s.volunteers, s.volunteers::text FROM _snap s;
INSERT INTO _r SELECT 15, 'ministérios reais intactos (leader_id / leader_user_id não foram alterados nem criados)',
  (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, leader_id, leader_user_id, is_active FROM ministries WHERE slug NOT LIKE 'zz-fila-%') x) = s.ministries_md5, NULL FROM _snap s;
INSERT INTO _r SELECT 15, 'ministry_members reais intactos (só o vínculo sintético do teste foi criado)',
  (SELECT count(*) FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id WHERE m.slug NOT LIKE 'zz-fila-%') = s.ministry_members, s.ministry_members::text FROM _snap s;
INSERT INTO _r SELECT 15, 'a função de fila não usa mais e-mail nem is_ministry_leader_of; a notificação não lê auth.users',
  (SELECT prosrc NOT ILIKE '%is_ministry_leader_of%' AND prosrc NOT ILIKE '%email%' AND prosrc ILIKE '%can_manage_ministry%' FROM pg_proc WHERE proname = 'get_ministry_referrals')
  AND (SELECT prosrc NOT ILIKE '%auth.users%' AND prosrc ILIKE '%m.leader_user_id%' FROM pg_proc WHERE proname = 'journey_register_attendance'), NULL;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
