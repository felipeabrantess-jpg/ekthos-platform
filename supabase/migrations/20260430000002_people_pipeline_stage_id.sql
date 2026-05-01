-- =============================================================
-- ADICIONAR pipeline_stage_id EM people
-- Pré-requisito pra agentes premium operarem sobre pipeline customizado
-- Mantém person_stage (enum) durante transição — dual-write
-- Backfill por slug matching: person_stage::text = pipeline_stages.slug
-- =============================================================

-- 1. Adicionar coluna nova
ALTER TABLE people
ADD COLUMN IF NOT EXISTS pipeline_stage_id uuid REFERENCES pipeline_stages(id);

CREATE INDEX IF NOT EXISTS idx_people_pipeline_stage
ON people(pipeline_stage_id) WHERE pipeline_stage_id IS NOT NULL;

-- 2. Backfill: mapear person_stage (enum text) → pipeline_stage_id (uuid)
-- Estratégia: slug do stage = valor do enum (visitante→visitante, frequentador→frequentador, discipulo→discipulo)
-- contato, consolidado, lider ficam NULL (sem stage correspondente no pipeline atual)
UPDATE people p
SET pipeline_stage_id = ps.id
FROM pipeline_stages ps
WHERE p.church_id = ps.church_id
  AND p.person_stage::text = ps.slug
  AND p.pipeline_stage_id IS NULL;

-- 3. Validação obrigatória pós-backfill
DO $$
DECLARE
  v_total int;
  v_mapped int;
  v_unmapped int;
  v_unmapped_pct float;
BEGIN
  SELECT COUNT(*) INTO v_total FROM people;
  SELECT COUNT(*) INTO v_mapped FROM people WHERE pipeline_stage_id IS NOT NULL;
  v_unmapped := v_total - v_mapped;

  RAISE NOTICE 'Total people: %', v_total;
  RAISE NOTICE 'Com pipeline_stage_id: %', v_mapped;
  RAISE NOTICE 'Sem pipeline_stage_id: %', v_unmapped;

  -- Se banco vazio, ok
  IF v_total = 0 THEN
    RAISE NOTICE 'Banco vazio — backfill OK (nothing to map)';
    RETURN;
  END IF;

  v_unmapped_pct := v_unmapped::float / v_total;

  -- Aceita até 30% sem mapeamento (contato/consolidado/lider não têm stage)
  IF v_unmapped_pct > 0.30 THEN
    RAISE EXCEPTION 'Backfill falhou: % de % pessoas sem mapeamento (%%)', v_unmapped, v_total;
  END IF;

  RAISE NOTICE 'Backfill OK — %% mapeado: %', ROUND((v_mapped::float / v_total * 100)::numeric, 1);
END $$;

-- NÃO dropar person_stage agora.
-- Refatorar em sprint posterior quando todo código já usar pipeline_stage_id.
