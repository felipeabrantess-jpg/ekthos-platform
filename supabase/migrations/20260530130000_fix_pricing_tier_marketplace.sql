-- Migration: SA-A3 — Fix pricing_tier mismatch (marketplace vazio)
-- Data: 2026-05-30
--
-- BUG: O DB usava os valores 'internal' e 'premium' para pricing_tier
-- mas o frontend filtrava por 'free' e 'always_paid'.
-- Interseção vazia → marketplace exibia zero agentes.
--
-- CORREÇÃO: Normalizar os valores do DB para o que o frontend espera.
-- Sem risco: pricing_tier não tem CHECK constraint.
--
-- Estado pós-migração esperado:
--   'internal' → 'free'         (agentes incluídos no plano)
--   'premium'  → 'always_paid'  (agentes pagos separados)
--   'coming_soon' — mantido (já coincide com o frontend)
-- ============================================================

UPDATE public.agents_catalog
SET    pricing_tier = 'free',
       updated_at   = now()
WHERE  pricing_tier = 'internal';

UPDATE public.agents_catalog
SET    pricing_tier = 'always_paid',
       updated_at   = now()
WHERE  pricing_tier = 'premium';
