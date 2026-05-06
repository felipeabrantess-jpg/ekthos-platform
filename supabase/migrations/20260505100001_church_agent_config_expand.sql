-- ============================================================
-- Sprint 2A — Onda A — Migration 1
-- Expand church_agent_config: 5 novas colunas de identidade pastoral
-- + Fix RLS: substituir inline JWT check por is_ekthos_admin()
-- ============================================================

-- ── Novas colunas ────────────────────────────────────────────
ALTER TABLE public.church_agent_config
  ADD COLUMN IF NOT EXISTS agent_name        text,          -- nome que o agente usa ao se apresentar
  ADD COLUMN IF NOT EXISTS pastor_name       text,          -- nome do pastor titular para personalização
  ADD COLUMN IF NOT EXISTS church_name_short text,          -- apelido/nome curto da igreja nos prompts
  ADD COLUMN IF NOT EXISTS service_schedule  jsonb,         -- horários de cultos ex: [{"day":"domingo","time":"18:00"}]
  ADD COLUMN IF NOT EXISTS escalation_config jsonb;         -- regras de escalonamento ex: {"mode":"notify","contact":"..."}

-- ── Fix RLS: trocar inline JWT por is_ekthos_admin() ─────────
-- A política existente usa JWT inline — padrão errado do projeto.
-- is_ekthos_admin() é SECURITY DEFINER e verifica user_metadata + app_metadata.
DROP POLICY IF EXISTS church_agent_config_ekthos_admin_all ON public.church_agent_config;

CREATE POLICY church_agent_config_ekthos_admin_all ON public.church_agent_config
  FOR ALL
  USING    (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- Nota: cac_config_tenant (FOR ALL) permite pastor ler E escrever.
-- Decisão Sprint 2A: pastor só lê. Corrigir em sprint dedicado de CRM pré-go-live.
-- Não alterar agora para não quebrar fluxos existentes.
