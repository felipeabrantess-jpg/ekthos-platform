-- ============================================================
-- F4: Tabela auxiliar de jobs de sync Stripe
-- ============================================================
-- Fila de retry para mirror Stripe quando criar/atualizar/desativar
-- cupom em public.coupons. Garante idempotência e auditabilidade.
--
-- Substitui lógica das EFs legadas affiliate-coupon-create e
-- affiliate-coupon-toggle (decommission via Opção 1, decisão Felipe
-- 27/04/2026). Tabela legada affiliate_coupons (0 rows) será
-- mantida no schema mas marcada como DEPRECATED via COMMENT.
-- ============================================================

CREATE TABLE public.coupon_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,

  operation varchar NOT NULL,
  status    varchar NOT NULL DEFAULT 'pending',

  attempts     integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,

  last_error      text,
  last_attempt_at timestamptz,
  next_retry_at   timestamptz,

  stripe_response jsonb,

  created_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  CONSTRAINT chk_sync_operation CHECK (
    operation IN ('create', 'update', 'deactivate')
  ),
  CONSTRAINT chk_sync_status CHECK (
    status IN ('pending', 'in_progress', 'success', 'failed', 'abandoned')
  ),
  CONSTRAINT chk_sync_attempts CHECK (
    attempts <= max_attempts
  )
);

COMMENT ON TABLE public.coupon_sync_jobs IS
  'F4: fila de jobs de sync Stripe para public.coupons. Substitui mirror das EFs legadas affiliate-coupon-create/toggle.';

-- ── Indexes ───────────────────────────────────────────────────────────────────

-- Worker: busca jobs pendentes para processar
CREATE INDEX idx_sync_jobs_pending
  ON public.coupon_sync_jobs (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

-- Joins com coupons (auditoria, histórico)
CREATE INDEX idx_sync_jobs_coupon
  ON public.coupon_sync_jobs (coupon_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE public.coupon_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sync_jobs_admin_all"
  ON public.coupon_sync_jobs
  FOR ALL
  TO authenticated
  USING     (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- service_role bypassa RLS — worker usa service_role.

-- ── Trigger: enfileira job de sync ao mexer em coupons ───────────────────────

CREATE OR REPLACE FUNCTION public.queue_coupon_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.coupon_sync_jobs (coupon_id, operation)
    VALUES (NEW.id, 'create');

  ELSIF TG_OP = 'UPDATE' THEN
    -- Só enfileira quando o campo active muda (ativar ou desativar)
    IF OLD.active IS DISTINCT FROM NEW.active THEN
      INSERT INTO public.coupon_sync_jobs (coupon_id, operation)
      VALUES (
        NEW.id,
        CASE WHEN NEW.active THEN 'update' ELSE 'deactivate' END
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.queue_coupon_sync IS
  'F4: enfileira job de sync Stripe em coupon_sync_jobs quando um cupom é criado ou tem active alterado.';

CREATE TRIGGER trg_coupon_sync_queue
  AFTER INSERT OR UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.queue_coupon_sync();

-- ── Marcar tabela legada como deprecated ─────────────────────────────────────

COMMENT ON TABLE public.affiliate_coupons IS
  'DEPRECATED em F4 (27/04/2026). Tabela legada do sistema antigo de afiliados (0 rows em produção). '
  'Substituída por public.coupons + public.coupon_sync_jobs. '
  'Mantida temporariamente para retrocompatibilidade do Cockpit antigo (/admin/afiliados). '
  'Será removida quando F11 migrar Cockpit para usar public.coupons.';

-- ── Proteção: campos imutáveis no Stripe não podem ser alterados ──────────────
-- O Stripe não permite editar discount_type, discount_value, duration ou
-- duration_in_months de um coupon após criação. Esta função impede que
-- alguém altere esses campos em public.coupons depois que o sync Stripe
-- já ocorreu (stripe_coupon_id preenchido), evitando divergência silenciosa.

CREATE OR REPLACE FUNCTION public.prevent_immutable_coupon_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.stripe_coupon_id IS NOT NULL AND (
    OLD.discount_type != NEW.discount_type OR
    OLD.discount_value != NEW.discount_value OR
    OLD.duration != NEW.duration OR
    OLD.duration_in_months IS DISTINCT FROM NEW.duration_in_months
  ) THEN
    RAISE EXCEPTION
      'Cupom já sincronizado com Stripe não pode ter desconto/duração alterados '
      '(imutável no Stripe). Desative este cupom (active=false) e crie um novo '
      'com os valores atualizados.';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.prevent_immutable_coupon_changes IS
  'F4: bloqueia alteração de campos imutáveis no Stripe (discount_type, discount_value, '
  'duration, duration_in_months) quando stripe_coupon_id já foi preenchido.';

CREATE TRIGGER trg_prevent_immutable_coupon_changes
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.prevent_immutable_coupon_changes();
