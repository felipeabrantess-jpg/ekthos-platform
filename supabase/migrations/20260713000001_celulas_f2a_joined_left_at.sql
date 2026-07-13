-- F2-A: add joined_at and left_at to cell_members for cell history
-- Idempotent: IF NOT EXISTS throughout

ALTER TABLE cell_members
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS left_at   TIMESTAMPTZ DEFAULT NULL;

-- Backfill: joined_at = created_at for existing rows
UPDATE cell_members
SET joined_at = created_at
WHERE joined_at IS NULL;

-- Apply NOT NULL + DEFAULT now() after backfill
ALTER TABLE cell_members
  ALTER COLUMN joined_at SET DEFAULT now(),
  ALTER COLUMN joined_at SET NOT NULL;

-- History index per person
CREATE INDEX IF NOT EXISTS idx_cell_members_person_history
  ON cell_members (person_id, joined_at DESC);

-- Active-members index per group
CREATE INDEX IF NOT EXISTS idx_cell_members_group_active
  ON cell_members (group_id)
  WHERE left_at IS NULL;
