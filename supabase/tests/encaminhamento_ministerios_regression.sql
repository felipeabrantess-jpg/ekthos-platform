-- ============================================================
-- Regressão — item 15 (migration 20261027180000): política de encaminhamento, recusa pelo líder, visibilidade.
-- Transação que termina em EXCEÇÃO PROPOSITAL: nada persiste. Pessoas fictícias; contas reais da IGV usadas
-- só como identidade (JWT) dentro da transação desfeita.
-- Uso: node supabase/tests/run-regression.mjs <este arquivo> [migration]
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '240s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated;
CREATE TEMP TABLE _antes ON COMMIT DROP AS SELECT
  (SELECT count(*) FROM person_journey pj JOIN people p ON p.id = pj.person_id WHERE pj.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
     AND pj.closed_at IS NULL AND pj.ministry_id IS NOT NULL AND p.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = pj.person_id AND mm.ministry_id = pj.ministry_id)) pendentes;

--@@MIGRATION@@

CREATE FUNCTION pg_temp.como(p_user uuid, p_church uuid DEFAULT '6c127559-874a-4748-8fce-55d4079613a5') RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
    'app_metadata', json_build_object('church_id', p_church))::text, true)::void
$$;
GRANT EXECUTE ON FUNCTION pg_temp.como(uuid, uuid) TO authenticated;

DO $$
DECLARE
  c       constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  adm     constant uuid := '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349';           -- admin IGV
  lider   constant uuid := '1b0d7654-618e-41e4-bf00-abb58da8aec8';           -- conta vinculada a CADASTRO/ANIVERSÁRIOS
  m_cad   constant uuid := 'ea333869-896c-4117-8e98-acf441ffcc76';           -- CADASTRO/ANIVERSÁRIOS
  m_out   constant uuid := '0298232d-5adc-47f7-b522-d53445528a69';           -- ACOLHIMENTO (sem conta de líder)
  stg     constant uuid := 'e7d0d735-8105-4e49-8662-3dae0286be94';
  sec uuid; a uuid; b uuid; r jsonb; j uuid; n int;
BEGIN
  -- conta "secretaria" fictícia nesta transação: a conta de tesouraria vira secretary (rollback desfaz)
  SELECT user_id INTO sec FROM user_roles WHERE church_id = c AND role::text = 'treasurer' LIMIT 1;
  UPDATE user_roles SET role = 'secretary' WHERE user_id = sec AND church_id = c;

  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Encaminhamento Ficticio A', '+5520990002121', 'manual') RETURNING id INTO a;
  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Encaminhamento Ficticio B', '+5520990002323', 'manual') RETURNING id INTO b;

  -- 1. padrão = só líderes vinculados e administração
  INSERT INTO _r SELECT 1, 'política padrão = líderes e administração',
    (SELECT ministry_referral_policy FROM church_settings WHERE church_id = c) = 'lideres_e_admins', NULL;
  PERFORM pg_temp.como(sec); SET LOCAL ROLE authenticated;
  BEGIN PERFORM journey_register_attendance(p_person_id => a, p_new_stage_id => stg, p_ministry_id => m_cad, p_register_contact => false); RESET ROLE;
    INSERT INTO _r VALUES (2, 'padrão: perfil comum (secretaria) NÃO encaminha', false, 'encaminhou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (2, 'padrão: perfil comum (secretaria) NÃO encaminha', SQLERRM LIKE 'FORBIDDEN_REFERRAL%', SQLERRM); END;
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => a, p_new_stage_id => stg, p_ministry_id => m_cad, p_register_contact => false); RESET ROLE;
  INSERT INTO _r SELECT 19, 'padrão: administração encaminha', EXISTS (SELECT 1 FROM person_journey WHERE person_id = a AND ministry_id = m_cad), NULL;

  -- 2. visibilidade: o líder do destino vê; o admin vê; a secretaria (sem ministério) não vê a fila
  PERFORM pg_temp.como(lider); SET LOCAL ROLE authenticated;
  n := (SELECT count(*) FROM get_ministry_referrals(m_cad) WHERE person_id = a); RESET ROLE;
  INSERT INTO _r VALUES (3, 'líder do ministério de destino vê o encaminhamento', n = 1, n::text);
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated;
  n := (SELECT count(*) FROM get_ministry_referrals(NULL) WHERE person_id = a); RESET ROLE;
  INSERT INTO _r VALUES (4, 'admin vê o encaminhamento', n = 1, n::text);

  -- 3. política "somente líderes": só conta vinculada a ministério encaminha
  PERFORM pg_temp.como(lider); SET LOCAL ROLE authenticated;
  BEGIN PERFORM set_ministry_referral_policy('somente_lideres'); RESET ROLE;
    INSERT INTO _r VALUES (5, 'não-admin não altera a política', false, 'alterou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (5, 'não-admin não altera a política', SQLERRM = 'FORBIDDEN', SQLERRM); END;
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated;
  PERFORM set_ministry_referral_policy('somente_lideres');
  r := get_ministry_referral_policy(); RESET ROLE;
  INSERT INTO _r VALUES (6, 'admin altera para "somente líderes" e passa a não poder encaminhar', r ->> 'policy' = 'somente_lideres' AND NOT (r ->> 'can_refer')::boolean, r::text);
  BEGIN
    PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated;
    PERFORM journey_register_attendance(p_person_id => b, p_new_stage_id => stg, p_ministry_id => m_out, p_register_contact => false); RESET ROLE;
    INSERT INTO _r VALUES (7, '"somente líderes": admin é bloqueado no banco', false, 'encaminhou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (7, '"somente líderes": admin é bloqueado no banco', SQLERRM LIKE 'FORBIDDEN_REFERRAL%', SQLERRM); END;
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => b, p_new_stage_id => stg, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_register_contact => true); RESET ROLE;
  INSERT INTO _r VALUES (8, '"somente líderes": admin continua registrando atendimento SEM encaminhar', person_care_state(b) = 'em_atendimento', person_care_state(b));
  PERFORM pg_temp.como(lider); SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => b, p_ministry_id => m_out, p_register_contact => false); RESET ROLE;
  INSERT INTO _r VALUES (9, '"somente líderes": líder (conta vinculada) encaminha', EXISTS (SELECT 1 FROM person_journey WHERE person_id = b AND ministry_id = m_out AND closed_at IS NULL), NULL);

  -- 4. "líderes e administradores": admin volta a encaminhar; secretaria não
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated; PERFORM set_ministry_referral_policy('lideres_e_admins'); RESET ROLE;
  PERFORM pg_temp.como(sec); SET LOCAL ROLE authenticated;
  BEGIN PERFORM journey_register_attendance(p_person_id => b, p_ministry_id => m_cad, p_register_contact => false); RESET ROLE;
    INSERT INTO _r VALUES (10, '"líderes e admins": secretaria é bloqueada', false, 'encaminhou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (10, '"líderes e admins": secretaria é bloqueada', SQLERRM LIKE 'FORBIDDEN_REFERRAL%', SQLERRM); END;
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated; r := get_ministry_referral_policy(); RESET ROLE;
  INSERT INTO _r VALUES (11, '"líderes e admins": admin pode encaminhar', (r ->> 'can_refer')::boolean, r::text);

  -- 5. recusa pelo líder do destino
  j := (SELECT id FROM person_journey WHERE person_id = a AND closed_at IS NULL);
  PERFORM pg_temp.como(lider); SET LOCAL ROLE authenticated;
  BEGIN PERFORM ministry_referral_decline(j, '  '); RESET ROLE;
    INSERT INTO _r VALUES (12, 'recusa sem motivo é recusada', false, 'aceitou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (12, 'recusa sem motivo é recusada', SQLERRM LIKE 'REASON_REQUIRED%', SQLERRM); END;
  PERFORM pg_temp.como(lider); SET LOCAL ROLE authenticated;
  r := ministry_referral_decline(j, 'Perfil não compatível com o ministério');
  n := (SELECT count(*) FROM get_ministry_referrals(m_cad) WHERE person_id = a); RESET ROLE;
  INSERT INTO _r VALUES (13, 'líder recusa com motivo: sai da fila, atendimento segue aberto, evento registrado',
    n = 0 AND EXISTS (SELECT 1 FROM person_journey WHERE id = j AND closed_at IS NULL AND ministry_id IS NULL)
    AND EXISTS (SELECT 1 FROM journey_events WHERE journey_id = j AND event_type = 'ministry_referral_declined' AND actor_id = lider
                AND payload ->> 'reason' = 'Perfil não compatível com o ministério' AND (payload ->> 'ministry_id')::uuid = m_cad)
    AND EXISTS (SELECT 1 FROM journey_events WHERE journey_id = j AND event_type = 'ministry_referral'), r::text);
  j := (SELECT id FROM person_journey WHERE person_id = b AND closed_at IS NULL);
  PERFORM pg_temp.como(lider); SET LOCAL ROLE authenticated;
  BEGIN PERFORM ministry_referral_decline(j, 'não é meu'); RESET ROLE;
    INSERT INTO _r VALUES (14, 'líder não recusa encaminhamento de outro ministério', false, 'recusou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (14, 'líder não recusa encaminhamento de outro ministério', SQLERRM LIKE 'FORBIDDEN%', SQLERRM); END;
  PERFORM pg_temp.como(adm); SET LOCAL ROLE authenticated; r := ministry_referral_decline(j, 'Ministério sem vaga'); RESET ROLE;
  INSERT INTO _r VALUES (15, 'admin recusa em qualquer ministério', EXISTS (SELECT 1 FROM person_journey WHERE id = j AND ministry_id IS NULL), NULL);

  -- 6. isolamento
  PERFORM pg_temp.como(adm, (SELECT id FROM churches WHERE id <> c ORDER BY created_at LIMIT 1)); SET LOCAL ROLE authenticated;
  BEGIN PERFORM ministry_referral_decline((SELECT id FROM person_journey WHERE person_id = a), 'x'); RESET ROLE;
    INSERT INTO _r VALUES (16, 'isolamento: outra igreja não recusa encaminhamento da IGV', false, 'recusou');
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (16, 'isolamento: outra igreja não recusa encaminhamento da IGV', SQLERRM LIKE 'JOURNEY_NOT_FOUND%' OR SQLERRM LIKE 'FORBIDDEN%', SQLERRM); END;
  INSERT INTO _r VALUES (17, 'anon sem acesso às funções novas',
    NOT has_function_privilege('anon', 'ministry_referral_decline(uuid,text)', 'EXECUTE') AND NOT has_function_privilege('anon', 'set_ministry_referral_policy(text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'can_refer_to_ministry(uuid)', 'EXECUTE'), NULL);
  -- 7. os pendentes reais não foram tocados pela migration
  INSERT INTO _r SELECT 18, 'os encaminhamentos pendentes reais continuam iguais', (SELECT pendentes FROM _antes) =
    (SELECT count(*) FROM person_journey pj JOIN people p ON p.id = pj.person_id WHERE pj.church_id = c AND pj.closed_at IS NULL AND pj.ministry_id IS NOT NULL
       AND p.deleted_at IS NULL AND p.id NOT IN (a, b) AND NOT EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = pj.person_id AND mm.ministry_id = pj.ministry_id)),
    (SELECT pendentes FROM _antes)::text;
END $$;

DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n) FROM _r); END $$;
