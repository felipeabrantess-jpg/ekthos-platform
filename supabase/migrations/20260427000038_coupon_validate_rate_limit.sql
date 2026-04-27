-- ============================================================
-- F5: Rate limit auxiliar para coupon-validate
-- ============================================================
-- Espelha lead_capture_rate_limits (SEC-006 hardening) substituindo
-- plan_interest por coupon_code. Anti-fraude: bloqueia tentativas
-- excessivas de "adivinhar" códigos de cupom via força bruta.
--
-- DIFERENÇA vs lead_capture_rate_limits:
--   O contador aqui inclui TODAS as tentativas (bloqueadas e não
--   bloqueadas). Cupom é alvo clássico de força bruta; lockout
--   duro é a proteção correta (decisão Felipe, 27/04/2026).
-- ============================================================

CREATE TABLE public.coupon_validate_rate_limits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address   inet        NOT NULL,
  email        varchar     NOT NULL,
  coupon_code  varchar     NOT NULL,
  user_agent   text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  was_blocked  boolean     NOT NULL DEFAULT false,
  block_reason varchar
);

-- Lookup principal: rate limit por IP na janela de 1h
CREATE INDEX idx_coupon_rate_ip_time
  ON public.coupon_validate_rate_limits (ip_address, attempted_at DESC);

-- Rate limit por email
CREATE INDEX idx_coupon_rate_email_time
  ON public.coupon_validate_rate_limits (email, attempted_at DESC);

-- Auditoria anti-fraude: bloqueios recentes
CREATE INDEX idx_coupon_rate_blocked
  ON public.coupon_validate_rate_limits (was_blocked, attempted_at DESC)
  WHERE was_blocked = true;

ALTER TABLE public.coupon_validate_rate_limits ENABLE ROW LEVEL SECURITY;

-- Apenas admin Ekthos lê (auditoria + investigação anti-fraude)
-- service_role bypassa RLS — EF usa service_role.
CREATE POLICY "coupon_rate_admin_read"
  ON public.coupon_validate_rate_limits
  FOR SELECT
  TO authenticated
  USING (is_ekthos_admin());

COMMENT ON TABLE public.coupon_validate_rate_limits IS
  'F5: log auditável de toda tentativa de validação de cupom + flag de bloqueio. '
  'Espelha lead_capture_rate_limits. Conta TODAS as tentativas (inclusive bloqueadas) '
  'para rate limit mais restritivo contra força bruta de códigos.';
