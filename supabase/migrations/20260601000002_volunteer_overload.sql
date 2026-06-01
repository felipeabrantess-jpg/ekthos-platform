-- Migration: volunteer anti-sobrecarga
-- Adiciona campo de carga máxima e RPC de contagem

-- Campo no volunteers
ALTER TABLE volunteers
ADD COLUMN IF NOT EXISTS max_services_per_month INTEGER NOT NULL DEFAULT 4;

COMMENT ON COLUMN volunteers.max_services_per_month IS 'Número máximo de escalas por mês. Default: 4.';

-- RPC: contar escalas de um voluntário no mês
CREATE OR REPLACE FUNCTION get_volunteer_month_count(
  p_volunteer_id UUID,
  p_month_start  TIMESTAMPTZ DEFAULT date_trunc('month', NOW())
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM service_schedule_assignments ssa
  JOIN service_schedules ss ON ss.id = ssa.schedule_id
  WHERE ssa.volunteer_id = p_volunteer_id
    AND ss.event_date >= p_month_start::DATE
    AND ss.event_date < (p_month_start + INTERVAL '1 month')::DATE
    AND ssa.status NOT IN ('declined', 'substituido');

  RETURN COALESCE(v_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION get_volunteer_month_count(UUID, TIMESTAMPTZ) TO authenticated, service_role;
