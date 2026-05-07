-- ============================================================
-- Frente 3A — Migration 8 (numerada como 100008)
-- Revoga EXECUTE para anon nas 3 RPCs SECURITY DEFINER
-- Necessário: get_advisors detectou anon_security_definer_function_executable
-- Todas as 3 funções exigem auth.uid() válido via guard interno
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.get_church_onboarding_state(uuid)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.upsert_church_cadastro_cristalino(uuid, jsonb, jsonb)
  FROM anon;

REVOKE EXECUTE ON FUNCTION public.upsert_church_onboarding_pastoral(uuid, jsonb)
  FROM anon;
