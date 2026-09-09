-- =============================================================
-- Migration: 20260909000002_frente1_onda2.sql
-- Frente 1 — Onda 2: Classificação na entrada
-- Depende: 20260909000001_frente1_onda1.sql (already applied)
--
-- O QUE FAZ:
--   Nenhum schema change novo — Onda 1 já adicionou needs_review.
--   Este arquivo serve como ponto de auditoria e para o índice de
--   dedup por telefone normalizado.
--
-- R8c — AUDITORIA de duplicatas existentes (READ-ONLY — não deduplicar):
-- Rodar manualmente no Supabase Dashboard para ver volume:
--
--   SELECT
--     regexp_replace(phone, '[^0-9]', '', 'g') AS phone_digits,
--     COUNT(*) AS qtd,
--     array_agg(id ORDER BY created_at) AS ids
--   FROM people
--   WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5'
--     AND deleted_at IS NULL
--   GROUP BY regexp_replace(phone, '[^0-9]', '', 'g')
--   HAVING COUNT(*) > 1
--   ORDER BY qtd DESC;
--
-- ROLLBACK: nada a desfazer nesta migration.
-- =============================================================

-- Índice para busca eficiente por variantes de telefone (R8b)
-- Normaliza para dígitos apenas — mesma lógica que visitor-capture usa para variantes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_phone_digits_church
  ON people (church_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_people_phone_digits_church IS
  'Índice para dedup por telefone normalizado (só dígitos). '
  'Permite encontrar duplicatas com/sem 9º dígito BR sem seq scan.';
