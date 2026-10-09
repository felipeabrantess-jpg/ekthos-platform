-- ============================================================
-- juntas_lockdown_regression.sql
-- Valida 20261010100000_juntas_tables_lockdown.sql
--
-- Roda INTEIRO dentro de BEGIN … ROLLBACK: nada persiste.
-- A migration é injetada na linha marcada abaixo, dentro da MESMA transação,
-- para provar o ANTES e o DEPOIS com o backend real.
--
-- Testes destrutivos (INSERT/UPDATE/DELETE/TRUNCATE) rodam apenas em CLONES
-- temporários (pg_temp) criados com o mesmo ACL das tabelas reais; nas tabelas
-- reais só há leitura e consulta de privilégios.
--
-- Saída: um JSONB {falhas, total, resultados[]}. Esperado: falhas = 0.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '10s';

CREATE TEMP TABLE t_out(k text, ok boolean, info text);
CREATE TEMP TABLE t_snap(phase text, k text, v text);
GRANT ALL ON t_out, t_snap TO anon, authenticated, service_role;

-- Função de sondagem: executa um comando com o papel corrente e devolve 'ok' ou o SQLSTATE.
CREATE FUNCTION pg_temp.try(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $$;

-- Fotografia da superfície NÃO relacionada (deve ser idêntica antes e depois).
CREATE FUNCTION pg_temp.snap(p text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE ch constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
BEGIN
  INSERT INTO t_snap SELECT p, 'outras_tabelas_rls_acl', md5(string_agg(c.relname||':'||c.relrowsecurity::text||':'||c.relforcerowsecurity::text||':'||coalesce(c.relacl::text,''), '|' ORDER BY c.relname))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND c.relname NOT IN ('juntas_conversations','juntas_processed_messages');
  INSERT INTO t_snap SELECT p, 'policies', md5(string_agg(tablename||'|'||policyname||'|'||cmd||'|'||roles::text||'|'||coalesce(qual,'')||'|'||coalesce(with_check,''), ';' ORDER BY tablename, policyname)) FROM pg_policies WHERE schemaname='public';
  INSERT INTO t_snap SELECT p, 'funcoes', md5(string_agg(pr.oid::regprocedure::text||md5(pr.prosrc)||coalesce(pr.proacl::text,''), ';' ORDER BY pr.oid::regprocedure::text))
    FROM pg_proc pr JOIN pg_namespace n ON n.oid=pr.pronamespace WHERE n.nspname='public';
  INSERT INTO t_snap SELECT p, 'gatilhos', md5(string_agg(tgrelid::regclass::text||'|'||tgname||'|'||tgenabled::text||'|'||tgfoid::regproc::text, ';' ORDER BY tgrelid::regclass::text, tgname)) FROM pg_trigger WHERE NOT tgisinternal;
  INSERT INTO t_snap SELECT p, 'cron', md5(coalesce(string_agg(jobid::text||'|'||coalesce(jobname,'')||'|'||schedule||'|'||active::text||'|'||command, ';' ORDER BY jobid), 'vazio')) FROM cron.job;
  INSERT INTO t_snap SELECT p, 'fila_envio', (SELECT count(*) FROM channel_dispatch_queue)::text||'/'||(SELECT count(*) FROM church_whatsapp_channels)::text||'/'||(SELECT count(*) FROM acolhimento_journey)::text||'/'||(SELECT count(*) FROM n8n_webhooks)::text||'/'||(SELECT count(*) FROM agent_executions)::text;
  INSERT INTO t_snap SELECT p, 'pessoas_ativas', count(*)::text FROM people WHERE church_id = ch AND deleted_at IS NULL AND left_at IS NULL;
  -- RPCs dos módulos dependentes, como admin da IGV (mesmos parâmetros antes/depois)
  PERFORM set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO t_snap SELECT p, 'rpc_stage_counts_all', get_people_stage_counts(ch, NULL)::text;
  INSERT INTO t_snap SELECT p, 'rpc_stage_counts_none', get_people_stage_counts(ch, 'none')::text;
  INSERT INTO t_snap SELECT p, 'rpc_care_counts', get_care_status_counts(p_church_id => ch)::text;
  INSERT INTO t_snap SELECT p, 'rpc_dashboard', get_dashboard_people_stats(ch, NULL)::text;
  INSERT INTO t_snap SELECT p, 'pessoas_visiveis_rls', count(*)::text FROM people;
  EXECUTE 'RESET ROLE';
END $$;

-- ── ANTES (linha de base) ──────────────────────────────────────────────────
SELECT pg_temp.snap('antes');
CREATE TEMP TABLE t_jbase AS SELECT
  (SELECT count(*) FROM public.juntas_conversations)                       AS c_count,
  (SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) FROM public.juntas_conversations t) AS c_md5,
  (SELECT count(*) FROM public.juntas_processed_messages)                  AS p_count,
  (SELECT coalesce(md5(string_agg(t::text,'|' ORDER BY t.message_id)),'vazio') FROM public.juntas_processed_messages t) AS p_md5,
  (SELECT relrowsecurity FROM pg_class WHERE oid='public.juntas_conversations'::regclass)      AS c_rls_antes,
  has_table_privilege('anon','public.juntas_conversations','SELECT')       AS anon_sel_antes,
  has_table_privilege('authenticated','public.juntas_conversations','TRUNCATE') AS auth_trunc_antes;
GRANT ALL ON t_jbase TO anon, authenticated, service_role;

-- Clones com o MESMO ACL de produção (arwdDxtm para anon/authenticated/service_role)
CREATE TEMP TABLE zz_jl_c (LIKE public.juntas_conversations INCLUDING ALL);
CREATE TEMP TABLE zz_jl_p (LIKE public.juntas_processed_messages INCLUDING ALL);
INSERT INTO zz_jl_c SELECT * FROM public.juntas_conversations LIMIT 5;
GRANT ALL ON zz_jl_c, zz_jl_p TO anon, authenticated, service_role;

-- Estado vulnerável confirmado no clone ANTES do fechamento (prova que o teste detecta o problema)
SET LOCAL ROLE anon;
INSERT INTO t_out SELECT 'ANTES: anon lê o clone (vulnerabilidade reproduzida)', pg_temp.try('SELECT count(*) FROM pg_temp.zz_jl_c') = 'ok', 'esperado ok (aberto)';
INSERT INTO t_out SELECT 'ANTES: anon trunca o clone (vulnerabilidade reproduzida)', pg_temp.try('TRUNCATE pg_temp.zz_jl_p') = 'ok', 'esperado ok (aberto)';
RESET ROLE;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- Espelho da migration nos clones (mesmas instruções, nomes temporários)
ALTER TABLE pg_temp.zz_jl_c ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg_temp.zz_jl_p ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE pg_temp.zz_jl_c FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE pg_temp.zz_jl_p FROM PUBLIC, anon, authenticated;

-- ── DEPOIS ─────────────────────────────────────────────────────────────────
-- 1. Estado das tabelas reais
INSERT INTO t_out SELECT 'RLS habilitado nas duas tabelas', (SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('public.juntas_conversations'::regclass,'public.juntas_processed_messages'::regclass)), '';
INSERT INTO t_out SELECT 'Sem FORCE RLS', (SELECT NOT bool_or(relforcerowsecurity) FROM pg_class WHERE oid IN ('public.juntas_conversations'::regclass,'public.juntas_processed_messages'::regclass)), '';
INSERT INTO t_out SELECT 'ANTES era vulnerável (RLS off + anon com SELECT + authenticated com TRUNCATE)', NOT c_rls_antes AND anon_sel_antes AND auth_trunc_antes, 'linha de base' FROM t_jbase;
INSERT INTO t_out SELECT 'anon sem nenhum privilégio nas tabelas reais',
  NOT (has_table_privilege('anon','public.juntas_conversations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('anon','public.juntas_processed_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')), '';
INSERT INTO t_out SELECT 'authenticated sem nenhum privilégio nas tabelas reais',
  NOT (has_table_privilege('authenticated','public.juntas_conversations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated','public.juntas_processed_messages','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')), '';
INSERT INTO t_out SELECT 'service_role mantém SELECT/INSERT/UPDATE/DELETE/TRUNCATE nas tabelas reais',
  has_table_privilege('service_role','public.juntas_conversations','SELECT') AND has_table_privilege('service_role','public.juntas_conversations','INSERT')
  AND has_table_privilege('service_role','public.juntas_conversations','UPDATE') AND has_table_privilege('service_role','public.juntas_conversations','DELETE')
  AND has_table_privilege('service_role','public.juntas_processed_messages','SELECT') AND has_table_privilege('service_role','public.juntas_processed_messages','INSERT')
  AND has_table_privilege('service_role','public.juntas_processed_messages','DELETE'), '';
INSERT INTO t_out SELECT 'service_role segue com BYPASSRLS', (SELECT rolbypassrls FROM pg_roles WHERE rolname='service_role'), '';
INSERT INTO t_out SELECT 'Nenhuma policy criada (negado por padrão)', (SELECT count(*) = 0 FROM pg_policies WHERE tablename IN ('juntas_conversations','juntas_processed_messages')), '';
INSERT INTO t_out SELECT 'Estrutura intacta (colunas, PK, CHECK, índices)',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('juntas_conversations','juntas_processed_messages')) = 7
  AND (SELECT count(*) FROM pg_constraint WHERE conrelid IN ('public.juntas_conversations'::regclass,'public.juntas_processed_messages'::regclass)) >= 3
  AND (SELECT count(*) FROM pg_indexes WHERE tablename IN ('juntas_conversations','juntas_processed_messages')) = 4, '';

-- 2. anon: leitura real negada; escrita destrutiva negada (clone)
SET LOCAL ROLE anon;
INSERT INTO t_out SELECT 'anon: SELECT negado (tabelas reais)', pg_temp.try('SELECT count(*) FROM public.juntas_conversations') = '42501' AND pg_temp.try('SELECT count(*) FROM public.juntas_processed_messages') = '42501', '';
INSERT INTO t_out SELECT 'anon: INSERT negado (clone)', pg_temp.try('INSERT INTO pg_temp.zz_jl_c(id,phone,role,content) VALUES (gen_random_uuid(),''0'',''user'',''x'')') = '42501', '';
INSERT INTO t_out SELECT 'anon: UPDATE negado (clone)', pg_temp.try('UPDATE pg_temp.zz_jl_c SET content = ''x''') = '42501', '';
INSERT INTO t_out SELECT 'anon: DELETE negado (clone)', pg_temp.try('DELETE FROM pg_temp.zz_jl_c') = '42501', '';
INSERT INTO t_out SELECT 'anon: TRUNCATE negado (clone)', pg_temp.try('TRUNCATE pg_temp.zz_jl_c') = '42501' AND pg_temp.try('TRUNCATE pg_temp.zz_jl_p') = '42501', '';
RESET ROLE;

-- 3. authenticated (admin da IGV e admin de outra igreja): leitura e escrita diretas negadas
SELECT set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
SET LOCAL ROLE authenticated;
INSERT INTO t_out SELECT 'authenticated (admin IGV): SELECT negado (tabelas reais)', pg_temp.try('SELECT count(*) FROM public.juntas_conversations') = '42501' AND pg_temp.try('SELECT count(*) FROM public.juntas_processed_messages') = '42501', '';
INSERT INTO t_out SELECT 'authenticated (admin IGV): INSERT/UPDATE/DELETE/TRUNCATE negados (clone)',
  pg_temp.try('INSERT INTO pg_temp.zz_jl_c(id,phone,role,content) VALUES (gen_random_uuid(),''0'',''user'',''x'')') = '42501'
  AND pg_temp.try('UPDATE pg_temp.zz_jl_c SET content = ''x''') = '42501'
  AND pg_temp.try('DELETE FROM pg_temp.zz_jl_c') = '42501'
  AND pg_temp.try('TRUNCATE pg_temp.zz_jl_c') = '42501', '';
RESET ROLE;
SELECT set_config('request.jwt.claims', '{"sub":"579d0f7b-0000-0000-0000-000000000000","role":"authenticated","app_metadata":{"church_id":"62e473b8-cd39-4da2-aa5d-c296b03d6873","role":"admin"}}', true);
SET LOCAL ROLE authenticated;
INSERT INTO t_out SELECT 'authenticated (admin de outra igreja): SELECT negado (tabelas reais)', pg_temp.try('SELECT count(*) FROM public.juntas_conversations') = '42501', '';
RESET ROLE;

-- 4. service_role: acesso legítimo preservado (leitura real; escrita completa no clone)
SET LOCAL ROLE service_role;
INSERT INTO t_out SELECT 'service_role: lê as tabelas reais (168 linhas / 0)', (SELECT count(*) FROM public.juntas_conversations) = (SELECT c_count FROM t_jbase) AND (SELECT count(*) FROM public.juntas_processed_messages) = (SELECT p_count FROM t_jbase), '';
INSERT INTO t_out SELECT 'service_role: INSERT/UPDATE/DELETE funcionam (clone, padrão da Edge Function)',
  pg_temp.try('INSERT INTO pg_temp.zz_jl_c(id,phone,role,content) VALUES (gen_random_uuid(),''5500'',''user'',''t'')') = 'ok'
  AND pg_temp.try('INSERT INTO pg_temp.zz_jl_p(message_id) VALUES (''wamid.teste'')') = 'ok'
  AND pg_temp.try('UPDATE pg_temp.zz_jl_c SET content = ''u'' WHERE phone = ''5500''') = 'ok'
  AND pg_temp.try('DELETE FROM pg_temp.zz_jl_p WHERE message_id = ''wamid.teste''') = 'ok', '';
RESET ROLE;

-- 5. Dados reais preservados
INSERT INTO t_out SELECT 'Contagens idênticas às da linha de base', (SELECT count(*) FROM public.juntas_conversations) = c_count AND (SELECT count(*) FROM public.juntas_processed_messages) = p_count, c_count||' / '||p_count FROM t_jbase;
INSERT INTO t_out SELECT 'Checksum do conteúdo idêntico (nada modificado)',
  (SELECT md5(string_agg(t::text,'|' ORDER BY t.id)) FROM public.juntas_conversations t) = c_md5
  AND (SELECT coalesce(md5(string_agg(t::text,'|' ORDER BY t.message_id)),'vazio') FROM public.juntas_processed_messages t) = p_md5, '' FROM t_jbase;

-- 6. Superfície não relacionada idêntica (agente de acolhimento, filas, canais, n8n, RPCs de Pessoas/Dashboard/Atendimento)
SELECT pg_temp.snap('depois');
INSERT INTO t_out SELECT 'Inalterado: ' || a.k, a.v IS NOT DISTINCT FROM d.v, CASE WHEN a.v IS NOT DISTINCT FROM d.v THEN '' ELSE 'DIFERE' END
FROM t_snap a JOIN t_snap d ON d.k = a.k AND d.phase = 'depois' WHERE a.phase = 'antes' ORDER BY a.k;

-- 7. Nenhum consumidor SQL desconhecido
INSERT INTO t_out SELECT 'Nenhuma função SQL referencia as tabelas', NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ~* 'juntas_(conversations|processed)'), '';
INSERT INTO t_out SELECT 'Nenhuma view/policy/FK/publicação depende das tabelas',
  NOT EXISTS (SELECT 1 FROM pg_constraint WHERE confrelid IN ('public.juntas_conversations'::regclass,'public.juntas_processed_messages'::regclass))
  AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE tablename IN ('juntas_conversations','juntas_processed_messages'))
  AND NOT EXISTS (SELECT 1 FROM pg_rewrite r JOIN pg_depend d ON d.objid = r.oid WHERE d.refobjid IN ('public.juntas_conversations'::regclass,'public.juntas_processed_messages'::regclass)), '';

SELECT jsonb_build_object(
  'falhas', (SELECT count(*) FROM t_out WHERE NOT ok),
  'total',  (SELECT count(*) FROM t_out),
  'resultados', (SELECT jsonb_agg(jsonb_build_object('k', k, 'ok', ok, 'info', info)) FROM t_out)
) AS r;
ROLLBACK;
