-- ============================================================
-- Sprint 2A — Onda B — Migration pré-requisito
-- Permitir admin Ekthos atualizar campos de identidade de churches
-- churches_admin_select já existe (SELECT only)
-- Esta migration adiciona UPDATE para o admin poder editar
-- via Supabase JS direto no cockpit frontend.
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'churches_admin_update' AND tablename = 'churches'
  ) THEN
    CREATE POLICY churches_admin_update ON public.churches
      FOR UPDATE
      USING    (is_ekthos_admin())
      WITH CHECK (is_ekthos_admin());
  END IF;
END $$;
