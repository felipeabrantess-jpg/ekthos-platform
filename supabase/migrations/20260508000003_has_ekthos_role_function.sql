-- supabase/migrations/20260508000003_has_ekthos_role_function.sql
-- Frente 4A: função auxiliar para verificar se o JWT atual contém uma role
-- específica no array app_metadata.ekthos_roles.
-- Roles válidas: 'ekthos_admin', 'ekthos_support', 'ekthos_commercial'

CREATE OR REPLACE FUNCTION public.has_ekthos_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' -> 'ekthos_roles') @> to_jsonb(p_role),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_ekthos_role(text) TO authenticated, service_role;
