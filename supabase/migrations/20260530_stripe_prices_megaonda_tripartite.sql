-- Migration: stripe_prices_megaonda_tripartite
-- Date: 2026-05-30
-- MEGA-ONDA TRIPARTITE CURTA — Lane S
--
-- Popula stripe_price_id em plans e credit_packages com os Price IDs
-- criados via Stripe API LIVE durante a execução do Lane S.
--
-- Stripe Products criados (LIVE):
--   prod_UcCz022kzusWt9  — Recarga Emergencial  → price_1TcyZmHfvCy1ruEND2SbGerK
--   prod_UcCzBK6eeCmFRe  — Recarga Ponte        → price_1TcyZpHfvCy1ruENrQi5YdZu
--   prod_UcD0lMfK5Ngpek  — Plano Missão         → price_1Tcya5HfvCy1ruENDXuf9KlM
--   prod_UcD0cpNEpgRrT6  — Plano Avivamento     → price_1Tcya8HfvCy1ruENe5NqXPWH
--   prod_UXxjIUYqumaK6K  — Plano Chamado (pré-existente) → price_1TYroEHfvCy1ruEN6j4QxHmU

-- ── credit_packages ────────────────────────────────────────────────────────────
UPDATE credit_packages
SET stripe_price_id = 'price_1TcyZmHfvCy1ruEND2SbGerK'
WHERE slug = 'topup-emergencial'
  AND stripe_price_id IS NULL;

UPDATE credit_packages
SET stripe_price_id = 'price_1TcyZpHfvCy1ruENrQi5YdZu'
WHERE slug = 'topup-ponte'
  AND stripe_price_id IS NULL;

-- ── plans ──────────────────────────────────────────────────────────────────────
UPDATE plans
SET stripe_price_id = 'price_1TYroEHfvCy1ruEN6j4QxHmU'
WHERE slug = 'chamado'
  AND stripe_price_id IS NULL;

UPDATE plans
SET stripe_price_id = 'price_1Tcya5HfvCy1ruENDXuf9KlM'
WHERE slug = 'missao'
  AND stripe_price_id IS NULL;

UPDATE plans
SET stripe_price_id = 'price_1Tcya8HfvCy1ruENe5NqXPWH'
WHERE slug = 'avivamento'
  AND stripe_price_id IS NULL;

-- ── Audit ──────────────────────────────────────────────────────────────────────
INSERT INTO audit_logs (id, church_id, entity_type, entity_id, action, actor_type, actor_id, payload, created_at)
SELECT
  gen_random_uuid(), NULL, 'system', NULL,
  'stripe_prices_migration_megaonda_tripartite',
  'system',
  '579d0f7b-9b8b-4c20-94c5-513b4a424642',
  jsonb_build_object(
    'migration', '20260530_stripe_prices_megaonda_tripartite',
    'prices_set', jsonb_build_array(
      jsonb_build_object('slug','topup-emergencial','price_id','price_1TcyZmHfvCy1ruEND2SbGerK','amount_brl','9900'),
      jsonb_build_object('slug','topup-ponte','price_id','price_1TcyZpHfvCy1ruENrQi5YdZu','amount_brl','26900'),
      jsonb_build_object('slug','chamado','price_id','price_1TYroEHfvCy1ruEN6j4QxHmU','amount_brl','68990','note','pre_existing'),
      jsonb_build_object('slug','missao','price_id','price_1Tcya5HfvCy1ruENDXuf9KlM','amount_brl','163990'),
      jsonb_build_object('slug','avivamento','price_id','price_1Tcya8HfvCy1ruENe5NqXPWH','amount_brl','246990')
    )
  ),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs WHERE action = 'stripe_prices_migration_megaonda_tripartite'
);
