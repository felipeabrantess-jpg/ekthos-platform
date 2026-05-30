-- Migration: security — revoke anon EXECUTE from 4 sensitive RPCs (P0)
-- Applied: 2026-05-30 (MEGA-ONDA FASE 0 — F-A0d)
-- Purpose: Remove acesso anônimo de RPCs que expõem config e prompt de igrejas.
-- Nota: 3 das 4 RPCs tinham PUBLIC EXECUTE (=X/ em proacl) — necessário REVOKE FROM PUBLIC.
-- Aplicado diretamente no banco antes desta migration — esta migration documenta o estado.

-- 1. Revogar PUBLIC (que herdava anon) em 3 das 4 funções
REVOKE EXECUTE ON FUNCTION public.get_agent_prompt_resolved(p_church_id uuid, p_agent_slug text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_church_agent_config(p_church_id uuid, p_agent_slug text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_church_onboarding_state(p_church_id uuid) FROM PUBLIC;

-- 2. Revogar anon diretamente de todas as 4 funções (idempotente)
REVOKE EXECUTE ON FUNCTION public.get_agent_prompt_resolved(p_church_id uuid, p_agent_slug text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_church_agent_config(p_church_id uuid, p_agent_slug text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_church_agent_full_config(p_church_id uuid, p_agent_slug text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_church_onboarding_state(p_church_id uuid) FROM anon;

-- 3. Garantir authenticated continua com acesso
GRANT EXECUTE ON FUNCTION public.get_agent_prompt_resolved(p_church_id uuid, p_agent_slug text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_church_agent_config(p_church_id uuid, p_agent_slug text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_church_agent_full_config(p_church_id uuid, p_agent_slug text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_church_onboarding_state(p_church_id uuid) TO authenticated;
