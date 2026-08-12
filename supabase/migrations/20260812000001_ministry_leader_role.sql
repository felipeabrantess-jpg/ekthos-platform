-- Migration: 20260812000001_ministry_leader_role
-- Papel ministry_leader: função de escopo + RLS corrigida em ministry_members
--
-- Contexto:
--   ministries.leader_id → people.id (NÃO auth.uid())
--   auth.uid() ≠ people.id — ponte obrigatória via email:
--     auth.uid() → profiles.user_id → profiles.email → people.email → people.id = leader_id
--
-- Nota: a ponte por email é frágil se o email divergir entre profiles e people.
-- Não existe campo de vínculo direto (people.auth_user_id) nesta versão.
-- E5 garante: nenhum role ministry_leader atribuído a usuário real.
-- O papel fica estruturalmente pronto; atribuição é decisão do Felipe.

-- ── 1. Enum: adicionar ministry_leader ──────────────────────────────────────
-- Supabase enums são alteráveis com ADD VALUE (não requer DROP/CREATE)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'ministry_leader'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'ministry_leader';
  END IF;
END $$;

-- ── 2. is_ministry_leader_of(p_ministry_id) → boolean ──────────────────────
-- Ponte: auth.uid() → profiles.user_id → profiles.email
--        → people.email → people.id = ministries.leader_id
-- SECURITY DEFINER: bypassa RLS de profiles e people.
-- STABLE: cacheada por transação (seguro para uso em policies).
CREATE OR REPLACE FUNCTION public.is_ministry_leader_of(p_ministry_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   ministries m
    JOIN   people     p  ON  p.id         = m.leader_id
                         AND p.church_id  = m.church_id
    JOIN   profiles   pr ON  LOWER(pr.email) = LOWER(p.email)
    WHERE  m.id         = p_ministry_id
      AND  pr.user_id   = auth.uid()
      AND  m.church_id  = auth_church_id()
      AND  m.is_active  IS NOT FALSE   -- excluir ministérios desativados
  )
$$;

REVOKE ALL  ON FUNCTION public.is_ministry_leader_of(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ministry_leader_of(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.is_ministry_leader_of(uuid) TO authenticated;

-- ── 3. RLS em ministries: ministry_leader lê (não escreve) ──────────────────
-- Policies existentes: ministries_service_all + ministries_tenant_all
-- A tenant_all já cobre SELECT para qualquer authenticated da mesma igreja.
-- Nenhuma policy nova necessária para SELECT — ministry_leader herda.
-- Documentado para clareza: o líder NÃO tem INSERT/UPDATE/DELETE em ministries.

-- ── 4. RLS em ministry_members: substituir policy genérica ──────────────────
-- Estado atual: 1 policy ALL (church_id = auth_church_id()) — buraco de segurança.
-- Tabela vazia (0 linhas) — momento ideal para corrigir.

-- DROP de todas (idempotência)
DROP POLICY IF EXISTS "ministry_members_church" ON public.ministry_members;
DROP POLICY IF EXISTS "mm_select_tenant"   ON public.ministry_members;
DROP POLICY IF EXISTS "mm_insert_leaders"  ON public.ministry_members;
DROP POLICY IF EXISTS "mm_update_leaders"  ON public.ministry_members;
DROP POLICY IF EXISTS "mm_delete_admins"   ON public.ministry_members;

-- SELECT: qualquer autenticado da mesma igreja
CREATE POLICY "mm_select_tenant" ON public.ministry_members
  AS PERMISSIVE FOR SELECT
  TO authenticated
  USING (church_id = auth_church_id());

-- INSERT: admin, admin_departments, ou líder do ministério sendo inserido
CREATE POLICY "mm_insert_leaders" ON public.ministry_members
  AS PERMISSIVE FOR INSERT
  TO authenticated
  WITH CHECK (
    church_id = auth_church_id()
    AND (
      (SELECT role FROM user_roles
       WHERE user_id   = auth.uid()
         AND church_id = auth_church_id()
       LIMIT 1) IN ('admin', 'admin_departments')
      OR is_ministry_leader_of(ministry_id)
    )
  );

-- UPDATE: mesma regra do INSERT
CREATE POLICY "mm_update_leaders" ON public.ministry_members
  AS PERMISSIVE FOR UPDATE
  TO authenticated
  USING (
    church_id = auth_church_id()
    AND (
      (SELECT role FROM user_roles
       WHERE user_id   = auth.uid()
         AND church_id = auth_church_id()
       LIMIT 1) IN ('admin', 'admin_departments')
      OR is_ministry_leader_of(ministry_id)
    )
  )
  WITH CHECK (
    church_id = auth_church_id()
    AND (
      (SELECT role FROM user_roles
       WHERE user_id   = auth.uid()
         AND church_id = auth_church_id()
       LIMIT 1) IN ('admin', 'admin_departments')
      OR is_ministry_leader_of(ministry_id)
    )
  );

-- DELETE: apenas admin e admin_departments (líderes não deletam membros diretamente)
CREATE POLICY "mm_delete_admins" ON public.ministry_members
  AS PERMISSIVE FOR DELETE
  TO authenticated
  USING (
    church_id = auth_church_id()
    AND (
      (SELECT role FROM user_roles
       WHERE user_id   = auth.uid()
         AND church_id = auth_church_id()
       LIMIT 1) IN ('admin', 'admin_departments')
    )
  );

-- ── E5: ZERO atribuições ─────────────────────────────────────────────────────
-- Nenhum GRANT de ministry_leader a usuário real nesta migration.
-- O papel existe estruturalmente; atribuição é decisão do Felipe.
-- Verificar: SELECT COUNT(*) FROM user_roles WHERE role='ministry_leader' deve = 0.
