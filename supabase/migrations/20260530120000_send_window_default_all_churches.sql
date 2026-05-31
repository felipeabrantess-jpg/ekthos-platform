-- Migration: B-SB10 — send_window padrão para todas as igrejas de teste
-- Data: 2026-05-30
-- Auditoria: docs/product/B-SB10-SEND-WINDOW-CHURCHES.md
--
-- Contexto: Igrejas sem send_window configurado para agent-acolhimento
-- poderiam enviar mensagens a qualquer hora (0-23h). Definido padrão
-- seguro: {"start":7,"end":22} (7h-22h, horário de Brasília UTC-3).
--
-- Coluna: church_agent_config.agent_slug (é agent_slug, não agent_scope)
-- Slug em produção: 'agent-acolhimento'
--
-- Estado pré-migração:
-- - Minha Fé: send_window {"start":8,"end":21} — mantido (não alterado)
-- - Igreja Mock: send_window {"start":0,"end":23} — mantido (não alterado)
-- - Church demo: linha existia mas send_window NULL → UPDATE aplicado
-- - 5 igrejas restantes: sem linha → INSERT aplicado
--
-- Esta migration é idempotente por ON CONFLICT DO UPDATE.
-- ============================================================

INSERT INTO public.church_agent_config (church_id, agent_slug, send_window, updated_at)
SELECT
  c.id,
  'agent-acolhimento',
  '{"start":7,"end":22}'::jsonb,
  now()
FROM public.churches c
WHERE c.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.church_agent_config cac
    WHERE cac.church_id = c.id
      AND cac.agent_slug = 'agent-acolhimento'
      AND cac.send_window IS NOT NULL
  )
ON CONFLICT (church_id, agent_slug) DO UPDATE
  SET send_window = EXCLUDED.send_window,
      updated_at  = EXCLUDED.updated_at
WHERE church_agent_config.send_window IS NULL;
