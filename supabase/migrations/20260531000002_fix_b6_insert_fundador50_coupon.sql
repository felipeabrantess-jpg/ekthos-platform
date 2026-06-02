-- Migration: fix_b6_insert_fundador50_coupon
-- Date: 2026-05-31 — Fix Sprint Onda 1
-- Bug B6: FUNDADOR50 não existe na tabela coupons
-- Fix: INSERT idempotente com dados corretos do Stripe LIVE
-- Idempotente: ON CONFLICT (code) DO UPDATE
--
-- Schema descoberto via investigação (FS-5):
--   coupon_type  CHECK: 'affiliate'|'promo'|'partner'
--   discount_type CHECK: 'percent_off'|'amount_off'  (NÃO 'percent' — armadilha B6)
--
-- Stripe Promotion Code: promo_1TdCMQHfvCy1ruENHpgkoajW (PromotionCode ID)
-- stripe_coupon_id: NULL — Felipe deve confirmar o ID do Coupon subjacente no Stripe
--   Dashboard → Coupons → FUNDADOR50 → copiar o coupon_id (não o promo_id)
--   Depois: UPDATE coupons SET stripe_coupon_id = '<id>' WHERE code = 'FUNDADOR50';

INSERT INTO public.coupons (
  id,
  code,
  coupon_type,
  discount_type,
  discount_value,
  duration,
  max_redemptions,
  stripe_promotion_code_id,
  valid_until,
  active,
  plan_scope,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'FUNDADOR50',
  'promo',
  'percent_off',
  50,
  'forever',
  50,
  'promo_1TdCMQHfvCy1ruENHpgkoajW',
  '2026-07-31 23:59:59+00',
  true,
  ARRAY['*'],
  now(),
  now()
) ON CONFLICT (code) DO UPDATE SET
  active                   = EXCLUDED.active,
  max_redemptions          = EXCLUDED.max_redemptions,
  valid_until              = EXCLUDED.valid_until,
  stripe_promotion_code_id = EXCLUDED.stripe_promotion_code_id,
  updated_at               = now();

-- Audit log
INSERT INTO audit_logs (id, church_id, entity_type, entity_id, action, actor_type, actor_id, payload, created_at)
SELECT
  gen_random_uuid(), NULL, 'coupon',
  (SELECT id FROM coupons WHERE code = 'FUNDADOR50'),
  'coupon_inserted_b6_fix',
  'system',
  '579d0f7b-9b8b-4c20-94c5-513b4a424642',
  jsonb_build_object(
    'code', 'FUNDADOR50',
    'coupon_type', 'promo',
    'discount_type', 'percent_off',
    'discount_value', 50,
    'duration', 'forever',
    'max_redemptions', 50,
    'stripe_promotion_code_id', 'promo_1TdCMQHfvCy1ruENHpgkoajW',
    'valid_until', '2026-07-31T23:59:59+00:00',
    'note', 'B6 Fix Sprint insert — stripe_coupon_id pendente confirmação Felipe'
  ),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM audit_logs WHERE action = 'coupon_inserted_b6_fix'
);
