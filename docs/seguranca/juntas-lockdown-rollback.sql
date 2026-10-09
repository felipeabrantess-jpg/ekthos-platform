-- ============================================================
-- ROLLBACK de 20261010100000_juntas_tables_lockdown.sql
--
-- Restaura EXATAMENTE o estado anterior (auditado em 2026-10-09):
--   RLS desativado e privilégios arwdDxtm para anon e authenticated.
-- ATENÇÃO: esse estado é o VULNERÁVEL (leitura/escrita públicas).
-- Use somente se o consumidor legítimo deixar de funcionar e a causa
-- for este lockdown — e reaplique o lockdown assim que corrigir.
--
-- Não toca em dados. Executa em milissegundos.
-- ============================================================

BEGIN;

ALTER TABLE public.juntas_conversations      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.juntas_processed_messages DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.juntas_conversations      TO anon, authenticated;
GRANT ALL ON TABLE public.juntas_processed_messages TO anon, authenticated;

COMMENT ON TABLE public.juntas_conversations      IS NULL;
COMMENT ON TABLE public.juntas_processed_messages IS NULL;

COMMIT;

-- Verificação esperada após o rollback:
--   SELECT relname, relrowsecurity, relacl FROM pg_class
--    WHERE oid IN ('public.juntas_conversations'::regclass,'public.juntas_processed_messages'::regclass);
--   => relrowsecurity=false; relacl = {postgres=arwdDxtm/postgres,anon=arwdDxtm/postgres,
--                                      authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}
