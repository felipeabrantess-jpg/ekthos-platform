-- Migration: 00027_reengagement_fields
-- Adds reengagement tracking columns to people table

ALTER TABLE people ADD COLUMN IF NOT EXISTS last_attendance_at timestamptz;
ALTER TABLE people ADD COLUMN IF NOT EXISTS reengagement_status text
  CHECK (reengagement_status IN ('active','away_7d','away_14d','away_21d','away_30d','returned','sensitive'));
ALTER TABLE people ADD COLUMN IF NOT EXISTS reengagement_last_sent_at timestamptz;

COMMENT ON COLUMN people.last_attendance_at        IS 'Data da última presença registrada (células/escalas)';
COMMENT ON COLUMN people.reengagement_status       IS 'Estado atual do processo de reengajamento';
COMMENT ON COLUMN people.reengagement_last_sent_at IS 'Data/hora em que a última mensagem de reengajamento foi gerada (cadência 7d)';
