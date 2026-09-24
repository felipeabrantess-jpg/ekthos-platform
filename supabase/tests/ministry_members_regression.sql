-- Teste de regressão — PESSOAS DO MINISTÉRIO (ministry_members) + autorização por conta
-- Uma transação com ROLLBACK: nada persiste. Usa contas REAIS da IGV (ids lidos em runtime):
--   ADMIN  = user_roles.role='admin'          → administra qualquer ministério
--   LÍDER  = user_roles.role='cell_leader'    → recebe leader_user_id de UM ministério no teste
--   COMUM  = user_roles.role='treasurer'      → não administra
--   OUTRO  = usuário de outra igreja (Minha Fé)
-- Prova também que `volunteers` fica 100% intocada (md5 das linhas antes/depois).

BEGIN;
-- Lookups feitos ANTES de assumir o papel authenticated (user_roles/people têm RLS)
CREATE TEMP TABLE ctx ON COMMIT DROP AS
SELECT
  (SELECT user_id FROM user_roles WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND role='admin'       ORDER BY created_at LIMIT 1) AS u_admin,
  (SELECT user_id FROM user_roles WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND role='cell_leader' ORDER BY created_at LIMIT 1) AS u_leader,
  (SELECT user_id FROM user_roles WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND role='treasurer'   ORDER BY created_at LIMIT 1) AS u_common,
  (SELECT id FROM ministries WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY name LIMIT 1) AS m1,
  (SELECT id FROM ministries WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND is_active ORDER BY name OFFSET 1 LIMIT 1) AS m2,
  (SELECT id FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND deleted_at IS NULL AND left_at IS NULL AND name_sort LIKE '%fernanda%' ORDER BY name_sort LIMIT 1) AS p1,
  (SELECT id FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND deleted_at IS NULL AND left_at IS NULL AND name_sort LIKE '%conceicao%' ORDER BY name_sort LIMIT 1) AS p2,
  (SELECT id FROM people WHERE church_id='6c127559-874a-4748-8fce-55d4079613a5' AND deleted_at IS NOT NULL LIMIT 1) AS p_deleted,
  (SELECT md5(string_agg(x::text, '|' ORDER BY id)) FROM volunteers x) AS snap_before,
  (SELECT COUNT(*) FROM volunteers) AS cnt_before;
CREATE TEMP TABLE t (seq serial, cenario text, resultado text, ok boolean) ON COMMIT DROP;
GRANT ALL ON t TO authenticated; GRANT ALL ON SEQUENCE t_seq_seq TO authenticated;
GRANT SELECT ON ctx TO authenticated;
SET LOCAL ROLE authenticated;


DO $$
DECLARE
  c_igv constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  c_fe  constant uuid := '5156cc30-6d76-4487-99ba-fff8013b38d4';
  u_admin uuid; u_leader uuid; u_common uuid;
  j_admin text; j_leader text; j_common text;
  j_other constant text := '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"church_id":"5156cc30-6d76-4487-99ba-fff8013b38d4","role":"admin"}}';
  m1 uuid; m2 uuid; p1 uuid; p2 uuid; p_deleted uuid;
  v_snap_before text; v_snap_after text; v_cnt_before int; v_cnt_after int;
  r jsonb; n int; v text; v_ok boolean;
  claims constant text := '{"sub":"%s","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"%s"}}';
BEGIN
  SELECT c.u_admin, c.u_leader, c.u_common, c.m1, c.m2, c.p1, c.p2, c.p_deleted INTO u_admin, u_leader, u_common, m1, m2, p1, p2, p_deleted FROM ctx c;
  j_admin  := format(claims, u_admin,  'admin');
  j_leader := format(claims, u_leader, 'cell_leader');
  j_common := format(claims, u_common, 'treasurer');



  -- ── ADMIN: administra qualquer ministério ────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_admin, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin: get_my_managed_ministries = todos os ativos',
    (SELECT COUNT(*)::text FROM get_my_managed_ministries())||' de '||(SELECT COUNT(*) FROM ministries WHERE church_id=c_igv AND is_active),
    (SELECT COUNT(*) FROM get_my_managed_ministries()) = (SELECT COUNT(*) FROM ministries WHERE church_id=c_igv AND is_active));
  r := ministry_member_add(m1, p1);
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin: incluir pessoa (Fernanda) no ministério 1', r::text, (r->>'inserted')::boolean);
  r := ministry_member_add(m1, p1);
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin: incluir de novo → idempotente (inserted=false)', r::text, NOT (r->>'inserted')::boolean);
  r := ministry_member_add(m2, p2);
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin: incluir pessoa (Conceição) no ministério 2', r::text, (r->>'inserted')::boolean);
  SELECT string_agg(name, ', ') INTO v FROM get_ministry_members(m1);
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin: listar pessoas do ministério 1', v, v ILIKE '%fernanda%');
  INSERT INTO t(cenario, resultado, ok) VALUES ('contagem por ministério (cards) = ministry_members',
    (SELECT string_agg(ministry_id::text||'='||cnt, ',') FROM get_ministry_member_counts(c_igv)),
    (SELECT cnt FROM get_ministry_member_counts(c_igv) WHERE ministry_id = m1) = 1);
  BEGIN
    PERFORM ministry_member_add(m1, p_deleted);
    INSERT INTO t(cenario, resultado, ok) VALUES ('pessoa excluída não pode ser incluída', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('pessoa excluída não pode ser incluída', SQLERRM, SQLERRM ILIKE '%PERSON_NOT_FOUND%');
  END;
  BEGIN
    INSERT INTO ministry_members (church_id, ministry_id, person_id) VALUES (c_igv, m1, p2);
    INSERT INTO t(cenario, resultado, ok) VALUES ('escrita direta via PostgREST bloqueada (mesmo admin)', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('escrita direta via PostgREST bloqueada (mesmo admin)', SQLSTATE||' '||left(SQLERRM,50), SQLSTATE = '42501');
  END;
  -- admin vincula a CONTA do líder ao ministério 1
  UPDATE ministries SET leader_user_id = u_leader WHERE id = m1;
  INSERT INTO t(cenario, resultado, ok) VALUES ('admin vincula leader_user_id (conta) ao ministério 1', (SELECT (leader_user_id = u_leader)::text FROM ministries WHERE id = m1), (SELECT leader_user_id = u_leader FROM ministries WHERE id = m1));
  INSERT INTO t(cenario, resultado, ok) VALUES ('get_church_accounts (admin) lista contas da igreja', (SELECT COUNT(*)::text FROM get_church_accounts()), (SELECT COUNT(*) FROM get_church_accounts()) >= 3);

  -- ── LÍDER (conta vinculada): só o próprio ministério ─────────────────────
  PERFORM set_config('request.jwt.claims', j_leader, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: get_my_managed_ministries = só o ministério 1',
    (SELECT string_agg(ministry_id::text, ',') FROM get_my_managed_ministries()),
    (SELECT COUNT(*) FROM get_my_managed_ministries()) = 1 AND EXISTS (SELECT 1 FROM get_my_managed_ministries() WHERE ministry_id = m1));
  r := ministry_member_add(m1, p2);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: incluir no próprio ministério', r::text, (r->>'inserted')::boolean);
  r := ministry_member_remove(m1, p2);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: remover do próprio ministério', r::text, (r->>'removed')::boolean);
  BEGIN
    PERFORM ministry_member_add(m2, p1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: incluir em OUTRO ministério → FORBIDDEN', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: incluir em OUTRO ministério → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM ministry_member_remove(m2, p2);
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: remover de OUTRO ministério → FORBIDDEN', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: remover de OUTRO ministério → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    UPDATE ministries SET leader_user_id = u_leader WHERE id = m2;
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder não pode se autovincular a outro ministério', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder não pode se autovincular a outro ministério', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM * FROM get_church_accounts();
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: get_church_accounts → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: get_church_accounts → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM * FROM get_ministry_members(m2);
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: LISTAR pessoas de OUTRO ministério → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('líder: LISTAR pessoas de OUTRO ministério → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: SELECT direto em ministry_members só devolve o próprio ministério', (SELECT COUNT(DISTINCT ministry_id)::text||' ministério(s)' FROM ministry_members), (SELECT bool_and(ministry_id = m1) FROM ministry_members) AND (SELECT COUNT(*) FROM ministry_members) >= 1);
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: contagens só do próprio ministério', (SELECT string_agg(ministry_id::text, ',') FROM get_ministry_member_counts(c_igv)), (SELECT bool_and(ministry_id = m1) FROM get_ministry_member_counts(c_igv)));
  INSERT INTO t(cenario, resultado, ok) VALUES ('líder: pode listar o PRÓPRIO ministério', (SELECT COUNT(*)::text FROM get_ministry_members(m1)), (SELECT COUNT(*) FROM get_ministry_members(m1)) = 1);

  -- ── PONTE POR E-MAIL REMOVIDA: ser a PESSOA líder (leader_id) não autoriza a conta ──
  PERFORM set_config('request.jwt.claims', j_admin, true);
  UPDATE ministries SET leader_user_id = NULL WHERE id = m2;
  UPDATE ministries SET leader_id = (SELECT p.id FROM people p JOIN profiles pr ON lower(pr.email) = lower(p.email) WHERE pr.user_id = u_common AND p.church_id = c_igv LIMIT 1) WHERE id = m2;
  PERFORM set_config('request.jwt.claims', j_common, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('pessoa líder (leader_id) com e-mail igual ao da conta NÃO gere sem leader_user_id',
    'leader_id casado por e-mail='||(SELECT (leader_id IS NOT NULL)::text FROM ministries WHERE id = m2)||' / can_manage='||can_manage_ministry(m2),
    NOT can_manage_ministry(m2));

  -- ── COMUM (sem papel de gestão, sem conta vinculada) ─────────────────────
  PERFORM set_config('request.jwt.claims', j_common, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('comum: get_my_managed_ministries vazio', (SELECT COUNT(*)::text FROM get_my_managed_ministries()), (SELECT COUNT(*) FROM get_my_managed_ministries()) = 0);
  BEGIN
    PERFORM ministry_member_add(m1, p2);
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: incluir → FORBIDDEN', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: incluir → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM * FROM get_ministry_members(m1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: listar pessoas → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: listar pessoas → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  INSERT INTO t(cenario, resultado, ok) VALUES ('comum: SELECT direto em ministry_members → 0 linhas', (SELECT COUNT(*)::text FROM ministry_members), (SELECT COUNT(*) FROM ministry_members) = 0);
  BEGIN
    PERFORM ministry_member_remove(m1, p1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: remover → FORBIDDEN', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: remover → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    DELETE FROM ministry_members WHERE ministry_id = m1;
    GET DIAGNOSTICS n = ROW_COUNT;
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: DELETE direto bloqueado', 'linhas='||n, false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('comum: DELETE direto bloqueado', SQLSTATE, SQLSTATE = '42501');
  END;

  -- ── OUTRO TENANT ─────────────────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_other, true);
  BEGIN
    PERFORM * FROM get_ministry_members(m1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: listar → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: listar → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM ministry_member_add(m1, p2);
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: incluir → FORBIDDEN', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: incluir → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM * FROM get_ministry_member_counts(c_igv);
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: contagens → FORBIDDEN', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: contagens → FORBIDDEN', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  SELECT COUNT(*) INTO n FROM ministry_members WHERE ministry_id = m1;
  INSERT INTO t(cenario, resultado, ok) VALUES ('outra igreja: SELECT direto → 0 linhas (RLS)', n::text, n = 0);

  -- ── Busca: regra validada (case / acento / ç) sobre name_sort ────────────
  PERFORM set_config('request.jwt.claims', j_admin, true);
  SELECT bool_and(c = (SELECT COUNT(*) FROM people WHERE church_id=c_igv AND deleted_at IS NULL AND left_at IS NULL AND name_sort ILIKE '%conceicao%'))
    INTO v_ok FROM (SELECT COUNT(*) c FROM people WHERE church_id=c_igv AND deleted_at IS NULL AND left_at IS NULL AND name_sort ILIKE '%'||extensions.unaccent(lower('Conceição'))||'%'
                    UNION ALL SELECT COUNT(*) FROM people WHERE church_id=c_igv AND deleted_at IS NULL AND left_at IS NULL AND name_sort ILIKE '%'||extensions.unaccent(lower('CONCEICAO'))||'%') x;
  INSERT INTO t(cenario, resultado, ok) VALUES ('busca Conceição = conceicao = CONCEICAO (name_sort)', v_ok::text, v_ok);

  INSERT INTO t(cenario, resultado, ok) VALUES ('volunteers: políticas/grants inalterados', (SELECT COUNT(*)::text FROM pg_policies WHERE tablename='volunteers')||' políticas', (SELECT COUNT(*) FROM pg_policies WHERE tablename='volunteers') = 2 AND has_table_privilege('authenticated','volunteers','DELETE'));
END $$;

-- volunteers 100% intocada: comparação feita fora do papel authenticated (tabela inteira)
RESET ROLE;
INSERT INTO t(cenario, resultado, ok)
SELECT 'volunteers intocada (md5 e contagem iguais, todas as igrejas)', c.cnt_before||' → '||(SELECT COUNT(*) FROM volunteers)||' / md5 igual='||(c.snap_before = (SELECT md5(string_agg(x::text, '|' ORDER BY id)) FROM volunteers x)),
       c.snap_before = (SELECT md5(string_agg(x::text, '|' ORDER BY id)) FROM volunteers x) AND c.cnt_before = (SELECT COUNT(*) FROM volunteers)
FROM ctx c;

SELECT seq, cenario, resultado, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END status FROM t ORDER BY seq;
ROLLBACK;
