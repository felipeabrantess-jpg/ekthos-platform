-- =============================================================
-- Migration: 20260909000001_frente1_onda1.sql
-- Frente 1 — Onda 1: Tapar o vazamento de unidade na captura QR
-- Produção: IGV 6c127559 — 6.036 pessoas. Sem LOCK em dados.
--
-- O QUE FAZ:
--   R1  qr_codes.unit_id      → FK para church_units
--   R2  people.qr_code_id     → FK para qr_codes (rastreabilidade retroativa)
--   R8p people.needs_review   → flag para "Já sou membro" sem match (Onda 2)
--   R15 idx_people_church_unit_stage (CONCURRENTLY — sem lock)
--   R5  ANALYZE people        → estatísticas para o planner (nunca foram coletadas)
--
-- ROLLBACK (ordem inversa):
--   DROP INDEX CONCURRENTLY IF EXISTS idx_people_church_unit_stage;
--   ALTER TABLE people DROP COLUMN IF EXISTS needs_review;
--   ALTER TABLE people DROP COLUMN IF EXISTS qr_code_id;
--   ALTER TABLE qr_codes DROP COLUMN IF EXISTS unit_id;
-- =============================================================

-- R1: unidade do QR code
ALTER TABLE qr_codes
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES church_units(id) ON DELETE SET NULL;

COMMENT ON COLUMN qr_codes.unit_id IS
  'Sede/unidade a que este QR pertence. NULL = sem unidade configurada. '
  'visitor-capture usa este valor para gravar people.unit_id na captura.';

-- R2: rastreabilidade de origem por QR
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS qr_code_id uuid REFERENCES qr_codes(id) ON DELETE SET NULL;

COMMENT ON COLUMN people.qr_code_id IS
  'ID do QR code usado na captura. Preenchido para source=qr_code '
  'a partir de 2026-09-09 (Onda 1). Registros anteriores permanecem NULL.';

-- R8-prep: flag para membro declarado sem match na base
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN people.needs_review IS
  'TRUE quando pessoa foi criada via QR com opção "Já sou membro" '
  'mas não foi encontrada na base. A igreja deve conferir o cadastro.';

-- R15: índice composto para filtros combinados de Onda 3 (CONCURRENTLY = sem lock de escrita)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_people_church_unit_stage
  ON people (church_id, unit_id, person_stage)
  WHERE deleted_at IS NULL;

-- R5: ANALYZE — planner nunca teve estatísticas desta tabela (n_live_tup=0, last_analyze=null)
ANALYZE people;
