-- ============================================================
-- Migration: church_courses + course_enrollments
-- Feature: PWA IGV Cursos com inscrição
-- LGPD R8: course_enrollments NUNCA exposta a anon
-- Multi-tenant: church_id em todas as queries
-- ============================================================

CREATE TABLE IF NOT EXISTS church_courses (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id      uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  title          text        NOT NULL,
  description    text,
  instructor     text,
  schedule_text  text,
  location       text,
  start_date     date,
  end_date       date,
  image_url      text,
  price          numeric(10,2),
  prerequisites  text,
  max_capacity   integer,
  enrolled_count integer     NOT NULL DEFAULT 0,
  is_public      boolean     NOT NULL DEFAULT true,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS course_enrollments (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  course_id   uuid        NOT NULL REFERENCES church_courses(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  phone       text        NOT NULL,
  email       text,
  person_id   uuid        REFERENCES people(id) ON DELETE SET NULL,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_church_courses_church_id  ON church_courses(church_id);
CREATE INDEX IF NOT EXISTS idx_church_courses_active     ON church_courses(church_id, active, is_public);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_church ON course_enrollments(church_id);

CREATE OR REPLACE FUNCTION update_church_courses_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_church_courses_updated_at ON church_courses;
CREATE TRIGGER trg_church_courses_updated_at
  BEFORE UPDATE ON church_courses
  FOR EACH ROW EXECUTE FUNCTION update_church_courses_updated_at();

ALTER TABLE church_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "church_courses_service_all"
  ON church_courses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "church_courses_tenant_all"
  ON church_courses FOR ALL TO authenticated
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_enrollments_service_all"
  ON course_enrollments FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "course_enrollments_tenant_select"
  ON course_enrollments FOR SELECT TO authenticated
  USING (church_id = auth_church_id());
