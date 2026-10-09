-- ============================================================
-- 20261010100000_juntas_tables_lockdown.sql
--
-- Fecha o acesso público às tabelas do agente Juntas:
--   public.juntas_conversations
--   public.juntas_processed_messages
--
-- PROBLEMA (auditoria de segurança 2026-10-09):
--   As duas tabelas estavam SEM RLS e com todos os privilégios
--   (SELECT, INSERT, UPDATE, DELETE, TRUNCATE...) concedidos a anon e
--   authenticated. Com a chave pública (anon) do app qualquer pessoa podia
--   ler, alterar, apagar ou truncar conversas de WhatsApp (168 linhas,
--   29 telefones). Nenhuma policy existia.
--
-- CONSUMIDOR LEGÍTIMO (verificado em 2026-10-09 nas 111 Edge Functions
-- implantadas e no catálogo do banco):
--   Somente a Edge Function `juntas-whatsapp-agent`, que usa
--   SUPABASE_SERVICE_ROLE_KEY (service_role, BYPASSRLS). Nenhuma função SQL,
--   view, policy, gatilho, FK ou publicação realtime referencia as tabelas.
--
-- CORREÇÃO MÍNIMA (somente permissões; nenhuma linha é tocada):
--   1. Habilita RLS (sem policy = negado para papéis sem BYPASSRLS).
--   2. Revoga todos os privilégios de PUBLIC, anon e authenticated.
--   3. service_role NÃO é alterado (mantém os privilégios e o BYPASSRLS).
--   - Sem FORCE ROW LEVEL SECURITY (o dono e o service_role seguem operando).
--   - Sem DROP, DELETE, UPDATE, TRUNCATE ou alteração de estrutura.
--
-- Idempotente: pode ser reexecutada sem efeito colateral.
-- Rollback: docs/seguranca/juntas-lockdown-rollback.sql
-- ============================================================

ALTER TABLE public.juntas_conversations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.juntas_processed_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.juntas_conversations      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.juntas_processed_messages FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.juntas_conversations IS
  'Agente Juntas (WhatsApp). Acesso exclusivo via service_role (Edge Function juntas-whatsapp-agent). RLS ativo sem policy; anon/authenticated sem privilégios. Ver 20261010100000_juntas_tables_lockdown.sql';
COMMENT ON TABLE public.juntas_processed_messages IS
  'Agente Juntas (WhatsApp) — dedupe de message_id. Acesso exclusivo via service_role. RLS ativo sem policy; anon/authenticated sem privilégios. Ver 20261010100000_juntas_tables_lockdown.sql';
