-- F4-A (Opção A): Evoluir cell_attendance existente
-- Tabela vazia (0 registros) — somente ADD COLUMN + recriar políticas RLS.
-- NÃO toca em cell_meetings / cell_reports / cell_members.
--
-- Usa auth_user_role() SECURITY DEFINER — padrão canônico do sistema
-- para verificação de papel (lê user_roles, bypassa RLS, não usa JWT stale).

ALTER TABLE cell_attendance
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'absent'
    CHECK (status IN ('present', 'absent'));

ALTER TABLE cell_attendance
  ADD COLUMN IF NOT EXISTS church_id UUID
    REFERENCES churches(id) ON DELETE CASCADE;

ALTER TABLE cell_attendance
  ADD COLUMN IF NOT EXISTS marked_by UUID
    REFERENCES auth.users(id);

ALTER TABLE cell_attendance
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_cell_attendance_meeting ON cell_attendance (meeting_id);
CREATE INDEX IF NOT EXISTS idx_cell_attendance_person  ON cell_attendance (person_id);
CREATE INDEX IF NOT EXISTS idx_cell_attendance_church  ON cell_attendance (church_id);

DROP POLICY IF EXISTS cell_attendance_church ON cell_attendance;

CREATE POLICY cell_attendance_select ON cell_attendance
  FOR SELECT TO authenticated
  USING (
    meeting_id IN (SELECT id FROM cell_meetings WHERE church_id = auth_church_id())
  );

CREATE POLICY cell_attendance_insert ON cell_attendance
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_user_role() = ANY(ARRAY[
      'admin'::app_role, 'cell_leader'::app_role,
      'secretary'::app_role, 'pastor_celulas'::app_role
    ])
    AND meeting_id IN (SELECT id FROM cell_meetings WHERE church_id = auth_church_id())
  );

CREATE POLICY cell_attendance_update ON cell_attendance
  FOR UPDATE TO authenticated
  USING (
    meeting_id IN (SELECT id FROM cell_meetings WHERE church_id = auth_church_id())
  )
  WITH CHECK (
    auth_user_role() = ANY(ARRAY[
      'admin'::app_role, 'cell_leader'::app_role,
      'secretary'::app_role, 'pastor_celulas'::app_role
    ])
    AND meeting_id IN (SELECT id FROM cell_meetings WHERE church_id = auth_church_id())
  );

CREATE POLICY cell_attendance_service ON cell_attendance
  FOR ALL USING (auth.role() = 'service_role');
