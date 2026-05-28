-- Migration: rls_visitor_capture_rate_limits
-- Achado C2 — auditoria de segurança 03-04/05/2026
--
-- Problema: visitor_capture_rate_limits não tinha RLS habilitado.
--   Qualquer usuário authenticated podia ler dados de rate limiting
--   (IPs, telefones, padrões de bloqueio) de qualquer igreja via API REST.
--
-- Consumers identificados (pré-auditoria 04/05/2026):
--   ESCREVE: visitor-capture (endpoint público — sem JWT, usa service_role)
--     3 casos: IP rate limit bloqueado, dedup 24h bloqueado, submissão OK
--   LÊ: visitor-capture (verifica contadores antes de bloquear/permitir)
--   Frontend: ZERO acesso direto — visitor-capture é chamado pelo QR Code público
--
-- Decisão:
--   service_role → acesso total (visitor-capture escreve e lê aqui)
--   Admin Ekthos authenticated → SELECT para debugging/monitoramento
--   Pastor / authenticated genérico → ZERO acesso (tabela técnica de rate limiting)
--
-- Padrão admin: is_ekthos_admin() — conforme policies existentes no projeto

ALTER TABLE public.visitor_capture_rate_limits ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (EF visitor-capture lê e escreve aqui via supabaseAdmin)
DROP POLICY IF EXISTS "service_role_all_visitor_capture_rate_limits" ON public.visitor_capture_rate_limits;
CREATE POLICY "service_role_all_visitor_capture_rate_limits"
  ON public.visitor_capture_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin Ekthos: leitura para debugging e análise de bloqueios
DROP POLICY IF EXISTS "admin_ekthos_select_visitor_capture_rate_limits" ON public.visitor_capture_rate_limits;
CREATE POLICY "admin_ekthos_select_visitor_capture_rate_limits"
  ON public.visitor_capture_rate_limits
  FOR SELECT
  TO authenticated
  USING (is_ekthos_admin());
