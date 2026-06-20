-- SF2 Financeiro: tabela expenses + campo bank_account_id em donations
-- Pattern: 3 RLS policies (tenant_all WITH CHECK + role_restrict WITH CHECK + service_all)

-- ── expenses ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.expenses (
  id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid         NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  category_id     uuid         REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  bank_account_id uuid         REFERENCES public.bank_accounts(id) ON DELETE SET NULL,
  amount          numeric      NOT NULL CHECK (amount > 0),
  description     text         NOT NULL,
  supplier        text,
  expense_date    date         NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  status          text         NOT NULL DEFAULT 'a_pagar'
                               CHECK (status IN ('paga', 'a_pagar')),
  payment_method  text,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY expenses_tenant_all ON public.expenses
  FOR ALL
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY expenses_role_restrict ON public.expenses
  FOR ALL
  USING (auth_can_financial() OR auth.role() = 'service_role')
  WITH CHECK (auth_can_financial() OR auth.role() = 'service_role');

CREATE POLICY expenses_service_all ON public.expenses
  FOR ALL
  USING (auth.role() = 'service_role');

-- ── donations: adicionar campo bank_account_id (nullable) ─────────────────────

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS bank_account_id uuid
    REFERENCES public.bank_accounts(id) ON DELETE SET NULL;
