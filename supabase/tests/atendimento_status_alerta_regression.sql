-- ============================================================
-- Regressão — STATUS e alerta do Atendimento (migration 20261027120000)
-- Transação que termina em EXCEÇÃO PROPOSITAL: nada persiste. Pessoa fictícia criada dentro dela.
-- Chamadas como o admin da IGV (role authenticated + JWT). Nenhum gatilho de rede é acionado.
-- Uso: node supabase/tests/run-regression.mjs <este arquivo> <migration>   (antes de publicar)
--      node supabase/tests/run-regression.mjs <este arquivo>               (depois de publicar)
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '280s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _antes (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON _r, _antes TO authenticated;

CREATE FUNCTION pg_temp.csv_total(p_status text, p_contact text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE r jsonb; ac timestamptz; ai uuid; tot int := 0;
BEGIN
  LOOP
    r := export_people_rows_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_care_status => p_status, p_contact => p_contact,
                                 p_after_created_at => ac, p_after_id => ai, p_limit => 2000);
    tot := tot + (r ->> 'count')::int;
    EXIT WHEN NOT (r ->> 'has_more')::boolean;
    ac := (r ->> 'next_after_created_at')::timestamptz; ai := (r ->> 'next_after_id')::uuid;
  END LOOP;
  RETURN tot;
END $$;
CREATE FUNCTION pg_temp.page_total(p_status text, p_contact text) RETURNS bigint LANGUAGE sql AS $$
  SELECT COALESCE((SELECT total_count FROM get_people_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_care_status => p_status, p_contact => p_contact, p_limit => 1) LIMIT 1), 0)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.csv_total(text, text), pg_temp.page_total(text, text) TO authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', 'role', 'authenticated',
  'app_metadata', json_build_object('church_id', '6c127559-874a-4748-8fce-55d4079613a5'))::text, true);

-- ── ANTES ───────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
INSERT INTO _antes VALUES
  ('counts', get_care_status_counts(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5')::text),
  ('com_contato', pg_temp.page_total(NULL, 'com_contato')::text),
  ('lista_total', pg_temp.page_total(NULL, NULL)::text);
RESET ROLE;

--@@MIGRATION@@

DO $$
DECLARE
  c   constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  stg constant uuid := 'e7d0d735-8105-4e49-8662-3dae0286be94';
  min_cad constant uuid := 'ea333869-896c-4117-8e98-acf441ffcc76';
  a jsonb := (SELECT v::jsonb FROM _antes WHERE k = 'counts');
  d jsonb; pid uuid; pid2 uuid; r jsonb; err text; n int; nn int;
BEGIN
  SET LOCAL ROLE authenticated;
  d := get_care_status_counts(p_church_id => c);
  RESET ROLE;
  INSERT INTO _r VALUES (1, 'STATUS somam o total (antes e depois)',
    (d->>'nao_atendida')::int + (d->>'em_atendimento')::int + (d->>'atendida')::int + (d->>'cancelado')::int = (d->>'total')::int AND (d->>'total') = (a->>'total'),
    format('antes: NA %s / EA %s / AT %s / CA %s / alerta %s  →  depois: NA %s / EA %s / AT %s / CA %s / alerta %s (total %s)',
      a->>'nao_atendida', a->>'em_atendimento', a->>'atendida', a->>'cancelado', a->>'sem_contato_48h',
      d->>'nao_atendida', d->>'em_atendimento', d->>'atendida', d->>'cancelado', d->>'sem_contato_48h', d->>'total'));
  INSERT INTO _r VALUES (2, 'alerta +48h nunca maior que Não atendida', (d->>'sem_contato_48h')::int <= (d->>'nao_atendida')::int,
    format('%s ≤ %s', d->>'sem_contato_48h', d->>'nao_atendida'));
  n := (SELECT count(*) FROM person_care_rows(c) r JOIN people p ON p.id = r.person_id WHERE p.deleted_at IS NULL AND r.care_alert AND r.care_state <> 'nao_atendida');
  INSERT INTO _r VALUES (3, 'nenhum alerta em Em atendimento / Atendida / Cancelado', n = 0, n::text);
  n := (SELECT count(*) FROM person_care_rows(c) r JOIN people p ON p.id = r.person_id WHERE p.deleted_at IS NULL AND r.care_state = 'em_atendimento'
          AND NOT EXISTS (SELECT 1 FROM person_journey pj JOIN journey_events je ON je.journey_id = pj.id
                          WHERE pj.person_id = p.id AND pj.closed_at IS NULL AND je.actor_type = 'human' AND je.event_type IN ('pastoral_contact', 'ministry_referral')));
  INSERT INTO _r VALUES (4, 'todo "Em atendimento" tem tentativa ou encaminhamento real', n = 0, n::text);
  n := (SELECT count(*) FROM people p WHERE p.church_id = c AND p.deleted_at IS NULL AND person_care_state(p.id) <> (SELECT r.care_state FROM person_care_rows(c) r WHERE r.person_id = p.id));
  INSERT INTO _r VALUES (5, 'função por pessoa e cálculo em lote dão o mesmo STATUS', n = 0, n::text);

  -- lista = contadores = CSV em cada STATUS e no alerta
  SET LOCAL ROLE authenticated;
  INSERT INTO _r SELECT 6, 'lista = contador = CSV (Não atendida)', pg_temp.page_total('nao_atendida', NULL) = (d->>'nao_atendida')::int AND pg_temp.csv_total('nao_atendida', NULL) = (d->>'nao_atendida')::int, d->>'nao_atendida';
  INSERT INTO _r SELECT 7, 'lista = contador = CSV (Em atendimento)', pg_temp.page_total('em_atendimento', NULL) = (d->>'em_atendimento')::int AND pg_temp.csv_total('em_atendimento', NULL) = (d->>'em_atendimento')::int, d->>'em_atendimento';
  INSERT INTO _r SELECT 8, 'lista = contador = CSV (Sem contato +48h)', pg_temp.page_total('sem_contato_48h', NULL) = (d->>'sem_contato_48h')::int AND pg_temp.csv_total('sem_contato_48h', NULL) = (d->>'sem_contato_48h')::int, d->>'sem_contato_48h';
  INSERT INTO _r SELECT 9, 'Filtro Contato (#484) intacto: com contato igual e com + sem = total',
    pg_temp.page_total(NULL, 'com_contato')::text = (SELECT v FROM _antes WHERE k = 'com_contato')
    AND pg_temp.page_total(NULL, 'com_contato') + pg_temp.page_total(NULL, 'sem_contato') = pg_temp.page_total(NULL, NULL),
    format('com contato %s', pg_temp.page_total(NULL, 'com_contato'));
  RESET ROLE;

  -- ── pessoa fictícia ───────────────────────────────────────
  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Regressao Status Ficticia', '+5520990004444', 'manual') RETURNING id INTO pid;
  SET LOCAL ROLE authenticated;
  -- "Não tentei" sem etapa: salva observação, não abre jornada
  r := journey_register_attendance(p_person_id => pid, p_people_updates => '{"observacoes_pastorais":"Observação de teste"}'::jsonb, p_register_contact => false);
  RESET ROLE;
  INSERT INTO _r VALUES (10, '"Não tentei" sem etapa: salva observação, sem jornada, sem tentativa, segue Não atendida',
    (r ->> 'journey_id') IS NULL AND (SELECT observacoes_pastorais FROM people WHERE id = pid) = 'Observação de teste'
      AND NOT EXISTS (SELECT 1 FROM person_journey WHERE person_id = pid) AND person_care_state(pid) = 'nao_atendida', person_care_state(pid));
  -- "Não tentei" escolhendo etapa: abre jornada mas continua Não atendida
  SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => pid, p_people_updates => '{"city":"Cidade X"}'::jsonb, p_new_stage_id => stg, p_register_contact => false);
  RESET ROLE;
  INSERT INTO _r VALUES (11, '"Não tentei" com etapa: jornada aberta, ainda Não atendida, sem tentativa',
    (r ->> 'journey_id') IS NOT NULL AND person_care_state(pid) = 'nao_atendida'
      AND NOT EXISTS (SELECT 1 FROM person_journey pj JOIN journey_events je ON je.journey_id = pj.id WHERE pj.person_id = pid AND je.event_type = 'pastoral_contact'),
    person_care_state(pid));
  -- alerta: cadastro recente não alerta; cadastro de 3 dias alerta (só por ser Não atendida)
  INSERT INTO _r VALUES (12, 'cadastro recente (< 48 h) sem tentativa: sem alerta', NOT person_care_alert(pid), NULL);
  UPDATE people SET created_at = now() - interval '3 days' WHERE id = pid;
  INSERT INTO _r VALUES (13, 'Não atendida há 3 dias: alerta +48h', person_care_alert(pid), NULL);
  -- tentativa real → Em atendimento e sai do alerta
  SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => pid, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_register_contact => true);
  RESET ROLE;
  INSERT INTO _r VALUES (14, 'tentativa "Não atendeu": Em atendimento e fora do alerta (alerta só para Não atendida)',
    person_care_state(pid) = 'em_atendimento' AND NOT person_care_alert(pid), person_care_state(pid));
  -- só encaminhamento (sem tentativa) também é atendimento
  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Regressao Encaminhamento Ficticia', '+5520990005555', 'manual') RETURNING id INTO pid2;
  SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => pid2, p_new_stage_id => stg, p_ministry_id => min_cad, p_register_contact => false);
  RESET ROLE;
  INSERT INTO _r VALUES (15, 'encaminhamento efetivo (sem tentativa): Em atendimento', person_care_state(pid2) = 'em_atendimento', person_care_state(pid2));
  -- tentativa sem jornada e sem etapa continua exigindo etapa
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM journey_register_attendance(p_person_id => (SELECT id FROM people WHERE church_id = c AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM person_journey pj WHERE pj.person_id = people.id) LIMIT 1),
                                        p_contact_result => 'nao_atendeu', p_register_contact => true);
    RESET ROLE;
    INSERT INTO _r VALUES (16, 'tentativa sem jornada e sem etapa continua exigindo etapa', false, 'aceitou');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES (16, 'tentativa sem jornada e sem etapa continua exigindo etapa', SQLERRM LIKE '%JOURNEY_REQUIRED%', SQLERRM);
  END;
  RESET ROLE;
  -- isolamento
  BEGIN
    SET LOCAL ROLE authenticated;
    PERFORM get_care_status_counts(p_church_id => (SELECT id FROM churches WHERE id <> c ORDER BY created_at LIMIT 1));
    RESET ROLE;
    INSERT INTO _r VALUES (17, 'isolamento: outra igreja bloqueada', false, 'não bloqueou');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES (17, 'isolamento: outra igreja bloqueada', SQLERRM ILIKE '%FORBIDDEN%', SQLERRM);
  END;
  RESET ROLE;
END $$;

DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n) FROM _r); END $$;
