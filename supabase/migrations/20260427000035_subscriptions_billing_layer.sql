-- ============================================================
-- F2: Camada Billing — refatoração de subscriptions
-- ============================================================
-- Enriquece subscriptions pra suportar múltiplas origens de
-- contratação (stripe, cockpit_manual, affiliate_coupon, etc).
-- Adiciona effective_price, discount e referência ao coupon
-- aplicado.
--
-- NÃO altera lógica do webhook Stripe (F6).
-- NÃO altera RLS de outras tabelas (F8).
--
-- ADAPTAÇÃO vs spec original (aprovada por Felipe em 27/04/2026):
--   Passo 3: backfill de effective_price_cents usa custom_plan_price_cents
--   (coluna real) em vez de custom_chamado/missao/avivamento (inexistentes).
--   FK applied_coupon_id -> coupons adiada para F3 (tabela ainda não existe).
-- ============================================================

-- ── 1. Adicionar colunas novas ────────────────────────────────

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_origin        varchar,
  ADD COLUMN IF NOT EXISTS effective_price_cents integer,
  ADD COLUMN IF NOT EXISTS discount_cents        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS applied_coupon_id     uuid,
  ADD COLUMN IF NOT EXISTS created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_notes        text;

-- ── 2. Backfill de billing_origin ────────────────────────────
-- Subscriptions com stripe_subscription_id => 'stripe'
-- Sem Stripe e plano definido => 'cockpit_manual' (placeholder, revisar no Cockpit)

UPDATE public.subscriptions
SET billing_origin = CASE
  WHEN stripe_subscription_id IS NOT NULL THEN 'stripe'
  ELSE 'cockpit_manual'
END
WHERE billing_origin IS NULL;

-- ── 3. Backfill de effective_price_cents ─────────────────────
-- Usa custom_plan_price_cents (preço negociado manualmente) se existir,
-- senão cai para plans.price_cents (preço de tabela).

UPDATE public.subscriptions s
SET effective_price_cents = COALESCE(
  s.custom_plan_price_cents,
  (SELECT p.price_cents FROM public.plans p WHERE p.slug = s.plan_slug LIMIT 1)
)
WHERE s.effective_price_cents IS NULL
  AND s.plan_slug IS NOT NULL;

-- ── 4. Tornar billing_origin NOT NULL após backfill ───────────

ALTER TABLE public.subscriptions
  ALTER COLUMN billing_origin SET NOT NULL;

-- ── 5. CHECK constraint em billing_origin ────────────────────

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_billing_origin CHECK (
    billing_origin IN (
      'stripe',
      'cockpit_manual',
      'affiliate_coupon',
      'promo_coupon',
      'partner',
      'courtesy'
    )
  );

-- ── 6. CHECK em discount_cents (não-negativo) ────────────────

ALTER TABLE public.subscriptions
  ADD CONSTRAINT chk_discount_non_negative CHECK (
    discount_cents >= 0
  );

-- ── 7. Indexes ────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_subscriptions_billing_origin
  ON public.subscriptions (billing_origin);

CREATE INDEX IF NOT EXISTS idx_subscriptions_applied_coupon
  ON public.subscriptions (applied_coupon_id)
  WHERE applied_coupon_id IS NOT NULL;

-- ── 8. FK applied_coupon_id -> coupons: adiada para F3 ────────
-- A tabela coupons ainda não existe neste momento.
-- A FK será adicionada na migration 20260427000036 após CREATE TABLE coupons.

-- ── 9. Depreciar churches.subscription_plan ──────────────────

COMMENT ON COLUMN public.churches.subscription_plan IS
  'DEPRECATED em F2 (27/04/2026). Plano real está em public.subscriptions.plan_slug. '
  'Esta coluna NÃO deve ser usada para decisões de produto. '
  'Será removida após F8 quando todas as RLS migrarem para church_has_access().';

-- ── 10. Audit log da migration ────────────────────────────────

INSERT INTO public.audit_logs (
  church_id, entity_type, entity_id, action,
  actor_type, actor_id, payload
)
SELECT
  s.church_id,
  'subscription',
  s.id,
  'f2_migration_billing_origin',
  'system',
  'migration_20260427000035',
  jsonb_build_object(
    'billing_origin',         s.billing_origin,
    'effective_price_cents',  s.effective_price_cents,
    'note', 'F2 backfill: billing_origin e effective_price preenchidos automaticamente'
  )
FROM public.subscriptions s
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs al
  WHERE al.action    = 'f2_migration_billing_origin'
    AND al.entity_id = s.id
);
