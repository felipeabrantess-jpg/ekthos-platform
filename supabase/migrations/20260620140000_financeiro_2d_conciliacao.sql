-- SF 2D-1 Financeiro: conciliação bancária manual
-- Adiciona flag reconciled + reconciled_at em expenses, donations, receivables
-- NÃO altera status, amount ou cálculo de saldo — flag informativa somente
-- RLS existente (3-policy pattern) cobre UPDATE nesses campos automaticamente
-- Reversível: ALTER TABLE ... DROP COLUMN IF EXISTS reconciled, reconciled_at

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS reconciled    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

ALTER TABLE public.donations
  ADD COLUMN IF NOT EXISTS reconciled    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

ALTER TABLE public.receivables
  ADD COLUMN IF NOT EXISTS reconciled    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
