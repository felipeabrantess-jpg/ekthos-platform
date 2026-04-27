-- ============================================================
-- F3: Camada Cupons — coupons + coupon_redemptions
-- ============================================================
-- Cupom de afiliado como infraestrutura comercial.
-- Stripe é motor (mirror), Ekthos é fonte de verdade.
-- Mesma lógica vale pra self-service (landing) e cockpit_assisted.
-- coupon_redemptions é log auditável de toda tentativa.
--
-- NÃO cria mirror automático Stripe (F4 - próxima sessão).
-- NÃO cria affiliate_attributions ainda (F7).
-- ============================================================

-- ── 1. Tabela coupons ─────────────────────────────────────────

CREATE TABLE public.coupons (
  id   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar UNIQUE NOT NULL,

  coupon_type varchar NOT NULL,
  -- 'affiliate' | 'promo' | 'partner'

  affiliate_id uuid REFERENCES public.affiliates(id) ON DELETE SET NULL,

  -- Desconto
  discount_type  varchar NOT NULL,
  -- 'percent_off' | 'amount_off'
  discount_value integer NOT NULL,
  duration       varchar NOT NULL,
  -- 'once' | 'forever' | 'repeating'
  duration_in_months integer,

  -- Comissão (para coupon_type='affiliate')
  commission_type     varchar,
  -- 'percent_of_sale' | 'fixed_per_sale' | 'recurring_percent'
  commission_value    integer,
  commission_duration varchar,
  -- 'first_payment_only' | 'first_3_months' |
  -- 'first_12_months' | 'lifetime' | 'until_churn'

  -- Validade
  valid_from  timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,

  -- Limites
  max_redemptions  integer,
  max_per_customer integer NOT NULL DEFAULT 1,
  times_redeemed   integer NOT NULL DEFAULT 0,

  -- Escopo (slug-based, coerente com F1)
  plan_scope text[] NOT NULL DEFAULT ARRAY['*'],

  -- Stripe mirror (F4 vai popular)
  stripe_coupon_id          varchar UNIQUE,
  stripe_promotion_code_id  varchar UNIQUE,
  stripe_synced_at          timestamptz,

  -- Atribuição estendida (UTM/campaign)
  campaign_id          uuid,   -- FK virá em F11
  default_utm_source   varchar,
  default_utm_medium   varchar,
  default_utm_campaign varchar,

  active     boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- ── CHECKs ──────────────────────────────────────────────────
  CONSTRAINT chk_coupon_type CHECK (
    coupon_type IN ('affiliate', 'promo', 'partner')
  ),
  CONSTRAINT chk_discount_type CHECK (
    discount_type IN ('percent_off', 'amount_off')
  ),
  CONSTRAINT chk_duration CHECK (
    duration IN ('once', 'forever', 'repeating')
  ),
  CONSTRAINT chk_repeating_requires_months CHECK (
    duration != 'repeating' OR duration_in_months IS NOT NULL
  ),
  CONSTRAINT chk_affiliate_id_required CHECK (
    (coupon_type = 'affiliate' AND affiliate_id IS NOT NULL)
    OR (coupon_type != 'affiliate')
  ),
  CONSTRAINT chk_commission_required_for_affiliate CHECK (
    (coupon_type = 'affiliate'
      AND commission_type  IS NOT NULL
      AND commission_value IS NOT NULL)
    OR (coupon_type != 'affiliate')
  ),
  CONSTRAINT chk_commission_type CHECK (
    commission_type IS NULL OR commission_type IN (
      'percent_of_sale', 'fixed_per_sale', 'recurring_percent'
    )
  ),
  CONSTRAINT chk_commission_duration CHECK (
    commission_duration IS NULL OR commission_duration IN (
      'first_payment_only', 'first_3_months',
      'first_12_months', 'lifetime', 'until_churn'
    )
  ),
  CONSTRAINT chk_discount_percent_range CHECK (
    discount_type != 'percent_off'
    OR (discount_value >= 0 AND discount_value <= 100)
  ),
  CONSTRAINT chk_validity_dates CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT chk_redemptions_limit CHECK (
    max_redemptions IS NULL OR times_redeemed <= max_redemptions
  )
);

COMMENT ON TABLE public.coupons IS
  'Cupons como infraestrutura comercial. Suporta affiliate, promo, partner. '
  'Stripe mirror em F4.';

-- ── 2. Indexes para coupons ───────────────────────────────────

-- Lookup por código ativo (checkout flow)
CREATE UNIQUE INDEX idx_coupons_code_active
  ON public.coupons (code)
  WHERE active = true;

-- Joins com affiliates (F7)
CREATE INDEX idx_coupons_affiliate
  ON public.coupons (affiliate_id)
  WHERE affiliate_id IS NOT NULL;

-- Cupons válidos agora (janela de tempo)
CREATE INDEX idx_coupons_active_valid
  ON public.coupons (active, valid_from, valid_until)
  WHERE active = true;

-- Analytics por tipo
CREATE INDEX idx_coupons_type
  ON public.coupons (coupon_type, active);

-- ── 3. Trigger updated_at ─────────────────────────────────────
-- set_updated_at() já existe.

CREATE TRIGGER trg_coupons_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Tabela coupon_redemptions (log auditável) ──────────────

CREATE TABLE public.coupon_redemptions (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.coupons(id) ON DELETE RESTRICT,

  -- Quem usou
  email     varchar NOT NULL,
  church_id uuid REFERENCES public.churches(id) ON DELETE SET NULL,

  -- Canal de aplicação
  redemption_channel varchar NOT NULL,
  applied_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Contexto da venda
  plan_slug               varchar NOT NULL REFERENCES public.plans(slug),
  original_price_cents    integer NOT NULL,
  discount_applied_cents  integer NOT NULL,
  final_price_cents       integer NOT NULL,

  -- Status do evento
  status           varchar NOT NULL,
  rejection_reason varchar,

  -- Stripe link
  stripe_checkout_session_id varchar,
  stripe_subscription_id     varchar,

  -- UTM
  utm_source   varchar,
  utm_medium   varchar,
  utm_campaign varchar,
  utm_content  varchar,

  -- Auditoria anti-fraude
  ip_address inet,
  user_agent text,

  created_at   timestamptz NOT NULL DEFAULT now(),
  validated_at timestamptz,
  redeemed_at  timestamptz,
  refunded_at  timestamptz,

  -- ── CHECKs ──────────────────────────────────────────────────
  CONSTRAINT chk_redemption_channel CHECK (
    redemption_channel IN ('stripe_checkout', 'cockpit_assisted', 'api')
  ),
  CONSTRAINT chk_redemption_status CHECK (
    status IN ('attempted', 'validated', 'redeemed', 'rejected', 'refunded')
  ),
  CONSTRAINT chk_rejection_reason CHECK (
    rejection_reason IS NULL OR rejection_reason IN (
      'expired', 'max_redemptions_reached',
      'plan_not_eligible', 'already_used_by_email',
      'inactive', 'invalid_code', 'rate_limit'
    )
  ),
  CONSTRAINT chk_rejected_requires_reason CHECK (
    status != 'rejected' OR rejection_reason IS NOT NULL
  ),
  CONSTRAINT chk_prices_consistent CHECK (
    final_price_cents = original_price_cents - discount_applied_cents
    AND original_price_cents   >= 0
    AND discount_applied_cents >= 0
    AND final_price_cents      >= 0
  ),
  CONSTRAINT chk_cockpit_requires_applied_by CHECK (
    redemption_channel != 'cockpit_assisted' OR applied_by IS NOT NULL
  )
);

COMMENT ON TABLE public.coupon_redemptions IS
  'Log auditável de TODA tentativa de aplicação de cupom (mesmo as inválidas). '
  'Visibilidade do funil + anti-fraude.';

-- ── 5. Indexes para coupon_redemptions ───────────────────────

-- Lookup por cupom + status (relatório de afiliado)
CREATE INDEX idx_redemptions_coupon
  ON public.coupon_redemptions (coupon_id, status);

-- Dedup por email (max_per_customer check em runtime)
CREATE INDEX idx_redemptions_email
  ON public.coupon_redemptions (email);

-- Por igreja (painel do pastor)
CREATE INDEX idx_redemptions_church
  ON public.coupon_redemptions (church_id)
  WHERE church_id IS NOT NULL;

-- Funil por status + tempo (Cockpit analytics)
CREATE INDEX idx_redemptions_status_time
  ON public.coupon_redemptions (status, created_at DESC);

-- Por canal + tempo
CREATE INDEX idx_redemptions_channel
  ON public.coupon_redemptions (redemption_channel, created_at DESC);

-- Anti-fraude: IP recente
CREATE INDEX idx_redemptions_ip_recent
  ON public.coupon_redemptions (ip_address, created_at DESC)
  WHERE ip_address IS NOT NULL;

-- ── 6. FK applied_coupon_id → coupons (criada em F2 como NULL) ─

ALTER TABLE public.subscriptions
  ADD CONSTRAINT fk_subscriptions_coupon
  FOREIGN KEY (applied_coupon_id)
  REFERENCES public.coupons(id)
  ON DELETE SET NULL;

-- ── 7. RLS em coupons ─────────────────────────────────────────

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

-- Pastores NÃO lêem coupons (aplicam via código no checkout, não via SELECT direto).
-- Apenas Ekthos admins gerenciam. service_role bypassa.
CREATE POLICY "coupons_admin_all"
  ON public.coupons
  FOR ALL
  TO authenticated
  USING     (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- ── 8. RLS em coupon_redemptions ─────────────────────────────

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

-- Pastor lê apenas redemptions da própria igreja
CREATE POLICY "redemptions_church_read"
  ON public.coupon_redemptions
  FOR SELECT
  TO authenticated
  USING (church_id = auth_church_id());

-- Admin Ekthos vê e gerencia tudo
CREATE POLICY "redemptions_admin_all"
  ON public.coupon_redemptions
  FOR ALL
  TO authenticated
  USING     (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- ── 9. Seed QA Affiliate (para testes F3/F4) ─────────────────
-- affiliates.email tem UNIQUE constraint → ON CONFLICT seguro.
-- Status inactive: não usar em produção.
-- Pode ser deletado após validação manual completa de F3/F4.

-- Nota: affiliates.status CHECK permite apenas 'active','paused','banned'.
-- Usando 'paused' como equivalente a "não usar em produção".
INSERT INTO public.affiliates (full_name, email, pix_key, status, notes)
VALUES (
  'QA Affiliate F3',
  'qa-affiliate-f3@ekthosai.net',
  'qa-pix-key-f3',
  'paused',
  'Seed criado em F3 para teste de criação de cupom afiliado. Status paused — não usar em produção. Pode ser deletado após validação manual.'
)
ON CONFLICT (email) DO NOTHING;
