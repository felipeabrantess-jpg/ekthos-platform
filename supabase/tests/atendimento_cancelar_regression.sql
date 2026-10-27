-- ============================================================
-- Regressão — "Cancelar atendimento" (migration 20261027160000). Transação desfeita no fim (exceção proposital).
-- Pessoas fictícias; chamadas como o admin da IGV (role authenticated + JWT). Nenhum envio é possível.
-- Uso: node supabase/tests/run-regression.mjs <este arquivo> [migration]
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '240s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
GRANT ALL ON _r TO authenticated;

--@@MIGRATION@@

CREATE FUNCTION pg_temp.como(p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', 'role', 'authenticated',
    'app_metadata', json_build_object('church_id', p_church))::text, true)::void
$$;
GRANT EXECUTE ON FUNCTION pg_temp.como(uuid) TO authenticated;

DO $$
DECLARE
  c   constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  adm constant uuid := '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349';
  stg constant uuid := 'e7d0d735-8105-4e49-8662-3dae0286be94';
  a uuid; b uuid; d uuid; jA uuid; conv uuid; r jsonb; n int; ev record; contatos_antes int; cnt jsonb;
BEGIN
  -- pessoa A: "Não atendida", sem atendimento, com acolhimento automático agendado e mensagem na fila
  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Cancelar Ficticia A', '+5520990006666', 'qr_code') RETURNING id INTO a;
  INSERT INTO acolhimento_journey (church_id, person_id, current_touchpoint, next_touchpoint_at, status)
  VALUES (c, a, 'D+3', now() + interval '3 days', 'pending');
  INSERT INTO conversations (church_id, person_id, contact_phone, channel_id) VALUES (c, a, '5520990006666', 'b8a61922-7825-4a2c-8220-7e899a1f9484') RETURNING id INTO conv;
  INSERT INTO channel_dispatch_queue (church_id, channel_id, conversation_id, to_phone, content, status, scheduled_at)
  VALUES (c, 'b8a61922-7825-4a2c-8220-7e899a1f9484', conv, '5520990006666', 'teste', 'pending', now() + interval '1 day');

  PERFORM pg_temp.como(c);
  SET LOCAL ROLE authenticated;
  r := journey_cancel(a, 'nao_quer_contato', 'Pediu para não receber mensagens');
  RESET ROLE;
  INSERT INTO _r VALUES (1, 'Cancelar (Não quer contato) em pessoa sem atendimento: STATUS CANCELADO', person_care_state(a) = 'cancelado', r::text);
  SELECT e.actor_id, e.actor_type, e.payload, e.created_at INTO ev FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = a AND e.event_type = 'journey_cancelled';
  INSERT INTO _r VALUES (2, 'registra responsável, data, motivo e observação',
    ev.actor_id = adm AND ev.actor_type = 'human' AND ev.payload ->> 'reason' = 'nao_quer_contato' AND ev.payload ->> 'notes' = 'Pediu para não receber mensagens' AND ev.created_at IS NOT NULL, ev.payload::text);
  INSERT INTO _r VALUES (3, 'cadastro mantido (não excluído)', EXISTS (SELECT 1 FROM people WHERE id = a AND deleted_at IS NULL), NULL);
  INSERT INTO _r VALUES (4, '"Não quer contato" cancela o acolhimento agendado e a mensagem ainda não enviada',
    NOT EXISTS (SELECT 1 FROM acolhimento_journey WHERE person_id = a AND status IN ('pending', 'processing'))
    AND EXISTS (SELECT 1 FROM channel_dispatch_queue WHERE conversation_id = conv AND status = 'failed' AND error_message LIKE 'cancelado:%')
    AND (r ->> 'acolhimento_cancelado')::int = 1 AND (r ->> 'fila_cancelada')::int = 1, format('acolhimento %s / fila %s', r ->> 'acolhimento_cancelado', r ->> 'fila_cancelada'));

  -- reabrir: volta a ficar aberto, histórico preservado, acolhimento NÃO reinicia
  jA := (r ->> 'journey_id')::uuid;
  SET LOCAL ROLE authenticated;
  r := journey_reopen(jA, 'Cancelado por engano');
  RESET ROLE;
  INSERT INTO _r VALUES (5, 'Reabrir: sai de CANCELADO, histórico do cancelamento preservado',
    person_care_state(a) <> 'cancelado' AND EXISTS (SELECT 1 FROM journey_events WHERE journey_id = jA AND event_type = 'journey_cancelled')
    AND EXISTS (SELECT 1 FROM journey_events WHERE journey_id = jA AND event_type = 'journey_reopened'), person_care_state(a));
  INSERT INTO _r VALUES (6, 'Reabrir NÃO reinicia o acolhimento automático', NOT EXISTS (SELECT 1 FROM acolhimento_journey WHERE person_id = a AND status IN ('pending', 'processing')), NULL);

  -- pessoa B: em atendimento com tentativas → "Mudou de igreja": contatos preservados, acolhimento não é mexido
  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Cancelar Ficticia B', '+5520990007777', 'manual') RETURNING id INTO b;
  INSERT INTO acolhimento_journey (church_id, person_id, current_touchpoint, next_touchpoint_at, status) VALUES (c, b, 'D+3', now() + interval '3 days', 'pending');
  SET LOCAL ROLE authenticated;
  r := journey_register_attendance(p_person_id => b, p_new_stage_id => stg, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_register_contact => true);
  r := journey_register_attendance(p_person_id => b, p_contact_channel => 'whatsapp', p_contact_result => 'sem_resposta', p_register_contact => true);
  RESET ROLE;
  contatos_antes := (SELECT count(*) FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = b AND e.event_type = 'pastoral_contact');
  SET LOCAL ROLE authenticated;
  r := journey_cancel(b, 'mudou_de_igreja', NULL);
  RESET ROLE;
  INSERT INTO _r VALUES (7, '"Mudou de igreja" em atendimento aberto: CANCELADO, 2 tentativas preservadas',
    person_care_state(b) = 'cancelado' AND contatos_antes = 2
    AND (SELECT count(*) FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = b AND e.event_type = 'pastoral_contact') = 2, person_care_state(b));
  INSERT INTO _r VALUES (8, 'só "Não quer contato" mexe no acolhimento automático (Mudou de igreja não)',
    EXISTS (SELECT 1 FROM acolhimento_journey WHERE person_id = b AND status = 'pending') AND (r ->> 'acolhimento_cancelado')::int = 0, NULL);

  -- "Outro motivo": exige observação
  INSERT INTO people (church_id, name, phone, source) VALUES (c, 'Cancelar Ficticia D', '+5520990008888', 'manual') RETURNING id INTO d;
  BEGIN
    SET LOCAL ROLE authenticated; PERFORM journey_cancel(d, 'outro_motivo', '   '); RESET ROLE;
    INSERT INTO _r VALUES (9, '"Outro motivo" sem observação é recusado', false, 'aceitou');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES (9, '"Outro motivo" sem observação é recusado', SQLERRM LIKE 'NOTES_REQUIRED%', SQLERRM); END;
  RESET ROLE;
  SET LOCAL ROLE authenticated; r := journey_cancel(d, 'outro_motivo', 'Faleceu'); RESET ROLE;
  INSERT INTO _r VALUES (10, '"Outro motivo" com observação: CANCELADO', person_care_state(d) = 'cancelado', NULL);
  BEGIN
    SET LOCAL ROLE authenticated; PERFORM journey_cancel(b, 'qualquer_coisa', 'x'); RESET ROLE;
    INSERT INTO _r VALUES (11, 'motivo fora da lista é recusado', false, 'aceitou');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES (11, 'motivo fora da lista é recusado', SQLERRM LIKE 'REASON_REQUIRED%', SQLERRM); END;
  RESET ROLE;

  -- regra única: o caminho antigo (tentativa com resultado "Não quer contato") continua cancelando
  -- (A foi reaberta no passo 5; o atendimento dela está aberto)
  BEGIN
    SET LOCAL ROLE authenticated;
    r := journey_register_attendance(p_person_id => a, p_contact_channel => 'ligacao', p_contact_result => 'nao_quer_contato', p_register_contact => true);
    RESET ROLE;
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO _r VALUES (12, 'caminho antigo (resultado "Não quer contato") continua cancelando', false, SQLERRM); END;
  INSERT INTO _r SELECT 12, 'caminho antigo (resultado "Não quer contato") continua cancelando', person_care_state(a) = 'cancelado', person_care_state(a)
   WHERE NOT EXISTS (SELECT 1 FROM _r x WHERE x.n = 12);

  -- isolamento e permissão: mesmo usuário apontando para outra igreja
  PERFORM pg_temp.como((SELECT id FROM churches WHERE id <> c ORDER BY created_at LIMIT 1));
  BEGIN
    SET LOCAL ROLE authenticated; PERFORM journey_cancel(b, 'mudou_de_igreja', NULL); RESET ROLE;
    INSERT INTO _r VALUES (13, 'isolamento: outra igreja não cancela atendimento da IGV', false, 'cancelou');
  EXCEPTION WHEN OTHERS THEN INSERT INTO _r VALUES (13, 'isolamento: outra igreja não cancela atendimento da IGV', SQLERRM LIKE 'FORBIDDEN%', SQLERRM); END;
  RESET ROLE;
  PERFORM pg_temp.como(c);
  INSERT INTO _r VALUES (14, 'anon não pode executar journey_cancel', NOT has_function_privilege('anon', 'journey_cancel(uuid,text,text,integer)', 'EXECUTE'), NULL);

  -- contadores continuam fechando
  SET LOCAL ROLE authenticated; cnt := get_care_status_counts(p_church_id => c); RESET ROLE;
  INSERT INTO _r VALUES (15, 'STATUS somam o total e alerta ≤ Não atendida',
    (cnt->>'nao_atendida')::int + (cnt->>'em_atendimento')::int + (cnt->>'atendida')::int + (cnt->>'cancelado')::int = (cnt->>'total')::int
    AND (cnt->>'sem_contato_48h')::int <= (cnt->>'nao_atendida')::int, cnt::text);
END $$;

DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n) FROM _r); END $$;
