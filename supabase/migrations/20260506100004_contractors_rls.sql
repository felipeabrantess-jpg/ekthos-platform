-- ============================================================
-- Frente 3A — Migration 4 (numerada como 100004)
-- RLS para tabela contractors
-- 4 políticas: ekthos_admin ALL, member SELECT, admin INSERT, admin UPDATE
-- Sem DELETE policy — soft-delete via UPDATE is_active=false
-- ============================================================

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contractors_ekthos_admin_all ON public.contractors;
CREATE POLICY contractors_ekthos_admin_all
  ON public.contractors
  FOR ALL TO authenticated
  USING    (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

DROP POLICY IF EXISTS contractors_church_member_select ON public.contractors;
CREATE POLICY contractors_church_member_select
  ON public.contractors
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
    )
  );

DROP POLICY IF EXISTS contractors_church_admin_insert ON public.contractors;
CREATE POLICY contractors_church_admin_insert
  ON public.contractors
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  );

DROP POLICY IF EXISTS contractors_church_admin_update ON public.contractors;
CREATE POLICY contractors_church_admin_update
  ON public.contractors
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  );

-- Sem política DELETE — desativação via UPDATE is_active=false (soft-delete, Decisão 111)
