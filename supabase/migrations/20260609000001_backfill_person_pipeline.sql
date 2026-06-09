-- Migration: Backfill person_pipeline for people without a pipeline record
-- Assigns each person (who has no person_pipeline row) to the first active stage
-- of their church (order_index = 0), using first_visit_date/created_at as entered_at.
--
-- Safe to run multiple times (NOT EXISTS guard).

INSERT INTO person_pipeline (person_id, church_id, stage_id, entered_at, last_activity_at)
SELECT
  p.id                                                                    AS person_id,
  p.church_id,
  ps.id                                                                   AS stage_id,
  COALESCE(p.first_visit_date::timestamptz, p.created_at, NOW())         AS entered_at,
  COALESCE(
    p.last_attendance_at::timestamptz,
    p.last_contact_at::timestamptz,
    p.created_at,
    NOW()
  )                                                                       AS last_activity_at
FROM people p
CROSS JOIN LATERAL (
  SELECT id
  FROM pipeline_stages ps2
  WHERE ps2.church_id = p.church_id
    AND ps2.is_active  = true
  ORDER BY ps2.order_index ASC
  LIMIT 1
) ps
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM person_pipeline pp
    WHERE pp.person_id  = p.id
      AND pp.church_id  = p.church_id
  );
