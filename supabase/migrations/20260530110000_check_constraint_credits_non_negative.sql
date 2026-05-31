-- Migration: B-SB09 — CHECK constraints créditos não-negativos
-- Data: 2026-05-30
--
-- Contexto: church_agent_credits não tinha CHECK que impedisse
-- cycle_credits ou topup_credits negativos. Um bug no debit RPC
-- poderia levar saldo a valores inválidos. Aplicado via MCP durante
-- a MEGA-ONDA e documentado aqui para reprodutibilidade.
--
-- Nota: remaining_credits NÃO é coluna — é computado como
-- cycle_credits + topup_credits pelo RPC debit_agent_credits.
-- ============================================================

ALTER TABLE public.church_agent_credits
  DROP CONSTRAINT IF EXISTS chk_cycle_credits_non_negative;
ALTER TABLE public.church_agent_credits
  ADD CONSTRAINT chk_cycle_credits_non_negative
  CHECK (cycle_credits >= 0);

ALTER TABLE public.church_agent_credits
  DROP CONSTRAINT IF EXISTS chk_topup_credits_non_negative;
ALTER TABLE public.church_agent_credits
  ADD CONSTRAINT chk_topup_credits_non_negative
  CHECK (topup_credits >= 0);
