-- Migration: policy RLS que permite admin da church ler profiles da mesma church
--
-- Causa do bug "Usuário genérico" em /configuracoes/usuarios:
--   A policy profiles_select_own_tenant usa get_current_church_id() que lê da
--   tabela profiles (self-referencial, frágil). Se o admin não tem profile
--   com church_id correto (ex: profile criado para church de teste pelo seed
--   CROSS JOIN de 00008), a função retorna null → admin vê apenas o próprio
--   profile (profiles_select_own_user) → todos os outros aparecem como 'Usuário'.
--
-- Solução: policy JWT-direta (mesma abordagem de user_roles_church_admin_select).
--   Lê role e church_id do app_metadata do JWT — sem dependência da tabela profiles.
--   Isolamento: admin só vê profiles da PRÓPRIA church_id (extraída do JWT).
--   Sem recursão. Multi-tenant correto.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_church_admin_select'
  ) THEN
    CREATE POLICY profiles_church_admin_select
      ON profiles
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'
        AND church_id = ((auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid)
      );
  END IF;
END $$;
