-- ============================================================
-- Migration 20260426000033: tabela auxiliar de rate limiting
-- para a Edge Function lead-capture
-- Sem RLS pública: acesso apenas via service_role na EF
-- ============================================================

CREATE TABLE IF NOT EXISTS public.lead_capture_rate_limits (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address    inet        NOT NULL,
  email         varchar     NOT NULL,
  plan_interest varchar     NOT NULL,
  user_agent    text,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  was_blocked   boolean     NOT NULL DEFAULT false,
  block_reason  varchar
);

CREATE INDEX IF NOT EXISTS idx_lead_rate_ip_time
  ON public.lead_capture_rate_limits(ip_address, submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_lead_rate_email_plan_time
  ON public.lead_capture_rate_limits(email, plan_interest, submitted_at DESC);

ALTER TABLE public.lead_capture_rate_limits ENABLE ROW LEVEL SECURITY;

-- Apenas admins Ekthos globais podem ler (auditoria de bloqueios)
CREATE POLICY "lead_rate_admin_read" ON public.lead_capture_rate_limits
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles r
      WHERE r.user_id = auth.uid()
        AND r.role = 'admin'::app_role
        AND r.church_id IS NULL
    )
  );

-- Cron de limpeza: apagar registros > 7 dias
-- Ativar quando pg_cron estiver habilitado no projeto
--
-- SELECT cron.schedule('cleanup_lead_rate_limits', '0 3 * * *', $$
--   DELETE FROM public.lead_capture_rate_limits
--   WHERE submitted_at < now() - interval '7 days';
-- $$);