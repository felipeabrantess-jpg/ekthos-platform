-- Migration: B-SB05 — Revogar RPCs anon inseguras (caso a caso)
-- Data: 2026-05-30
-- Auditoria: docs/product/B-SB05-ANON-RPCS-AUDIT.md
--
-- Contexto: Após auditoria case-by-case de 21 RPCs com EXECUTE concedido
-- para anon/PUBLIC, 3 foram identificadas como inseguras (escrevem dados
-- sem autenticação) e são aqui revogadas.
--
-- RPCs mantidas (sem alteração): auth_church_id, auth_user_role,
-- auth_can_all_people, auth_can_financial
-- RPCs trigger-only: anon revogado, PUBLIC retido (14 funções)
-- RPCs completamente revogadas: as 3 abaixo
-- ============================================================

-- 1. capture_visitor_to_pipeline
-- Motivo: INSERT em person_pipeline sem auth guard.
-- Chamada via visitor-capture EF com service_role — grant anon era dead weight.
REVOKE EXECUTE ON FUNCTION public.capture_visitor_to_pipeline FROM anon;
REVOKE EXECUTE ON FUNCTION public.capture_visitor_to_pipeline FROM PUBLIC;

-- 2. increment_qr_scanned_count
-- Motivo: UPDATE em qr_codes.scanned_count sem auth guard.
-- Mesma pattern — EF usa service_role, não precisava de grant anon.
REVOKE EXECUTE ON FUNCTION public.increment_qr_scanned_count FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_qr_scanned_count FROM PUBLIC;

-- 3. validate_session_token
-- Motivo: usa auth.uid() — no-op para anon. Grant desnecessário.
REVOKE EXECUTE ON FUNCTION public.validate_session_token FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_session_token FROM PUBLIC;
