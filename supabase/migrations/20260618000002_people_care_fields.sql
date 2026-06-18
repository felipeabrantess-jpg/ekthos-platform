-- Migration: campos de cuidado em people
-- care_status: estado do acompanhamento (pendente/contatado/visitado/cuidando/sem_sucesso)
-- care_observation: observação livre do responsável
-- care_next_step: próximo passo planejado
-- care_updated_at: última atualização via link privado

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS care_status      text
    CHECK (care_status IN ('pendente','contatado','visitado','cuidando','sem_sucesso')),
  ADD COLUMN IF NOT EXISTS care_observation text,
  ADD COLUMN IF NOT EXISTS care_next_step   text,
  ADD COLUMN IF NOT EXISTS care_updated_at  timestamptz;

-- Índice para painel de cobrança (por responsável + status)
CREATE INDEX IF NOT EXISTS idx_people_responsible_id
  ON public.people(responsible_id)
  WHERE responsible_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_care_status
  ON public.people(church_id, care_status)
  WHERE responsible_id IS NOT NULL;
