-- Fix: revoga acesso REST direto à função de trigger update_church_courses_updated_at
-- Advisor: anon/authenticated não devem chamar funções de trigger via /rpc/
-- (increment_course_enrolled já foi revogado na migration 20260617000002)
REVOKE EXECUTE ON FUNCTION public.update_church_courses_updated_at() FROM anon, authenticated;
