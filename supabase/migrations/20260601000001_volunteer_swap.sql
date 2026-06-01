-- Migration: sistema de troca de escala (D9)
-- Tabela de solicitações de troca entre voluntários

CREATE TABLE IF NOT EXISTS service_schedule_swap_requests (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id                 UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  assignment_id             UUID        NOT NULL REFERENCES service_schedule_assignments(id) ON DELETE CASCADE,
  requester_volunteer_id    UUID        NOT NULL REFERENCES volunteers(id),
  target_volunteer_id       UUID        REFERENCES volunteers(id), -- NULL = qualquer voluntário disponível
  status                    TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  requester_note            TEXT,
  resolved_at               TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_swap_church     ON service_schedule_swap_requests(church_id);
CREATE INDEX IF NOT EXISTS idx_swap_assignment ON service_schedule_swap_requests(assignment_id);
CREATE INDEX IF NOT EXISTS idx_swap_status     ON service_schedule_swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_swap_requester  ON service_schedule_swap_requests(requester_volunteer_id);

-- RLS
ALTER TABLE service_schedule_swap_requests ENABLE ROW LEVEL SECURITY;

-- service_role: acesso total (edge functions / cron)
CREATE POLICY swap_service_all ON service_schedule_swap_requests
  FOR ALL TO service_role USING (true);

-- authenticated: isolamento por church_id via JWT app_metadata
CREATE POLICY swap_tenant_all ON service_schedule_swap_requests
  FOR ALL TO authenticated
  USING (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid)
  WITH CHECK (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid);

COMMENT ON TABLE service_schedule_swap_requests IS
  'Solicitações de troca de escala entre voluntários (D9). status: pending|accepted|declined|cancelled';
COMMENT ON COLUMN service_schedule_swap_requests.target_volunteer_id IS
  'NULL = qualquer voluntário do ministério pode aceitar';
