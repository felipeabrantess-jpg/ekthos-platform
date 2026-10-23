-- ============================================================
-- DRY-RUN DO BACKFILL — 100% READ-ONLY
-- Executar no Supabase SQL Editor ANTES de aplicar a migration.
-- Nunca INSERT, UPDATE, DELETE — apenas SELECT.
--
-- Igreja IGV: church_id = '6c127559-874a-4748-8fce-55d4079613a5'
-- ============================================================

-- ── Q1: total de pessoas ativas ──────────────────────────────
SELECT COUNT(*) AS total_pessoas_ativas
FROM people
WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND deleted_at IS NULL;
-- Expected: ~5.968

-- ── Q2: com person_pipeline ─────────────────────────────────
SELECT COUNT(*) AS com_pipeline
FROM people p
INNER JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND p.deleted_at IS NULL;

-- ── Q3: sem person_pipeline mas com pipeline_stage_id ───────
SELECT COUNT(*) AS stage_em_people_only
FROM people p
LEFT JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND p.deleted_at IS NULL
  AND pp.id IS NULL
  AND p.pipeline_stage_id IS NOT NULL;

-- ── Q4: sem nenhum estado de pipeline ───────────────────────
SELECT COUNT(*) AS sem_estado_pipeline
FROM people p
LEFT JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND p.deleted_at IS NULL
  AND pp.id IS NULL
  AND p.pipeline_stage_id IS NULL;

-- ── Q5: com acolhimento_journey ─────────────────────────────
SELECT COUNT(*) AS com_acolhimento
FROM people p
INNER JOIN acolhimento_journey aj ON aj.person_id = p.id AND aj.church_id = p.church_id
WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND p.deleted_at IS NULL;

-- ── Q6: conflitos (people.pipeline_stage_id ≠ person_pipeline.stage_id) ──
SELECT COUNT(*) AS conflitos_de_stage
FROM people p
INNER JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND p.deleted_at IS NULL
  AND p.pipeline_stage_id IS NOT NULL
  AND p.pipeline_stage_id != pp.stage_id;
-- Expected: 4 (confirmado na auditoria de 29/07)

-- ── Q7: duplicatas em person_pipeline ───────────────────────
SELECT COUNT(*) AS pessoas_com_duplicata_pipeline
FROM (
  SELECT person_id, COUNT(*) AS cnt
  FROM person_pipeline
  WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  GROUP BY person_id
  HAVING COUNT(*) > 1
) x;
-- Expected: 0 (UNIQUE constraint em person_pipeline)

-- ── Q8: distribuição por fonte de backfill ──────────────────
SELECT
  CASE
    WHEN pp.id IS NOT NULL              THEN 'person_pipeline'
    WHEN p.pipeline_stage_id IS NOT NULL THEN 'people.pipeline_stage_id'
    ELSE                                     'sem_stage'
  END AS fonte_backfill,
  COUNT(*) AS pessoas
FROM people p
LEFT JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND p.deleted_at IS NULL
GROUP BY fonte_backfill;

-- ── Q9: detalhe de duplicatas (diagnóstico) ──────────────────
SELECT person_id, COUNT(*) AS cnt
FROM person_pipeline
WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5'
GROUP BY person_id
HAVING COUNT(*) > 1
LIMIT 10;

-- ── REGRA DE DESEMPATE (confirmada com dados reais, 2026-07-29) ──
-- 1. SE person_pipeline existe → stage_id de person_pipeline (fonte mais fresca)
-- 2. SE não tem person_pipeline, mas people.pipeline_stage_id IS NOT NULL → usar esse
-- 3. SE acolhimento_journey ativa (status NOT IN completed/cancelled) e sem os dois acima
--    → stage_id = entry point da igreja (e7d0d735-... para IGV)
--    RESULTADO IGV: 0 pessoas se enquadram (Q-B=0), regra 3 não cria jornadas na IGV
-- 4. NÃO CRIA jornada — pessoa sem estado de nenhum tipo fica fora do backfill
--    RESULTADO IGV: 5.487 pessoas ficam fora
--
-- Notas de dados (IGV, 2026-07-29):
-- • pipelines table: 0 linhas para church_id IGV (stages legacy têm pipeline_id=NULL)
-- • person_journey.pipeline_id será NULL para todas jornadas da IGV no backfill
-- • Total jornadas projetadas: 481 (469 regra-1 + 12 regra-2) — abaixo do limite 600 ✅
-- Conflitos (Q6): usar person_pipeline.stage_id (mais confiável que espelho denormalizado)

-- ── Q10: pipeline_stages disponíveis na IGV ─────────────────
SELECT id, name, slug, order_index, is_entry_point, is_terminal
FROM pipeline_stages
WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5'
  AND is_active = true
ORDER BY order_index;

-- ── Q11: confirmar que person_journey e journey_events NÃO existem ainda ──
SELECT table_name, 'JÁ EXISTE ⚠️' AS status
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('person_journey', 'journey_events');
-- Expected: 0 linhas
