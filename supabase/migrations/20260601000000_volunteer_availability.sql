-- Migration: volunteer availability system
-- Adiciona campos de disponibilidade granular e cria tabela de bloqueio de datas

-- Campo: intervalo mínimo entre escalas (dias)
ALTER TABLE volunteers
ADD COLUMN IF NOT EXISTS min_days_between_services INTEGER NOT NULL DEFAULT 7;

-- Tabela: bloqueio de datas por voluntário
CREATE TABLE IF NOT EXISTS service_schedule_availability (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  volunteer_id    UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  blocked_date    DATE NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_ssa_church ON service_schedule_availability(church_id);
CREATE INDEX IF NOT EXISTS idx_ssa_volunteer ON service_schedule_availability(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_ssa_date ON service_schedule_availability(blocked_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssa_volunteer_date ON service_schedule_availability(volunteer_id, blocked_date);

-- RLS
ALTER TABLE service_schedule_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY ssa_service_all ON service_schedule_availability
  FOR ALL TO service_role USING (true);

CREATE POLICY ssa_tenant_all ON service_schedule_availability
  FOR ALL TO authenticated
  USING (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid)
  WITH CHECK (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid);

COMMENT ON TABLE service_schedule_availability IS 'Datas bloqueadas por voluntário — não disponível para escala';
COMMENT ON COLUMN volunteers.min_days_between_services IS 'Intervalo mínimo em dias entre escalas para este voluntário';
