-- Migration: church admins podem ver todos os usuários da mesma igreja
--
-- Contexto: a policy existente (user_roles_own_select) só deixa o usuário
-- ver o próprio registro. Church admins precisam ver toda a equipe para
-- gerenciar papéis e convidar usuários em /configuracoes/usuarios.
--
-- Abordagem: ler church_id e role do JWT (app_metadata) sem recursão.
-- Isso evita self-join em user_roles que causa "infinite recursion in policy".

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'user_roles'
      AND policyname = 'user_roles_church_admin_select'
  ) THEN
    CREATE POLICY user_roles_church_admin_select
      ON user_roles
      FOR SELECT
      TO authenticated
      USING (
        (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'
        AND church_id = ((auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid)
      );
  END IF;
END $$;
