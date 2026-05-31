-- Migration: B-SB06 — RLS em agent_executions e church_notes
-- Data: 2026-05-30
-- Auditoria: docs/product/AUDIT_RLS_SA-B6.md
--
-- Contexto: Duas tabelas sem RLS ativo. Aplicadas durante a MEGA-ONDA
-- via MCP (execute_sql) e documentadas aqui para reprodutibilidade.
-- ============================================================

-- agent_executions: restrito à própria igreja (multi-tenant isolamento)
ALTER TABLE public.agent_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "church_sees_own_executions" ON public.agent_executions;
CREATE POLICY "church_sees_own_executions" ON public.agent_executions
  FOR ALL
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- church_notes: apenas admins Ekthos (dados internos de conta)
ALTER TABLE public.church_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_only_church_notes" ON public.church_notes;
CREATE POLICY "admin_only_church_notes" ON public.church_notes
  FOR ALL
  USING (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());
