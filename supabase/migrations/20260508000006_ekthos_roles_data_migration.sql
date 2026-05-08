-- supabase/migrations/20260508000006_ekthos_roles_data_migration.sql
-- Frente 4A: popula ekthos_roles array para todos os users com is_ekthos_admin=true.
-- D3 (BLINDAGEM): 2 users esperados (felipe@ekthosai.net + playwright@ekthosai.net).
-- Vanessa recebe ekthos_support futuramente via admin-set-ekthos-roles.
-- Idempotente: WHERE NOT EXISTS no array — não sobrescreve array já existente.

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{ekthos_roles}',
  '["ekthos_admin"]'::jsonb,
  true  -- create_missing = true
)
WHERE raw_app_meta_data->>'is_ekthos_admin' = 'true'
  AND NOT (raw_app_meta_data ? 'ekthos_roles');
-- WHERE NOT EXISTS garante idempotência — não sobrescreve array já existente

-- Rollback (se necessário):
-- UPDATE auth.users
-- SET raw_app_meta_data = raw_app_meta_data - 'ekthos_roles'
-- WHERE raw_app_meta_data ? 'ekthos_roles';
