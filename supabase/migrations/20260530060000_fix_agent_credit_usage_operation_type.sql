-- Migration: fix CHECK constraint de agent_credit_usage.operation_type
-- Applied: 2026-05-30 (D4 MEGA-ONDA CIRÚRGICA — smoke test D4-SB07 revelou constraint inválida)
--
-- Diagnóstico D4-SMOKE:
--   Constraint original: ('message','extraction','synthesis','confirmation')
--   processJourney usava: 'touchpoint'  → falhava silenciosamente no try/catch
--   processInbound (D4): 'inbound_reply' → idem
--   agent_credit_usage estava VAZIA (0 rows) — debit NUNCA funcionou desde criação
--
-- Fix: adicionar 'touchpoint' e 'inbound_reply' à constraint
-- Risco: ZERO — tabela vazia, sem dados históricos a preservar
-- Prova empírica pós-fix:
--   - SMOKE-POSITIVO: Mock (62e473b8) → ok:true, remaining:599, debited_from_cycle:1 ✅
--   - SMOKE-NEGATIVO: Minha Fé (5156cc30) → ok:false, error:no_subscription ✅

ALTER TABLE public.agent_credit_usage
  DROP CONSTRAINT agent_credit_usage_operation_type_check;

ALTER TABLE public.agent_credit_usage
  ADD CONSTRAINT agent_credit_usage_operation_type_check
  CHECK (operation_type = ANY (ARRAY[
    'message'::text,
    'extraction'::text,
    'synthesis'::text,
    'confirmation'::text,
    'touchpoint'::text,
    'inbound_reply'::text
  ]));
