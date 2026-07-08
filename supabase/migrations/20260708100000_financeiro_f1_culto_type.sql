-- F1: adiciona campo culto_type em donations para rastrear tipo de culto
-- Nullable: nao afeta lancamentos existentes, saldo calculado nem relatorios atuais.
ALTER TABLE donations
  ADD COLUMN IF NOT EXISTS culto_type TEXT
  CHECK (
    culto_type IS NULL OR
    culto_type = ANY (ARRAY['domingo','quarta','consagracao','seminario','outro'])
  );

COMMENT ON COLUMN donations.culto_type IS
  'Tipo de culto onde a oferta/dizimo foi coletado. Nullable — lancamentos sem culto ficam NULL.';

CREATE INDEX IF NOT EXISTS idx_donations_culto_type
  ON donations (church_id, culto_type, created_at DESC)
  WHERE culto_type IS NOT NULL;
