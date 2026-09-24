-- Teste de regressão — EDITAR PESSOA → MINISTÉRIOS (get_person_ministries + sync_person_ministries)
-- Uma transação com ROLLBACK: nada persiste. Contas REAIS da IGV lidas em runtime.
-- Prova: diff (manter/adicionar/remover) sem duplicatas; vínculos não geríveis são imutáveis;
-- pessoa em N ministérios; usuário sem permissão não altera; outro tenant FORBIDDEN;
-- volunteers e people.ministry_interest intocados.

BEGIN;
CREATE TEMP TABLE ctx ON COMMIT DROP AS
SELECT
  (SELECT user_id FROM user_roles WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND role='admin'       ORDER BY created_at LIMIT 1) AS u_admin,
  (SELECT user_id FROM user_roles WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND role='cell_leader' ORDER BY created_at LIMIT 1) AS u_leader,
  (SELECT user_id FROM user_roles WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND role='treasurer'   ORDER BY created_at LIMIT 1) AS u_common,
  (SELECT id FROM ministries WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY name LIMIT 1)            AS m_louvor,
  (SELECT id FROM ministries WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY name OFFSET 1 LIMIT 1)   AS m_mulheres,
  (SELECT id FROM ministries WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY name OFFSET 2 LIMIT 1)   AS m_intercessao,
  (SELECT id FROM ministries WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY name OFFSET 3 LIMIT 1)   AS m_kids,
  (SELECT id FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND deleted_at IS NULL AND left_at IS NULL AND name_sort LIKE '%fernanda%' ORDER BY name_sort LIMIT 1) AS p_fernanda,
  (SELECT md5(string_agg(x::text, '|' ORDER BY id)) FROM volunteers x) AS vol_before,
  (SELECT COUNT(*) FROM volunteers) AS vol_cnt_before,
  (SELECT md5(string_agg(COALESCE(array_to_string(ministry_interest, ','), '') , '|' ORDER BY id)) FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5') AS mi_before;
CREATE TEMP TABLE t (seq serial, cenario text, resultado text, ok boolean) ON COMMIT DROP;
GRANT ALL ON t TO authenticated; GRANT ALL ON SEQUENCE t_seq_seq TO authenticated;
GRANT SELECT ON ctx TO authenticated;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  c_igv constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  j_other constant text := '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"church_id":"5156cc30-6d76-4487-99ba-fff8013b38d4","role":"admin"}}';
  claims constant text := '{"sub":"%s","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"%s"}}';
  u_admin uuid; u_leader uuid; u_common uuid; m_louvor uuid; m_mulheres uuid; m_intercessao uuid; m_kids uuid; p uuid;
  j_admin text; j_leader text; j_common text; r jsonb; v text; n int;
  cur uuid[];
BEGIN
  SELECT c.u_admin, c.u_leader, c.u_common, c.m_louvor, c.m_mulheres, c.m_intercessao, c.m_kids, c.p_fernanda
    INTO u_admin, u_leader, u_common, m_louvor, m_mulheres, m_intercessao, m_kids, p FROM ctx c;
  j_admin  := format(claims, u_admin,  'admin');
  j_leader := format(claims, u_leader, 'cell_leader');
  j_common := format(claims, u_common, 'treasurer');

  -- ── ADMIN: estado inicial Louvor + Mulheres ───────────────────────────────
  PERFORM set_config('request.jwt.claims', j_admin, true);
  r := sync_person_ministries(p, ARRAY[m_louvor, m_mulheres]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin: sync inicial → added Louvor+Mulheres', r::text,
    jsonb_array_length(r->'added') = 2 AND jsonb_array_length(r->'removed') = 0);
  SELECT array_agg(ministry_id ORDER BY ministry_id) INTO cur FROM get_person_ministries(p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('get_person_ministries devolve os 2 vínculos com can_manage=true (admin)',
    (SELECT string_agg(ministry_name||':'||can_manage, ', ') FROM get_person_ministries(p)),
    cur = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[m_louvor, m_mulheres]) x) AND (SELECT bool_and(can_manage) FROM get_person_ministries(p)));

  -- ── REGRA CRÍTICA: antes Louvor+Mulheres → depois Mulheres+Intercessão ─────
  r := sync_person_ministries(p, ARRAY[m_mulheres, m_intercessao]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('diff: MANTER Mulheres, ADICIONAR Intercessão, REMOVER Louvor', r::text,
    r->'kept' = to_jsonb(ARRAY[m_mulheres]) AND r->'added' = to_jsonb(ARRAY[m_intercessao]) AND r->'removed' = to_jsonb(ARRAY[m_louvor]));
  SELECT array_agg(ministry_id ORDER BY ministry_id) INTO cur FROM get_person_ministries(p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('estado após diff = Mulheres+Intercessão', (SELECT string_agg(ministry_name, ', ') FROM get_person_ministries(p)),
    cur = (SELECT array_agg(x ORDER BY x) FROM unnest(ARRAY[m_mulheres, m_intercessao]) x));
  -- idempotência / sem duplicatas
  r := sync_person_ministries(p, ARRAY[m_mulheres, m_intercessao, m_intercessao]);
  SELECT COUNT(*) INTO n FROM ministry_members WHERE person_id = p;
  INSERT INTO t(cenario, resultado, ok) VALUES ('repetir sync (com id duplicado) → nada muda, sem duplicatas', r::text||' rows='||n,
    jsonb_array_length(r->'added') = 0 AND jsonb_array_length(r->'removed') = 0 AND n = 2);
  -- N ministérios
  r := sync_person_ministries(p, ARRAY[m_louvor, m_mulheres, m_intercessao, m_kids]);
  SELECT COUNT(*) INTO n FROM get_person_ministries(p);
  INSERT INTO t(cenario, resultado, ok) VALUES ('pessoa em 4 ministérios simultaneamente', n::text, n = 4);
  -- ids inválidos/outra igreja são ignorados
  r := sync_person_ministries(p, ARRAY[m_louvor, m_mulheres, m_intercessao, m_kids, gen_random_uuid()]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('id de ministério inexistente é ignorado', r::text, jsonb_array_length(r->'added') = 0 AND (SELECT COUNT(*) FROM ministry_members WHERE person_id = p) = 4);
  -- bidirecional: Ministérios → Pessoas vê Fernanda em Kids
  INSERT INTO t(cenario, resultado, ok) VALUES ('bidirecional: get_ministry_members(Kids) lista a pessoa', (SELECT COUNT(*)::text FROM get_ministry_members(m_kids) WHERE person_id = p), (SELECT COUNT(*) FROM get_ministry_members(m_kids) WHERE person_id = p) = 1);
  -- admin vincula a conta do líder só ao Louvor
  UPDATE ministries SET leader_user_id = u_leader WHERE id = m_louvor;

  -- ── LÍDER (gere só Louvor) ────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_leader, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: vê TODOS os vínculos; can_manage só em Louvor',
    (SELECT string_agg(ministry_name||':'||can_manage, ', ' ORDER BY ministry_name) FROM get_person_ministries(p)),
    (SELECT COUNT(*) FROM get_person_ministries(p)) = 4 AND (SELECT bool_and(can_manage = (ministry_id = m_louvor)) FROM get_person_ministries(p)));
  -- envia lista SEM os outros ministérios: só Louvor removido; Mulheres/Intercessão/Kids IMUTÁVEIS
  r := sync_person_ministries(p, ARRAY[]::uuid[]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: lista vazia → remove só Louvor; demais ficam (skipped)', r::text,
    r->'removed' = to_jsonb(ARRAY[m_louvor]) AND jsonb_array_length(r->'skipped') = 3 AND (SELECT COUNT(*) FROM get_person_ministries(p)) = 3);
  -- líder tenta incluir em Kids (não gere) → ignorado
  r := sync_person_ministries(p, ARRAY[m_louvor, m_kids]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: adiciona Louvor; Kids (não gere) segue como estava', r::text,
    r->'added' = to_jsonb(ARRAY[m_louvor]) AND (SELECT COUNT(*) FROM get_person_ministries(p)) = 4);
  -- líder tenta remover Kids passando lista sem Kids → Kids permanece
  r := sync_person_ministries(p, ARRAY[m_louvor]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: ausência de Kids na lista NÃO remove Kids (sem permissão ≠ remoção)', r::text,
    jsonb_array_length(r->'removed') = 0 AND EXISTS (SELECT 1 FROM get_person_ministries(p) WHERE ministry_id = m_kids));

  -- ── USUÁRIO COMUM (não gere nada) ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_common, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('comum: vê os vínculos, todos can_manage=false',
    (SELECT COUNT(*)::text||' vínculos, algum gerível='||bool_or(can_manage) FROM get_person_ministries(p)),
    (SELECT COUNT(*) FROM get_person_ministries(p)) = 4 AND NOT (SELECT bool_or(can_manage) FROM get_person_ministries(p)));
  r := sync_person_ministries(p, ARRAY[]::uuid[]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('comum: sync com lista vazia não remove nada', r::text,
    jsonb_array_length(r->'removed') = 0 AND jsonb_array_length(r->'added') = 0 AND (SELECT COUNT(*) FROM get_person_ministries(p)) = 4);
  r := sync_person_ministries(p, ARRAY[m_louvor, m_mulheres, m_intercessao, m_kids, (SELECT id FROM ministries WHERE church_id = c_igv AND is_active ORDER BY name OFFSET 4 LIMIT 1)]);
  INSERT INTO t(cenario, resultado, ok) VALUES ('comum: sync tentando adicionar 5º ministério → nada escrito', r::text,
    jsonb_array_length(r->'added') = 0 AND (SELECT COUNT(*) FROM get_person_ministries(p)) = 4);

  -- ── OUTRO TENANT ─────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_other, true);
  BEGIN
    PERFORM * FROM get_person_ministries(p);
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: get_person_ministries → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: get_person_ministries → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM sync_person_ministries(p, ARRAY[]::uuid[]);
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: sync → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: sync → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  PERFORM set_config('request.jwt.claims', j_admin, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: vínculos intactos (conferido como admin)', (SELECT COUNT(*)::text FROM ministry_members WHERE person_id = p), (SELECT COUNT(*) FROM get_person_ministries(p)) = 4);
END $$;

RESET ROLE;
INSERT INTO t(cenario, resultado, ok)
SELECT 'volunteers intocada (md5 e contagem, todas as igrejas)', c.vol_cnt_before||' → '||(SELECT COUNT(*) FROM volunteers)||' / md5 igual='||(c.vol_before = (SELECT md5(string_agg(x::text, '|' ORDER BY id)) FROM volunteers x)),
       c.vol_before = (SELECT md5(string_agg(x::text, '|' ORDER BY id)) FROM volunteers x) AND c.vol_cnt_before = (SELECT COUNT(*) FROM volunteers) FROM ctx c;
INSERT INTO t(cenario, resultado, ok)
SELECT 'people.ministry_interest intocado (md5 IGV igual antes/depois)', 'md5 igual='||(c.mi_before = (SELECT md5(string_agg(COALESCE(array_to_string(ministry_interest, ','), ''), '|' ORDER BY id)) FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5')),
       c.mi_before = (SELECT md5(string_agg(COALESCE(array_to_string(ministry_interest, ','), ''), '|' ORDER BY id)) FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5') FROM ctx c;

SELECT seq, cenario, resultado, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END status FROM t ORDER BY seq;
ROLLBACK;
