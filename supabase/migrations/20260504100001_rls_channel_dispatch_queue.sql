-- Migration: rls_channel_dispatch_queue
-- Achado C1 — auditoria de segurança 03-04/05/2026
--
-- Problema: channel_dispatch_queue não tinha RLS habilitado.
--   Qualquer usuário authenticated podia ler, escrever e deletar
--   mensagens da fila de envio de WhatsApp via API REST do Supabase.
--
-- Consumers identificados (pré-auditoria 04/05/2026):
--   ESCREVE: agent-acolhimento (via enqueue_message tool) e conversation-send-message
--   LÊ/ATUALIZA: channel-dispatcher (worker de processamento em batch)
--   Todos usam supabaseAdmin (service_role) — NUNCA JWT de usuário autenticado
--   Frontend: ZERO acesso direto a esta tabela
--
-- Decisão:
--   service_role → acesso total (INSERT/SELECT/UPDATE — fluxo operacional)
--   Admin Ekthos authenticated → SELECT apenas (monitoramento no cockpit)
--   Pastor / authenticated genérico → ZERO acesso (tabela técnica interna)
--
-- Padrão admin: is_ekthos_admin() — conforme policies existentes em
--   health_scores, impersonate_sessions, churches, subscriptions, plans

ALTER TABLE public.channel_dispatch_queue ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (EFs de dispatch e agentes escrevem aqui)
DROP POLICY IF EXISTS "service_role_all_channel_dispatch_queue" ON public.channel_dispatch_queue;
CREATE POLICY "service_role_all_channel_dispatch_queue"
  ON public.channel_dispatch_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin Ekthos: leitura para monitoramento via cockpit
DROP POLICY IF EXISTS "admin_ekthos_select_channel_dispatch_queue" ON public.channel_dispatch_queue;
CREATE POLICY "admin_ekthos_select_channel_dispatch_queue"
  ON public.channel_dispatch_queue
  FOR SELECT
  TO authenticated
  USING (is_ekthos_admin());
