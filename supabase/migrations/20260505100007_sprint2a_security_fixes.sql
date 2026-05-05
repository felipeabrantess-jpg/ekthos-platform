-- ============================================================
-- Sprint 2A — Onda A — Migration 7
-- Correções de segurança (code review pós-aplicação)
-- ============================================================
-- C1: REVOKE anon + regravar grants corretos nas novas tabelas
-- C2: is_ekthos_admin() não deve ler user_metadata (user-controlled)
-- I1: Adicionar triggers updated_at nas 2 novas tabelas
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- C2: Corrigir is_ekthos_admin() — remover leitura de user_metadata
-- user_metadata é controlável pelo próprio usuário via updateUser()
-- Somente app_metadata (modificável apenas via Admin API) é confiável
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_ekthos_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'is_ekthos_admin')::boolean,
    false
  )
$$;

-- ────────────────────────────────────────────────────────────
-- C1: Corrigir grants em church_followup_config
-- REVOKE ALL FROM PUBLIC não remove grants pré-existentes do anon
-- via pg_default_acl do schema public no Supabase
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.church_followup_config FROM anon;
REVOKE ALL ON TABLE public.church_followup_config FROM authenticated;

-- Re-aplicar somente o que é intencional:
-- Tenant (pastor): somente leitura — cockpit admin escreve
GRANT SELECT ON TABLE public.church_followup_config TO authenticated;
-- service_role já tem bypass de RLS; grant explícito para clareza
GRANT ALL ON TABLE public.church_followup_config TO service_role;

-- ────────────────────────────────────────────────────────────
-- C1: Corrigir grants em reengagement_journey
-- ────────────────────────────────────────────────────────────
REVOKE ALL ON TABLE public.reengagement_journey FROM anon;
REVOKE ALL ON TABLE public.reengagement_journey FROM authenticated;

-- Re-aplicar somente o que é intencional:
-- Tenant (pastor): ALL — pode anotar, marcar caso sensível, pausar
GRANT SELECT, INSERT, UPDATE ON TABLE public.reengagement_journey TO authenticated;
GRANT ALL ON TABLE public.reengagement_journey TO service_role;

-- ────────────────────────────────────────────────────────────
-- I1: Trigger updated_at — church_followup_config
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_church_followup_config_updated_at ON public.church_followup_config;
CREATE TRIGGER trg_church_followup_config_updated_at
  BEFORE UPDATE ON public.church_followup_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- I1: Trigger updated_at — reengagement_journey
-- ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_reengagement_journey_updated_at ON public.reengagement_journey;
CREATE TRIGGER trg_reengagement_journey_updated_at
  BEFORE UPDATE ON public.reengagement_journey
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
