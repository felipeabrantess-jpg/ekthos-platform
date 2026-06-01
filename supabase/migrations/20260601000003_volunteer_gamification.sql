-- Migration: gamificação de voluntários (D8)

-- Tabela de pontos
CREATE TABLE IF NOT EXISTS volunteer_points (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  church_id    UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  points       INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  reason       TEXT NOT NULL,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata     JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_vpoints_volunteer ON volunteer_points(volunteer_id);
CREATE INDEX IF NOT EXISTS idx_vpoints_church ON volunteer_points(church_id);
CREATE INDEX IF NOT EXISTS idx_vpoints_awarded ON volunteer_points(awarded_at DESC);

ALTER TABLE volunteer_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY vpoints_service_all ON volunteer_points
  FOR ALL TO service_role USING (true);

CREATE POLICY vpoints_tenant_all ON volunteer_points
  FOR ALL TO authenticated
  USING (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid)
  WITH CHECK (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid);

COMMENT ON TABLE volunteer_points IS 'Pontos de gamificação por serviço prestado — Volunteer Pro';

-- Função trigger: quando attendance_confirmed = true, award points
CREATE OR REPLACE FUNCTION award_volunteer_service_points()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_church_id UUID;
  v_event_name TEXT;
BEGIN
  IF (NEW.attendance_confirmed = true) AND
     (OLD.attendance_confirmed IS DISTINCT FROM true) THEN

    v_church_id := NEW.church_id;

    SELECT ss.event_name INTO v_event_name
    FROM service_schedules ss
    WHERE ss.id = NEW.schedule_id;

    INSERT INTO volunteer_points (volunteer_id, church_id, points, reason, metadata)
    VALUES (
      NEW.volunteer_id,
      v_church_id,
      10,
      'Presença confirmada: ' || COALESCE(v_event_name, 'Escala'),
      jsonb_build_object('assignment_id', NEW.id, 'schedule_id', NEW.schedule_id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_service_points ON service_schedule_assignments;
CREATE TRIGGER trg_award_service_points
  AFTER UPDATE OF attendance_confirmed ON service_schedule_assignments
  FOR EACH ROW
  EXECUTE FUNCTION award_volunteer_service_points();

-- View: pontuação total por voluntário
CREATE OR REPLACE VIEW volunteer_total_points AS
SELECT
  v.id AS volunteer_id,
  v.church_id,
  p.name AS person_name,
  COALESCE(SUM(vp.points), 0) AS total_points,
  COUNT(vp.id) AS total_awards,
  MAX(vp.awarded_at) AS last_award_at
FROM volunteers v
JOIN people p ON p.id = v.person_id
LEFT JOIN volunteer_points vp ON vp.volunteer_id = v.id
GROUP BY v.id, v.church_id, p.name;

GRANT SELECT ON volunteer_total_points TO authenticated, service_role;
