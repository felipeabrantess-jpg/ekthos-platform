-- ============================================================
-- Feature Flag — journey_unification por igreja
-- Desligada por padrão (false) para todas as igrejas.
-- Ativar manualmente por church_id após validação.
--
-- NUNCA ativar em produção antes do CP1.
-- ============================================================

CREATE TABLE IF NOT EXISTS church_feature_flags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  flag_key   TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_cff_church ON church_feature_flags (church_id);

DROP TRIGGER IF EXISTS set_updated_at_church_feature_flags ON church_feature_flags;
CREATE TRIGGER set_updated_at_church_feature_flags
  BEFORE UPDATE ON church_feature_flags
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

ALTER TABLE church_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cff_select  ON church_feature_flags;
DROP POLICY IF EXISTS cff_service ON church_feature_flags;

CREATE POLICY cff_select ON church_feature_flags
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id());

CREATE POLICY cff_service ON church_feature_flags
  FOR ALL USING (auth.role() = 'service_role');

-- Flag desligada para todas as igrejas existentes (inclusive IGV)
-- Ativar via: UPDATE church_feature_flags SET enabled = true WHERE church_id = '<id>' AND flag_key = 'journey_unification';
INSERT INTO church_feature_flags (church_id, flag_key, enabled)
SELECT id, 'journey_unification', false
FROM churches
WHERE deleted_at IS NULL
ON CONFLICT (church_id, flag_key) DO NOTHING;
