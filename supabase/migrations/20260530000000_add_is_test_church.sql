-- Migration: add is_test_church flag to churches
-- Applied: 2026-05-30 (MEGA-ONDA F1.4)
-- Purpose: Marcar igrejas de teste/sandbox para ignorar eventos Stripe LIVE.

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS is_test_church BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.churches.is_test_church IS
  'Marca igrejas de teste/sandbox. Webhooks Stripe ignoram eventos de is_test_church=true.';

CREATE INDEX IF NOT EXISTS idx_churches_is_test_church
  ON public.churches (is_test_church)
  WHERE is_test_church = true;

-- Marcar todas as igrejas existentes como is_test_church=true
-- (todos os registros atuais são ambientes de teste/desenvolvimento)
UPDATE public.churches SET is_test_church = true WHERE is_test_church = false;
