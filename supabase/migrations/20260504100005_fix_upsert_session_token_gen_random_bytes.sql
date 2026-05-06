-- Migration: fix_upsert_session_token_gen_random_bytes
-- Root cause identificado em 04/05/2026 durante investigação do 404 em produção.
--
-- Problema:
--   upsert_session_token usava gen_random_bytes(32) sem schema qualificado.
--   No Supabase, pgcrypto é instalado no schema 'extensions' (não 'public').
--   Funções com SECURITY DEFINER rodam com search_path fixo que não inclui 'extensions'.
--   Resultado: gen_random_bytes não encontrada → PostgREST retorna 404 no endpoint RPC.
--   (list_pending_activations retornava 200 porque não usa pgcrypto)
--
-- Fix:
--   1. Usar extensions.gen_random_bytes(32) com nome schema-qualificado.
--   2. Adicionar SET search_path = public, extensions como boa prática para SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.upsert_session_token(p_church_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO session_tokens (user_id, church_id, token, last_active_at)
  VALUES (auth.uid(), p_church_id, v_token, NOW())
  ON CONFLICT (user_id, church_id)
  DO UPDATE SET token = v_token, last_active_at = NOW();
  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_session_token(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_session_token(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.upsert_session_token(UUID) TO service_role;
