-- ============================================================
-- F1: Camada de Entitlements (access_grants)
-- ============================================================
-- Cria a fonte de verdade de "quem pode acessar o quê e por quê".
-- Separa do Billing (subscriptions): permite trial, cortesia,
-- parceiro e admin override sem depender de Stripe.
--
-- Esta migration NÃO altera RLS de outras tabelas.
-- Esta migration NÃO mexe em enabled_modules.
-- F8 fará a unificação via church_has_feature() futura.
--
-- ADAPTAÇÃO vs spec original:
--   plan_id uuid REFERENCES plans(id) → plan_slug text REFERENCES plans(slug)
--   Motivo: plans.slug é a PK (varchar). plans não tem coluna id.
--   Confirmado via information_schema antes de escrever este arquivo.
-- ============================================================

-- ── 1. Tabela access_grants ───────────────────────────────────

CREATE TABLE public.access_grants (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   uuid    NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  plan_slug   text    NOT NULL REFERENCES public.plans(slug)  ON DELETE RESTRICT,

  grant_type  varchar NOT NULL,
  source      varchar NOT NULL,

  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,

  starts_at   timestamptz NOT NULL DEFAULT now(),
  ends_at     timestamptz,

  active      boolean NOT NULL DEFAULT true,

  granted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_reason  varchar,
  notes           text,

  -- Vínculos opcionais (preenchidos por outras fases)
  campaign_id  uuid,                                           -- FK virá em F3
  affiliate_id uuid REFERENCES public.affiliates(id),

  -- Conversão trial -> paid
  converts_to_paid            boolean     DEFAULT false,
  converted_at                timestamptz,
  converted_to_subscription_id uuid REFERENCES public.subscriptions(id),

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_grant_type CHECK (
    grant_type IN (
      'paid',
      'manual_trial',
      'promo_trial',
      'courtesy',
      'partner',
      'admin_override'
    )
  ),
  CONSTRAINT chk_source CHECK (
    source IN (
      'stripe',
      'cockpit',
      'affiliate_coupon',
      'campaign',
      'system',
      'migration'
    )
  ),
  CONSTRAINT chk_dates_consistent CHECK (
    ends_at IS NULL OR ends_at > starts_at
  ),
  CONSTRAINT chk_paid_requires_subscription CHECK (
    grant_type != 'paid' OR subscription_id IS NOT NULL
  )
);

COMMENT ON TABLE public.access_grants IS
  'Camada de Entitlements: quem pode acessar o quê até quando, e por quê. '
  'Separada da Camada Billing (subscriptions).';

COMMENT ON COLUMN public.access_grants.plan_slug IS
  'Plano associado ao grant (FK para plans.slug). '
  'Para admin_override sem plano natural, usar o plano base como referência.';

-- ── 2. Indexes ────────────────────────────────────────────────

-- Lookup principal: church ativa + janela de tempo
CREATE INDEX idx_access_grants_church_active
  ON public.access_grants (church_id, active, starts_at, ends_at);

-- Joins com subscriptions (webhook Stripe)
CREATE INDEX idx_access_grants_subscription
  ON public.access_grants (subscription_id)
  WHERE subscription_id IS NOT NULL;

-- Joins com affiliates (F7 Afiliados)
CREATE INDEX idx_access_grants_affiliate
  ON public.access_grants (affiliate_id)
  WHERE affiliate_id IS NOT NULL;

-- Analytics: quantas igrejas ativas por grant_type
CREATE INDEX idx_access_grants_grant_type
  ON public.access_grants (grant_type, active)
  WHERE active = true;

-- Alertas de expiração iminente (job futuro)
CREATE INDEX idx_access_grants_ends_soon
  ON public.access_grants (ends_at)
  WHERE active = true AND ends_at IS NOT NULL;

-- ── 3. Trigger updated_at ─────────────────────────────────────
-- set_updated_at() já existe (confirmado via pg_proc). Não recriar.

CREATE TRIGGER trg_access_grants_updated_at
  BEFORE UPDATE ON public.access_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 4. Função church_has_access() ────────────────────────────

CREATE OR REPLACE FUNCTION public.church_has_access(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.access_grants
    WHERE church_id = p_church_id
      AND active    = true
      AND starts_at <= now()
      AND (ends_at IS NULL OR ends_at > now())
  );
$$;

COMMENT ON FUNCTION public.church_has_access(uuid) IS
  'Retorna true se a igreja tem ao menos um access_grant ativo e válido. '
  'Núcleo da Camada Entitlements. Usar em RLS e Edge Functions.';

-- ── 5. Função helper grant_access() ──────────────────────────

CREATE OR REPLACE FUNCTION public.grant_access(
  p_church_id       uuid,
  p_plan_slug       text,
  p_grant_type      varchar,
  p_source          varchar,
  p_subscription_id uuid        DEFAULT NULL,
  p_starts_at       timestamptz DEFAULT now(),
  p_ends_at         timestamptz DEFAULT NULL,
  p_granted_reason  varchar     DEFAULT NULL,
  p_notes           text        DEFAULT NULL,
  p_granted_by      uuid        DEFAULT NULL,
  p_affiliate_id    uuid        DEFAULT NULL,
  p_converts_to_paid boolean    DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grant_id uuid;
BEGIN
  INSERT INTO public.access_grants (
    church_id, plan_slug, grant_type, source,
    subscription_id, starts_at, ends_at,
    granted_by, granted_reason, notes,
    affiliate_id, converts_to_paid
  )
  VALUES (
    p_church_id, p_plan_slug, p_grant_type, p_source,
    p_subscription_id, p_starts_at, p_ends_at,
    p_granted_by, p_granted_reason, p_notes,
    p_affiliate_id, p_converts_to_paid
  )
  RETURNING id INTO v_grant_id;

  -- Audit log — schema real: (church_id, entity_type, entity_id, action,
  --   actor_type, actor_id, payload, model_used, tokens_used, created_at)
  INSERT INTO public.audit_logs (
    church_id, entity_type, entity_id, action,
    actor_type, actor_id, payload
  )
  VALUES (
    p_church_id,
    'access_grant',
    v_grant_id,
    'created',
    CASE WHEN p_granted_by IS NULL THEN 'system' ELSE 'user' END,
    COALESCE(p_granted_by::text, 'system'),
    jsonb_build_object(
      'grant_type',       p_grant_type,
      'source',           p_source,
      'plan_slug',        p_plan_slug,
      'subscription_id',  p_subscription_id,
      'starts_at',        p_starts_at,
      'ends_at',          p_ends_at,
      'granted_reason',   p_granted_reason,
      'affiliate_id',     p_affiliate_id,
      'converts_to_paid', p_converts_to_paid
    )
  );

  RETURN v_grant_id;
END;
$$;

COMMENT ON FUNCTION public.grant_access IS
  'Helper para criar access_grant com auditoria automática em audit_logs. '
  'Usado por webhook Stripe, cockpit, e migration de dados.';

-- ── 6. RLS em access_grants ───────────────────────────────────

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

-- Policy 1: SELECT pela igreja dona (multi-tenant)
-- auth_church_id() existe (confirmado via pg_proc).
CREATE POLICY "access_grants_church_read"
  ON public.access_grants
  FOR SELECT
  TO authenticated
  USING (church_id = auth_church_id());

-- Policy 2: ALL para Ekthos admins
-- is_ekthos_admin() existe (confirmado via pg_proc).
CREATE POLICY "access_grants_admin_all"
  ON public.access_grants
  FOR ALL
  TO authenticated
  USING     (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- service_role bypassa RLS por padrão — não precisa de policy.

-- ── 7. Migração de dados ──────────────────────────────────────
-- Popula access_grants para as 3 igrejas existentes no momento
-- desta migration (diagnóstico T1).
--
-- Estratégia (Decisão Felipe — Opção A):
--   - Church com subscription ativa → grant 'paid'
--   - Church configured/active SEM subscription → grant 'admin_override'
--   - Church em 'onboarding' → sem grant (fluxo normal ao completar setup)

-- 7.1 — Churches com subscription ativa: criar grant 'paid'
INSERT INTO public.access_grants (
  church_id, plan_slug, grant_type, source,
  subscription_id, starts_at, granted_reason, notes
)
SELECT
  c.id                                   AS church_id,
  s.plan_slug                            AS plan_slug,
  'paid'                                 AS grant_type,
  'migration'                            AS source,
  s.id                                   AS subscription_id,
  s.created_at                           AS starts_at,
  'migracao_F1_subscription_ativa'       AS granted_reason,
  'Grant criado automaticamente na migration F1 a partir de subscription ativa. '
    || 'Plano: ' || s.plan_slug          AS notes
FROM public.churches c
JOIN public.subscriptions s ON s.church_id = c.id
WHERE s.status       = 'active'
  AND c.status       IN ('configured', 'active');

-- 7.2 — Churches configured/active SEM subscription: grant 'admin_override'
-- Decisão Felipe: preservar acesso + marcar pra revisão no F11 Cockpit.
INSERT INTO public.access_grants (
  church_id, plan_slug, grant_type, source,
  starts_at, granted_reason, notes
)
SELECT
  c.id                                        AS church_id,
  'chamado'                                   AS plan_slug,
  'admin_override'                            AS grant_type,
  'migration'                                 AS source,
  c.created_at                                AS starts_at,
  'migracao_F1_sem_subscription_revisar'      AS granted_reason,
  'Church configured/active sem subscription ativa no momento da migração F1. '
    || 'Acesso preservado via admin_override. '
    || 'AÇÃO NECESSÁRIA: revisar no Cockpit (F11) — cobrar retroativo, '
    || 'manter como cortesia/parceiro, ou desativar.'  AS notes
FROM public.churches c
WHERE c.status IN ('configured', 'active')
  AND NOT EXISTS (
    SELECT 1 FROM public.access_grants ag WHERE ag.church_id = c.id
  );

-- 7.3 — Churches em 'onboarding': sem grant.
-- Quando completarem onboarding + pagamento, grant criado pelo webhook Stripe.

-- ── 8. Audit log da migration ─────────────────────────────────
-- Registra os grants criados por esta migration para rastreabilidade.
-- Nota: grants criados via INSERT direto (não via grant_access()),
-- por isso o audit log é explícito aqui. Em runtime, sempre usar
-- grant_access() que auditória automaticamente.

INSERT INTO public.audit_logs (
  church_id, entity_type, entity_id, action,
  actor_type, actor_id, payload
)
SELECT
  ag.church_id,
  'access_grants_migration',
  ag.id,
  'f1_migration_executed',
  'system',
  'migration_20260427000034',
  jsonb_build_object(
    'migration',       'F1_access_grants_base',
    'grant_type',      ag.grant_type,
    'plan_slug',       ag.plan_slug,
    'granted_reason',  ag.granted_reason
  )
FROM public.access_grants ag
WHERE ag.granted_reason LIKE 'migracao_F1%';
