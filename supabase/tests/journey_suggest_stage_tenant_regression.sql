-- ============================================================
-- Regressão — journey_suggest_stage: isolamento entre igrejas (migration 20261027200000).
-- Só leitura dentro de transação que termina em EXCEÇÃO PROPOSITAL: nada persiste.
-- Uso: node supabase/tests/run-regression.mjs <este arquivo> [migration]
-- ============================================================
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated, anon;

--@@MIGRATION@@

CREATE FUNCTION pg_temp.como(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated',
    'app_metadata', json_build_object('church_id', p_church))::text, true)::void
$$;

DO $$
DECLARE
  c     constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  adm   constant uuid := '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349';
  p_igv uuid; p_out uuid; c_out uuid; adm_out uuid; r jsonb; esperado jsonb;
BEGIN
  SELECT id INTO p_igv FROM people WHERE church_id = c AND deleted_at IS NULL LIMIT 1;
  SELECT ur.church_id, ur.user_id INTO c_out, adm_out FROM user_roles ur
   WHERE ur.church_id <> c AND ur.role::text = 'admin'
     AND EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.church_id = ur.church_id AND s.is_active)
     AND EXISTS (SELECT 1 FROM people p WHERE p.church_id = ur.church_id) LIMIT 1;
  SELECT id INTO p_out FROM people WHERE church_id = c_out LIMIT 1;

  -- referência: resultado como service_role (comportamento legítimo inalterado)
  PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
  esperado := journey_suggest_stage(p_igv, '{"accepted_jesus": true}');
  INSERT INTO _r VALUES (1, 'service_role continua recebendo a sugestão', esperado ? 'stage_id', esperado ->> 'stage_name');

  PERFORM pg_temp.como(adm, c); SET LOCAL ROLE authenticated;
  r := journey_suggest_stage(p_igv, '{"accepted_jesus": true}'); RESET ROLE;
  INSERT INTO _r VALUES (2, 'usuário da IGV: sugestão da própria igreja idêntica à de antes', r = esperado, r ->> 'stage_name');

  PERFORM pg_temp.como(adm, c); SET LOCAL ROLE authenticated;
  r := journey_suggest_stage(p_igv, '{}'); RESET ROLE;
  INSERT INTO _r VALUES (3, 'usuário da IGV: contexto vazio → primeira etapa', r ? 'stage_id', r ->> 'stage_name');

  BEGIN
    PERFORM pg_temp.como(adm, c); SET LOCAL ROLE authenticated;
    r := journey_suggest_stage(p_out, '{}'); RESET ROLE;
    INSERT INTO _r VALUES (4, 'IGV pedindo pessoa de OUTRA igreja é recusado', false, r::text);
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (4, 'IGV pedindo pessoa de OUTRA igreja é recusado', SQLERRM = 'PERSON_NOT_FOUND', SQLERRM); END;

  BEGIN
    PERFORM pg_temp.como(adm_out, c_out); SET LOCAL ROLE authenticated;
    r := journey_suggest_stage(p_igv, '{}'); RESET ROLE;
    INSERT INTO _r VALUES (5, 'outra igreja pedindo pessoa da IGV é recusada (sem vazar etapas)', false, r::text);
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (5, 'outra igreja pedindo pessoa da IGV é recusada (sem vazar etapas)', SQLERRM = 'PERSON_NOT_FOUND', SQLERRM); END;

  PERFORM pg_temp.como(adm_out, c_out); SET LOCAL ROLE authenticated;
  r := journey_suggest_stage(p_out, '{}'); RESET ROLE;
  INSERT INTO _r VALUES (6, 'outra igreja continua recebendo sugestão das PRÓPRIAS pessoas', r ? 'stage_id', NULL);

  BEGIN
    PERFORM pg_temp.como(adm, c); SET LOCAL ROLE authenticated;
    r := journey_suggest_stage(gen_random_uuid(), '{}'); RESET ROLE;
    INSERT INTO _r VALUES (7, 'pessoa inexistente: mesmo erro PERSON_NOT_FOUND', false, r::text);
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (7, 'pessoa inexistente: mesmo erro PERSON_NOT_FOUND', SQLERRM = 'PERSON_NOT_FOUND', SQLERRM); END;

  INSERT INTO _r VALUES (8, 'anon sem EXECUTE', NOT has_function_privilege('anon', 'journey_suggest_stage(uuid,jsonb)', 'EXECUTE'), NULL);
  INSERT INTO _r VALUES (9, 'authenticated mantém EXECUTE (tela de Atendimento)', has_function_privilege('authenticated', 'journey_suggest_stage(uuid,jsonb)', 'EXECUTE'), NULL);

  BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true); SET LOCAL ROLE anon;
    r := journey_suggest_stage(p_igv, '{}'); RESET ROLE;
    INSERT INTO _r VALUES (10, 'chamada anônima é recusada', false, r::text);
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (10, 'chamada anônima é recusada', SQLERRM ILIKE '%permission denied%' OR SQLERRM = 'PERSON_NOT_FOUND', SQLERRM); END;
END $$;

DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n) FROM _r); END $$;
