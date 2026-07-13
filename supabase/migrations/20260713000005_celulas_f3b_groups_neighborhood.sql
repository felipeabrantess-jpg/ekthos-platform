-- F3-B: Adiciona neighborhood_id em groups (FK nullable para cell_neighborhoods)
-- Puramente aditivo — não toca em dados existentes, unit_id permanece intocado,
-- Financeiro 100% isolado (donations/expenses/receivables não são afetados).

ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS neighborhood_id UUID
    REFERENCES cell_neighborhoods(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_groups_neighborhood ON groups (neighborhood_id);
