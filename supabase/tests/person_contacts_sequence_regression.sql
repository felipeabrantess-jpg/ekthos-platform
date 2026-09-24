-- Teste de regressão — SEQUÊNCIA DE CONTATOS PASTORAIS (get_person_contacts + JOURNEY_REQUIRED)
-- Uma transação com ROLLBACK: pessoas, jornadas e eventos criados aqui não persistem.
-- O sub do JWT da IGV é um admin REAL da igreja (person_journey.owner_id tem FK para auth.users).
-- JWT simulado: usuário admin da IGV. Igreja A ("Minha Fé") para tenant isolation.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
CREATE TEMP TABLE t (seq serial, cenario text, resultado text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  c_igv   constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  c_fe    constant uuid := '5156cc30-6d76-4487-99ba-fff8013b38d4';
  j_fe    constant text := '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"church_id":"5156cc30-6d76-4487-99ba-fff8013b38d4","role":"admin"}}';
  j_igv   constant text := '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}';
  v_stage uuid; v_p uuid; v_j uuid; v_n int; v_ord text; r record; v_cnt_before int; v_cnt_after int; v_ok boolean;
  v_real_counts int; v_rpc_counts int;
BEGIN
  SELECT id INTO v_stage FROM pipeline_stages WHERE church_id = c_igv AND is_active ORDER BY order_index LIMIT 1;

  -- ── Pessoas reais da IGV: ordinal 1..N bate com a quantidade real ─────────
  FOR r IN
    SELECT DISTINCT ON (cnt) person_id, cnt FROM (
      SELECT pj.person_id, COUNT(*) cnt FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id
      WHERE pj.church_id = c_igv AND je.event_type = 'pastoral_contact' GROUP BY 1
    ) x WHERE cnt IN (1,2,3,4,6,7) ORDER BY cnt, person_id
  LOOP
    SELECT COUNT(*), bool_and(ordinal = rn) INTO v_n, v_ok
    FROM (SELECT ordinal, ROW_NUMBER() OVER (ORDER BY event_at, contact_date, event_id) rn FROM get_person_contacts(r.person_id)) x;
    INSERT INTO t(cenario, resultado, ok) VALUES
      ('IGV pessoa com ' || r.cnt || ' contatos → ordinais 1..' || r.cnt, v_n || ' linhas, ordinais sequenciais=' || v_ok, v_n = r.cnt AND v_ok);
  END LOOP;

  -- ── Campos por contato (pessoa com mais contatos) ─────────────────────────
  SELECT pj.person_id INTO v_p FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id
   WHERE pj.church_id = c_igv AND je.event_type = 'pastoral_contact' GROUP BY 1 ORDER BY COUNT(*) DESC LIMIT 1;
  SELECT bool_and(event_at IS NOT NULL AND contact_date IS NOT NULL AND actor_name IS NOT NULL AND channel IS NOT NULL AND result IS NOT NULL AND event_id IS NOT NULL)
    INTO v_ok FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('campos data/responsável/canal/resultado/event_id presentes', v_ok::text, v_ok);
  SELECT COUNT(*) INTO v_n FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('7 contatos → próximo = 8º (sem teto de 4)', (v_n + 1) || 'º', v_n = 7);

  -- ── Coluna CONTATOS (get_contact_counts) == quantidade real == RPC nova ───
  SELECT SUM(cnt) INTO v_rpc_counts FROM get_contact_counts(c_igv, ARRAY(SELECT DISTINCT pj.person_id FROM person_journey pj WHERE pj.church_id = c_igv));
  SELECT COUNT(*) INTO v_real_counts FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.church_id = c_igv AND je.event_type = 'pastoral_contact';
  INSERT INTO t(cenario, resultado, ok) VALUES ('get_contact_counts == pastoral_contact reais (IGV)', v_rpc_counts || ' == ' || v_real_counts, v_rpc_counts = v_real_counts);

  -- ── Pessoa nova sem jornada ───────────────────────────────────────────────
  INSERT INTO people (church_id, name) VALUES (c_igv, '__teste_sequencia__') RETURNING id INTO v_p;
  SELECT COUNT(*) INTO v_n FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('0 contatos → lista vazia, próximo = 1º', v_n || ' contatos', v_n = 0);

  -- JOURNEY_REQUIRED: sem jornada e sem etapa
  BEGIN
    PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_notes => 'x');
    INSERT INTO t(cenario, resultado, ok) VALUES ('sem jornada e sem etapa → JOURNEY_REQUIRED', 'SUCESSO SILENCIOSO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('sem jornada e sem etapa → JOURNEY_REQUIRED', SQLERRM, SQLERRM ILIKE '%JOURNEY_REQUIRED%');
  END;
  SELECT COUNT(*) INTO v_n FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('após JOURNEY_REQUIRED nenhum contato criado', v_n::text, v_n = 0);

  -- Com etapa: abre jornada canônica + registra 1º contato
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_notes => 'primeiro', p_new_stage_id => v_stage);
  SELECT id INTO v_j FROM person_journey WHERE person_id = v_p AND closed_at IS NULL;
  INSERT INTO t(cenario, resultado, ok) VALUES ('com etapa → jornada aberta (journey_opened)', (v_j IS NOT NULL)::text || ' / ' || (SELECT COUNT(*) FROM journey_events WHERE journey_id = v_j AND event_type = 'journey_opened'), v_j IS NOT NULL AND (SELECT COUNT(*) FROM journey_events WHERE journey_id = v_j AND event_type = 'journey_opened') = 1);
  SELECT string_agg(ordinal || ':' || channel || ':' || result || ':' || notes, ',') INTO v_ord FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('1º contato registrado com canal/resultado/observação', v_ord, v_ord = '1:whatsapp:realizado:primeiro');

  -- antes: CONTATOS = 2 → salva → depois: 3 e aparece como 3º
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'ligacao', p_contact_result => 'sem_resposta');
  SELECT cnt INTO v_cnt_before FROM get_contact_counts(c_igv, ARRAY[v_p]);
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'presencial', p_contact_result => 'encaminhado', p_contact_notes => 'terceiro');
  SELECT cnt INTO v_cnt_after FROM get_contact_counts(c_igv, ARRAY[v_p]);
  SELECT ordinal || ':' || channel || ':' || result || ':' || notes INTO v_ord FROM get_person_contacts(v_p) ORDER BY ordinal DESC LIMIT 1;
  INSERT INTO t(cenario, resultado, ok) VALUES ('CONTATOS antes=2 → salva → depois=3', v_cnt_before || ' → ' || v_cnt_after, v_cnt_before = 2 AND v_cnt_after = 3);
  INSERT INTO t(cenario, resultado, ok) VALUES ('novo registro aparece como 3º no histórico', v_ord, v_ord = '3:presencial:encaminhado:terceiro');
  INSERT INTO t(cenario, resultado, ok) VALUES ('responsável = usuário logado (actor_id = auth.uid())', (SELECT bool_and(actor_id = auth.uid())::text FROM get_person_contacts(v_p)), (SELECT bool_and(actor_id = auth.uid()) FROM get_person_contacts(v_p)));

  -- Sequência até o 7º e além (sem bloqueio)
  FOR v_n IN 4..7 LOOP
    PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'whatsapp', p_contact_result => 'realizado', p_contact_notes => 'n' || v_n);
  END LOOP;
  SELECT string_agg(ordinal::text, ',' ORDER BY ordinal) INTO v_ord FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('7 contatos → ordinais 1..7, próximo 8º, sem bloqueio', v_ord, v_ord = '1,2,3,4,5,6,7');

  -- Encerramento: dimensão separada (closed_at + outcome), contatos continuam contando
  PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'whatsapp', p_contact_result => 'nao_quer_contato');
  SELECT closed_at IS NOT NULL AND outcome = 'nao_quer_contato' INTO v_ok FROM person_journey WHERE id = v_j;
  SELECT COUNT(*) INTO v_n FROM get_person_contacts(v_p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('jornada encerrada (closed_at+outcome) e contatos = 8 (encerramento não é contato extra)', v_ok || ' / ' || v_n, v_ok AND v_n = 8);
  INSERT INTO t(cenario, resultado, ok) VALUES ('RPC expõe journey_closed_at/outcome', (SELECT (journey_closed_at IS NOT NULL)::text || ' ' || journey_outcome FROM get_person_contacts(v_p) LIMIT 1), (SELECT journey_closed_at IS NOT NULL AND journey_outcome = 'nao_quer_contato' FROM get_person_contacts(v_p) LIMIT 1));

  -- Jornada fechada + novo atendimento sem etapa → JOURNEY_REQUIRED (não reabre sozinho)
  BEGIN
    PERFORM journey_register_attendance(p_contact_date => clock_timestamp(), p_person_id => v_p, p_contact_channel => 'whatsapp', p_contact_result => 'realizado');
    INSERT INTO t(cenario, resultado, ok) VALUES ('jornada fechada e sem etapa → JOURNEY_REQUIRED', 'SUCESSO SILENCIOSO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('jornada fechada e sem etapa → JOURNEY_REQUIRED', SQLERRM, SQLERRM ILIKE '%JOURNEY_REQUIRED%');
  END;

  -- ── Tenant isolation ──────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_fe, true);
  BEGIN
    PERFORM * FROM get_person_contacts(v_p);
    INSERT INTO t(cenario, resultado, ok) VALUES ('igreja A lendo contatos de pessoa da IGV', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('igreja A lendo contatos de pessoa da IGV', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  PERFORM set_config('request.jwt.claims', j_igv, true);
END $$;

SELECT seq, cenario, resultado, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END status FROM t ORDER BY seq;
ROLLBACK;
