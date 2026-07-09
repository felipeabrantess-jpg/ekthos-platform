-- F1: Desligar Pessoa — dois novos campos na tabela people
-- left_at:     quando a pessoa saiu da igreja (NULL = ativa)
-- left_reason: motivo textual livre (opcional, preservado ao religar)
ALTER TABLE people ADD COLUMN IF NOT EXISTS left_at     TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS left_reason TEXT        DEFAULT NULL;

-- Índice parcial: indexa só pessoas ativas (left_at IS NULL = maioria)
-- Não reescreve dados existentes — DEFAULT NULL é zero-cost em prod
CREATE INDEX IF NOT EXISTS idx_people_left_at
  ON people(church_id, left_at)
  WHERE left_at IS NULL;
