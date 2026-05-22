-- ============================================================
-- Migration: fix_pipeline_entry_point_cluster_a
-- Sprint: Cluster A — Bugs #1 e #12
-- Criada em: 2026-05-21
--
-- A1: Corrige is_entry_point=false em 2 igrejas afetadas:
--   - 5156cc30 (Minha Fé / Vanessa)
--   - 89c7d9de (Meu Avivamento)
--
-- A2: Preventiva global — garante que toda igreja com stages
--   ativos mas sem entry_point definido tenha order_index=0
--   como entry_point. Idempotente por design.
--
-- Efeito colateral desejado: capture_visitor_to_pipeline RPC
-- passa a encontrar entry_point e insere em person_pipeline.
-- ============================================================

-- A1: Fix direto nas 2 igrejas identificadas
UPDATE public.pipeline_stages
SET is_entry_point = true
WHERE church_id IN (
  '5156cc30-6d76-4487-99ba-fff8013b38d4',
  '89c7d9de-6258-4531-ba3a-17e345545e6f'
)
  AND order_index = 0
  AND is_active = true
  AND is_entry_point = false;

-- A2: Preventiva global — qualquer igreja com stages ativos
-- mas sem nenhum entry_point → define order_index=0 como entry_point
UPDATE public.pipeline_stages ps
SET is_entry_point = true
WHERE ps.order_index = 0
  AND ps.is_active = true
  AND ps.is_entry_point = false
  AND NOT EXISTS (
    SELECT 1 FROM public.pipeline_stages other
    WHERE other.church_id = ps.church_id
      AND other.is_entry_point = true
      AND other.is_active = true
  );
