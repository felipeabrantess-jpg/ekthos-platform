-- supabase/migrations/20260508000004_is_ekthos_admin_compat.sql
-- Frente 4A: adapta is_ekthos_admin() para aceitar ekthos_roles=['ekthos_admin']
-- OU o boolean legado is_ekthos_admin=true.
-- Preserva compatibilidade com todas as EFs existentes que dependem desta função.
-- Remoção do boolean legado = OPS-DEBT-025 (após Frente 4B validada).

CREATE OR REPLACE FUNCTION public.is_ekthos_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    -- Novo: array ekthos_roles contém 'ekthos_admin'
    (auth.jwt() -> 'app_metadata' -> 'ekthos_roles') @> '"ekthos_admin"'::jsonb
    OR
    -- Legado: boolean is_ekthos_admin = true (OPS-DEBT-025)
    (auth.jwt() -> 'app_metadata' ->> 'is_ekthos_admin')::boolean,
    false
  )
$$;
