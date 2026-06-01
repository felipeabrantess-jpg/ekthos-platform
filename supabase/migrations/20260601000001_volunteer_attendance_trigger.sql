-- Migration: trigger last_attendance_at para escalas
-- Sincroniza people.last_attendance_at quando voluntário confirma presença em escala

-- Função do trigger: atualiza people.last_attendance_at quando voluntário confirma presença
CREATE OR REPLACE FUNCTION sync_last_attendance_from_escala()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_person_id UUID;
BEGIN
  -- Só age quando attendance_confirmed muda de null/false para true
  IF (NEW.attendance_confirmed = true) AND
     (OLD.attendance_confirmed IS DISTINCT FROM true) THEN

    -- Buscar o person_id via volunteer
    SELECT v.person_id INTO v_person_id
    FROM volunteers v
    WHERE v.id = NEW.volunteer_id;

    IF v_person_id IS NOT NULL THEN
      -- Atualizar last_attendance_at (só se a data nova for mais recente)
      UPDATE people
      SET last_attendance_at = NOW()
      WHERE id = v_person_id
        AND (last_attendance_at IS NULL OR last_attendance_at < NOW());
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger AFTER UPDATE em service_schedule_assignments
DROP TRIGGER IF EXISTS trg_sync_attendance_escala ON service_schedule_assignments;
CREATE TRIGGER trg_sync_attendance_escala
  AFTER UPDATE OF attendance_confirmed ON service_schedule_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_last_attendance_from_escala();

COMMENT ON FUNCTION sync_last_attendance_from_escala() IS
  'Sincroniza people.last_attendance_at quando voluntário confirma presença em escala';

-- RPC: histórico de serviço de um voluntário
CREATE OR REPLACE FUNCTION get_volunteer_service_history(
  p_volunteer_id UUID,
  p_limit        INTEGER DEFAULT 20
)
RETURNS TABLE (
  schedule_id          UUID,
  event_name           TEXT,
  event_date           DATE,
  role                 TEXT,
  status               TEXT,
  attendance_confirmed BOOLEAN,
  confirmed_at         TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ss.id AS schedule_id,
    ss.event_name,
    ss.event_date,
    ssa.role,
    ssa.status,
    ssa.attendance_confirmed,
    ssa.confirmed_at
  FROM service_schedule_assignments ssa
  JOIN service_schedules ss ON ss.id = ssa.schedule_id
  WHERE ssa.volunteer_id = p_volunteer_id
  ORDER BY ss.event_date DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION get_volunteer_service_history(UUID, INTEGER) TO authenticated, service_role;
