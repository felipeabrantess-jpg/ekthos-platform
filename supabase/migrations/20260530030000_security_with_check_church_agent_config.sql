-- Migration: security — add WITH CHECK to church_agent_config RLS policies (P1)
-- Applied: 2026-05-30 (MEGA-ONDA FASE 0 — F-A0e)
-- Purpose: Policy cac_config_tenant só tinha USING — sem WITH CHECK um tenant autenticado
--          podia fazer UPDATE trocando church_id para outra igreja (cross-tenant write).
-- Aplicado diretamente no banco antes desta migration — esta migration documenta o estado.

ALTER POLICY cac_config_tenant ON public.church_agent_config
  USING (church_id = auth_church_id())
  WITH CHECK (auth_church_id() = church_id);
