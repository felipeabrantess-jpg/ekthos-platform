-- Teste de regressão — IMPERSONAÇÃO COM TENANT EFETIVO (ETAPA 2)
-- Simula JWTs via request.jwt.claims. Tudo dentro de UMA transação com ROLLBACK
-- (sessões, inserts e auditoria criados aqui não persistem).
--
-- Atores:
--   A      = usuário comum de "Minha Fé"  (5156cc30…)
--   ADMIN  = Ekthos admin (JWT church = igreja mock 62e473b8…)
--   ADMIN2 = outro Ekthos admin (conta playwright)
--   IGV    = 6c127559…
--
-- Cenários A–J do plano da ETAPA 2 + regressão IGV.

BEGIN;
SET LOCAL ROLE authenticated;
CREATE TEMP TABLE t (seq serial, cenario text, resultado text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  c_igv   constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  c_mock  constant uuid := '62e473b8-cd39-4da2-aa5d-c296b03d6873';
  c_fe    constant uuid := '5156cc30-6d76-4487-99ba-fff8013b38d4';
  c_admin constant uuid := '579d0f7b-9b8b-4c20-94c5-513b4a424642';
  c_adm2  constant uuid := '94957675-2ac2-4b56-8959-b21d78bb44df';
  c_user  constant uuid := '00000000-0000-0000-0000-000000000001';
  j_user  constant text := '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"church_id":"5156cc30-6d76-4487-99ba-fff8013b38d4","role":"admin"}}';
  j_admin constant text := '{"sub":"579d0f7b-9b8b-4c20-94c5-513b4a424642","role":"authenticated","app_metadata":{"church_id":"62e473b8-cd39-4da2-aa5d-c296b03d6873","role":"super_admin","ekthos_roles":["ekthos_admin"],"is_ekthos_admin":true}}';
  j_adm2  constant text := '{"sub":"94957675-2ac2-4b56-8959-b21d78bb44df","role":"authenticated","app_metadata":{"ekthos_roles":["ekthos_admin"]}}';
  ctx jsonb; ctx2 jsonb; s1 uuid; s2 uuid; n bigint; n2 bigint; v text; v_new uuid;
  v_audit_before bigint;
BEGIN
  SELECT COUNT(*) INTO v_audit_before FROM admin_events WHERE action LIKE 'impersonation.%';

  -- ── A. usuário comum: tenant = própria igreja ──────────────────────────────
  PERFORM set_config('request.jwt.claims', j_user, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('A auth_church_id() = A', auth_church_id()::text, auth_church_id() = c_fe);
  INSERT INTO t(cenario, resultado, ok) VALUES ('A is_impersonating', (get_my_tenant_context()->>'is_impersonating'), (get_my_tenant_context()->>'is_impersonating') = 'false');

  -- ── B. usuário comum A tentando IGV ───────────────────────────────────────
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('B PostgREST people IGV', n::text, n = 0);
  BEGIN
    PERFORM * FROM get_people_page(p_church_id => c_igv, p_limit => 1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('B RPC get_people_page(IGV)', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('B RPC get_people_page(IGV)', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    INSERT INTO people (church_id, name) VALUES (c_igv, '__etapa2_test_B__');
    INSERT INTO t(cenario, resultado, ok) VALUES ('B INSERT people IGV', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('B INSERT people IGV', SQLSTATE || ' ' || left(SQLERRM, 60), SQLSTATE = '42501');
  END;

  -- ── I. usuário comum tentando impersonar ──────────────────────────────────
  BEGIN
    PERFORM impersonation_start(c_igv, 'x');
    INSERT INTO t(cenario, resultado, ok) VALUES ('I impersonation_start por usuário comum', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('I impersonation_start por usuário comum', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    INSERT INTO impersonate_sessions (admin_user_id, church_id) VALUES (c_user, c_igv);
    INSERT INTO t(cenario, resultado, ok) VALUES ('I INSERT direto impersonate_sessions', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('I INSERT direto impersonate_sessions', SQLSTATE || ' ' || left(SQLERRM, 60), SQLSTATE = '42501');
  END;

  -- ── C. Ekthos admin SEM sessão ────────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', j_admin, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('C auth_church_id() sem sessão', auth_church_id()::text, auth_church_id() = c_mock);
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('C PostgREST people IGV sem sessão', n::text, n = 0);
  BEGIN
    PERFORM * FROM get_people_page(p_church_id => c_igv, p_limit => 1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('C RPC get_people_page(IGV) sem sessão', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('C RPC get_people_page(IGV) sem sessão', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  BEGIN
    PERFORM * FROM get_discipulado_overview(c_igv, 30, NULL);
    INSERT INTO t(cenario, resultado, ok) VALUES ('C RPC get_discipulado_overview(IGV) sem sessão', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('C RPC get_discipulado_overview(IGV) sem sessão', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;

  -- ── D. Ekthos admin impersonando IGV ──────────────────────────────────────
  ctx := impersonation_start(c_igv, 'teste etapa 2');
  s1  := (ctx->>'impersonation_session_id')::uuid;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D start → effective_church_id', ctx->>'effective_church_id', (ctx->>'effective_church_id')::uuid = c_igv);
  INSERT INTO t(cenario, resultado, ok) VALUES ('D start → is_impersonating/role', (ctx->>'is_impersonating') || '/' || (ctx->>'role'), (ctx->>'is_impersonating') = 'true' AND (ctx->>'role') = 'admin');
  INSERT INTO t(cenario, resultado, ok) VALUES ('D start → church_name', ctx->>'church_name', ctx->>'church_name' IS NOT NULL);
  INSERT INTO t(cenario, resultado, ok) VALUES ('D auth_church_id() = IGV', auth_church_id()::text, auth_church_id() = c_igv);
  INSERT INTO t(cenario, resultado, ok) VALUES ('D auth_user_role() = admin', auth_user_role()::text, auth_user_role() = 'admin');
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND deleted_at IS NULL;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D PostgREST people IGV (RLS)', n::text, n > 5000);
  SELECT COUNT(*) INTO n FROM people;  -- sem filtro: RLS restringe ao tenant impersonado
  SELECT COUNT(*) INTO n2 FROM people WHERE church_id <> c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D PostgREST people sem filtro = só IGV', n::text || ' (outras igrejas: ' || n2 || ')', n > 5000 AND n2 = 0);
  SELECT COUNT(*) INTO n FROM church_units WHERE church_id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D PostgREST church_units IGV', n::text, n = 2);
  SELECT COUNT(*) INTO n FROM pipeline_stages WHERE church_id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D PostgREST pipeline_stages IGV', n::text, n > 0);
  SELECT COUNT(*) INTO n FROM tags WHERE church_id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D PostgREST tags IGV', n::text, true);
  SELECT COUNT(*) INTO n FROM churches WHERE id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D PostgREST churches(IGV)', n::text, n = 1);
  SELECT total_count INTO n FROM get_people_page(p_church_id => c_igv, p_limit => 1) LIMIT 1;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D RPC get_people_page(IGV)', n::text, n > 5000);
  SELECT COUNT(*) INTO n FROM get_discipulado_overview(c_igv, 30, NULL);
  INSERT INTO t(cenario, resultado, ok) VALUES ('D RPC get_discipulado_overview(IGV)', n::text || ' etapas', n > 0);
  SELECT COUNT(*) INTO n FROM get_unit_counts(c_igv);
  INSERT INTO t(cenario, resultado, ok) VALUES ('D RPC get_unit_counts(IGV)', n::text || ' linhas', n > 0);
  -- INSERT sem church_id explícito → precisa ser rejeitado (não há default); com IGV → aceito; com outra igreja → rejeitado
  BEGIN
    INSERT INTO people (church_id, name) VALUES (c_igv, '__etapa2_test_D__') RETURNING id INTO v_new;
    INSERT INTO t(cenario, resultado, ok) VALUES ('D INSERT people IGV (com church_id efetivo)', 'ACEITO ' || v_new, true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('D INSERT people IGV (com church_id efetivo)', SQLSTATE || ' ' || left(SQLERRM, 80), false);
  END;
  BEGIN
    INSERT INTO people (church_id, name) VALUES (c_mock, '__etapa2_test_D2__');
    INSERT INTO t(cenario, resultado, ok) VALUES ('D INSERT people igreja original durante impersonação', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('D INSERT people igreja original durante impersonação', SQLSTATE, SQLSTATE = '42501');
  END;
  BEGIN
    INSERT INTO people (church_id, name) VALUES (c_fe, '__etapa2_test_D3__');
    INSERT INTO t(cenario, resultado, ok) VALUES ('D INSERT people igreja C durante impersonação', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('D INSERT people igreja C durante impersonação', SQLSTATE, SQLSTATE = '42501');
  END;
  -- UPDATE por id em outra igreja: RLS não alcança a linha (0 rows)
  UPDATE people SET name = name WHERE id = (SELECT id FROM people WHERE church_id = c_fe LIMIT 1);
  GET DIAGNOSTICS n = ROW_COUNT;
  INSERT INTO t(cenario, resultado, ok) VALUES ('D UPDATE people de outra igreja por id', n::text || ' linhas', n = 0);
  -- RPC da igreja original agora é FORBIDDEN (tenant efetivo é IGV)
  BEGIN
    PERFORM * FROM get_people_page(p_church_id => c_mock, p_limit => 1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('D RPC igreja original durante impersonação', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('D RPC igreja original durante impersonação', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;

  -- ── K. Regressão IGV sob impersonação (lista = badge = dashboard) ─────────
  SELECT (get_people_stage_counts(c_igv, NULL)->>'total') || ' / ' ||
         (get_people_stage_counts(c_igv, 'dcf2852d-e790-46dc-b66b-e8f74977a706')->>'total') || ' / ' ||
         (get_people_stage_counts(c_igv, 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f')->>'total') || ' / ' ||
         (get_people_stage_counts(c_igv, 'none')->>'total') INTO v;
  INSERT INTO t(cenario, resultado, ok) VALUES ('K IGV Todas / Itaipu / Trindade / Sem unidade', v, true);
  SELECT (get_dashboard_people_stats(c_igv, NULL)->>'total') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'dcf2852d-e790-46dc-b66b-e8f74977a706')->>'total') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f')->>'total') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'none')->>'total') INTO v;
  INSERT INTO t(cenario, resultado, ok) VALUES ('K IGV dashboard Todas / Itaipu / Trindade / Sem', v, true);
  SELECT (get_dashboard_people_stats(c_igv, NULL)->>'membros') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'dcf2852d-e790-46dc-b66b-e8f74977a706')->>'membros') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f')->>'membros') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'none')->>'membros') INTO v;
  INSERT INTO t(cenario, resultado, ok) VALUES ('K IGV Membro Todas / Itaipu / Trindade / Sem', v, true);
  SELECT (get_dashboard_people_stats(c_igv, NULL)->>'novos_convertidos') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'dcf2852d-e790-46dc-b66b-e8f74977a706')->>'novos_convertidos') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f')->>'novos_convertidos') || ' / ' ||
         (get_dashboard_people_stats(c_igv, 'none')->>'novos_convertidos') INTO v;
  INSERT INTO t(cenario, resultado, ok) VALUES ('K IGV Novo Convertido Todas / Itaipu / Trindade / Sem', v, true);

  -- ── F. "refresh": novo get_my_tenant_context continua IGV (sessão no banco) ─
  ctx2 := get_my_tenant_context();
  INSERT INTO t(cenario, resultado, ok) VALUES ('F refresh mantém IGV', ctx2->>'effective_church_id', (ctx2->>'effective_church_id')::uuid = c_igv AND (ctx2->>'impersonation_session_id')::uuid = s1);

  -- ── J. outro admin tentando encerrar a sessão ─────────────────────────────
  PERFORM set_config('request.jwt.claims', j_adm2, true);
  BEGIN
    PERFORM impersonation_end(s1, 'hijack');
    INSERT INTO t(cenario, resultado, ok) VALUES ('J end com session_id de outro admin', 'ACEITO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('J end com session_id de outro admin', SQLERRM, SQLERRM ILIKE '%SESSION_NOT_FOUND%');
  END;
  INSERT INTO t(cenario, resultado, ok) VALUES ('J sessão de outro admin não afeta meu tenant', COALESCE(auth_church_id()::text, 'NULL'), auth_church_id() IS DISTINCT FROM c_igv);
  PERFORM set_config('request.jwt.claims', j_admin, true);
  INSERT INTO t(cenario, resultado, ok) VALUES ('J sessão continua aberta após tentativa', (SELECT (ended_at IS NULL)::text FROM impersonate_sessions WHERE id = s1), (SELECT ended_at IS NULL FROM impersonate_sessions WHERE id = s1));

  -- ── G. encerrar: próxima query volta ao tenant original ───────────────────
  ctx := impersonation_end(s1, 'manual_exit');
  INSERT INTO t(cenario, resultado, ok) VALUES ('G end → effective_church_id', ctx->>'effective_church_id', (ctx->>'effective_church_id')::uuid = c_mock AND (ctx->>'is_impersonating') = 'false');
  INSERT INTO t(cenario, resultado, ok) VALUES ('G auth_church_id() após end', auth_church_id()::text, auth_church_id() = c_mock);
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv;
  INSERT INTO t(cenario, resultado, ok) VALUES ('G PostgREST people IGV após end', n::text, n = 0);
  BEGIN
    PERFORM * FROM get_people_page(p_church_id => c_igv, p_limit => 1);
    INSERT INTO t(cenario, resultado, ok) VALUES ('G RPC IGV após end', 'ABERTO', false);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t(cenario, resultado, ok) VALUES ('G RPC IGV após end', SQLERRM, SQLERRM ILIKE '%FORBIDDEN%');
  END;
  ctx := impersonation_end(s1, 'manual_exit');
  INSERT INTO t(cenario, resultado, ok) VALUES ('G end idempotente', ctx->>'already_ended', (ctx->>'already_ended') = 'true');

  -- ── H. duas sessões: a segunda substitui a primeira (transacional, auditada) ─
  ctx  := impersonation_start(c_igv, 'h1');
  s1   := (ctx->>'impersonation_session_id')::uuid;
  ctx2 := impersonation_start(c_fe, 'h2');
  s2   := (ctx2->>'impersonation_session_id')::uuid;
  SELECT COUNT(*) INTO n FROM impersonate_sessions WHERE admin_user_id = c_admin AND ended_at IS NULL;
  INSERT INTO t(cenario, resultado, ok) VALUES ('H sessões abertas após 2º start', n::text, n = 1);
  INSERT INTO t(cenario, resultado, ok) VALUES ('H tenant efetivo = 2ª igreja', ctx2->>'effective_church_id', (ctx2->>'effective_church_id')::uuid = c_fe AND auth_church_id() = c_fe);
  INSERT INTO t(cenario, resultado, ok) VALUES ('H 1ª sessão ended_reason', (SELECT ended_reason FROM impersonate_sessions WHERE id = s1), (SELECT ended_reason = 'superseded' FROM impersonate_sessions WHERE id = s1));
  PERFORM impersonation_end(s2, 'manual_exit');

  -- ── E. localStorage forjado ≡ sem sessão no banco (já coberto por C) ──────
  INSERT INTO t(cenario, resultado, ok) VALUES ('E sem sessão no banco → tenant original', auth_church_id()::text, auth_church_id() = c_mock);

  -- ── Auditoria ────────────────────────────────────────────────────────────
  SELECT COUNT(*) - v_audit_before INTO n FROM admin_events WHERE action LIKE 'impersonation.%';
  INSERT INTO t(cenario, resultado, ok) VALUES ('AUDIT eventos impersonation.* gerados', n::text, n >= 6);
END $$;

SELECT seq, cenario, resultado, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END status FROM t ORDER BY seq;
ROLLBACK;
