-- =============================================================
-- FIX: Alinhar limites de plano com docs canônicos (30/04/2026)
-- max_users: 2/4/4 → 5/8/10
-- max_members: coluna nova — 500/1000/10000
-- =============================================================

-- 1. Adicionar coluna max_members
ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS max_members int DEFAULT NULL;

COMMENT ON COLUMN plans.max_members IS
  'Limite de pessoas cadastradas no CRM. NULL = sem limite (Enterprise).';

-- 2. Atualizar max_users e max_members conforme docs canônicos
UPDATE plans SET max_users = 5,  max_members = 500   WHERE slug = 'chamado';
UPDATE plans SET max_users = 8,  max_members = 1000  WHERE slug = 'missao';
UPDATE plans SET max_users = 10, max_members = 10000 WHERE slug = 'avivamento';

-- 3. Smoke test
SELECT slug, name, price_cents, max_users, max_members
FROM plans
WHERE slug IN ('chamado', 'missao', 'avivamento')
ORDER BY price_cents;
