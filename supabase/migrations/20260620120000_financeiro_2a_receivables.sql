-- SF 2A Financeiro: tabela receivables (contas a receber)
-- Isolamento multi-tenant via church_id + RLS 3-policy
-- Status: a_receber (padrão) | recebido

CREATE TABLE IF NOT EXISTS public.receivables (
  id              uuid         NOT NULL DEFAULT gen_random_uuid(),
  church_id       uuid         NOT NULL,
  description     text         NOT NULL,
  amount          numeric      NOT NULL,
  due_date        date         NULL,
  payer_name      text         NULL,
  person_id       uuid         NULL,
  status          text         NOT NULL DEFAULT 'a_receber'
                    CONSTRAINT receivables_status_check
                    CHECK (status IN ('a_receber', 'recebido')),
  received_date   date         NULL,
  bank_account_id uuid         NULL,
  category_id     uuid         NULL,
  receipt_path    text         NULL,
  notes           text         NULL,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  updated_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT receivables_pkey PRIMARY KEY (id)
);

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

-- Isolamento por tenant
CREATE POLICY receivables_tenant_all ON public.receivables
  FOR ALL
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- Restrição por role: admin ou tesoureiro
CREATE POLICY receivables_role_restrict ON public.receivables
  FOR ALL
  USING (auth_can_financial())
  WITH CHECK (auth_can_financial());

-- Service role sem restrição (Edge Functions, crons)
CREATE POLICY receivables_service_all ON public.receivables
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
