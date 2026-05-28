-- supabase/migrations/20260508000007_count_remaining_admins_helper.sql
-- Frente 4A: função helper para admin-set-ekthos-roles.
-- Conta admins ativos excluindo um user específico.
-- Usada para bloquear remoção do último ekthos_admin.

CREATE OR REPLACE FUNCTION public.count_remaining_admins(p_exclude_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM auth.users
  WHERE (raw_app_meta_data->>'is_ekthos_admin' = 'true'
         OR raw_app_meta_data->'ekthos_roles' @> '"ekthos_admin"'::jsonb)
    AND id != p_exclude_id
    AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.count_remaining_admins TO service_role;
