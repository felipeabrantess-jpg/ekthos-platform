-- SF1 Financeiro: financial_categories + bank_accounts
-- Pattern: 3 RLS policies por tabela (tenant_all + role_restrict + service_all)
-- Idêntico ao padrão de donations/financial_campaigns

-- ── financial_categories ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.financial_categories (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   uuid         NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name        text         NOT NULL,
  color       text,
  type        text         NOT NULL DEFAULT 'expense'
                           CHECK (type IN ('income', 'expense', 'both')),
  sort_order  int4         NOT NULL DEFAULT 0,
  is_active   boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY financial_categories_tenant_all ON public.financial_categories
  FOR ALL
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY financial_categories_role_restrict ON public.financial_categories
  FOR ALL
  USING (auth_can_financial() OR auth.role() = 'service_role')
  WITH CHECK (auth_can_financial() OR auth.role() = 'service_role');

CREATE POLICY financial_categories_service_all ON public.financial_categories
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── bank_accounts ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.bank_accounts (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid         NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name            text         NOT NULL,
  bank_name       text,
  account_type    text         NOT NULL DEFAULT 'conta_corrente'
                               CHECK (account_type IN ('conta_corrente', 'poupanca', 'caixa', 'investimento')),
  initial_balance numeric      NOT NULL DEFAULT 0,
  is_active       boolean      NOT NULL DEFAULT true,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY bank_accounts_tenant_all ON public.bank_accounts
  FOR ALL
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY bank_accounts_role_restrict ON public.bank_accounts
  FOR ALL
  USING (auth_can_financial() OR auth.role() = 'service_role')
  WITH CHECK (auth_can_financial() OR auth.role() = 'service_role');

CREATE POLICY bank_accounts_service_all ON public.bank_accounts
  FOR ALL
  USING (auth.role() = 'service_role');
