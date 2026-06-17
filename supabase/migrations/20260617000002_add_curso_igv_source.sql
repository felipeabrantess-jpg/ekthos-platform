-- Migration: adiciona 'curso_igv' ao check constraint de people.source
-- e corrige security advisors nas funções dos cursos

-- 1. Expandir check constraint de people.source para incluir 'curso_igv'
ALTER TABLE people
  DROP CONSTRAINT people_source_check;

ALTER TABLE people
  ADD CONSTRAINT people_source_check CHECK (
    source = ANY (ARRAY[
      'whatsapp', 'instagram', 'manual', 'import', 'onboarding',
      'qr_code', 'lead_form', 'visitor_form', 'agent_capture',
      'import_xlsx', 'migration', 'curso_igv'
    ])
  );

-- 2. search_path fixo em increment_course_enrolled (security advisor)
CREATE OR REPLACE FUNCTION public.increment_course_enrolled(p_course_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE church_courses
  SET enrolled_count = enrolled_count + 1
  WHERE id = p_course_id;
$$;

-- 3. Revogar acesso público à RPC (anon não deve poder inflar enrolled_count)
REVOKE EXECUTE ON FUNCTION public.increment_course_enrolled(uuid) FROM anon, authenticated;

-- 4. search_path fixo em update_church_courses_updated_at (security advisor)
CREATE OR REPLACE FUNCTION public.update_church_courses_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
