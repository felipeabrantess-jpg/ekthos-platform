-- Migration: rls_admin_events_restrict_to_select
-- Code review 04/05/2026 — refinamento de 20260504100003
--
-- Problema identificado no review:
--   A policy "admin_ekthos_all_admin_events" usava FOR ALL, concedendo DELETE
--   e UPDATE para admins Ekthos autenticados via JWT.
--   admin_events é uma tabela de auditoria imutável (append-only) — admins
--   jamais devem deletar ou atualizar registros diretamente pela API REST.
--
-- Todos os WRITES em admin_events ocorrem via EFs com service_role (bypass RLS).
--   A policy de authenticated precisa apenas de SELECT para leitura no cockpit.
--   Não é necessária policy de INSERT para authenticated porque EFs usam service_role.
--
-- Fix: substituir FOR ALL por FOR SELECT na policy de admin Ekthos.

DROP POLICY IF EXISTS "admin_ekthos_all_admin_events" ON public.admin_events;

CREATE POLICY "admin_ekthos_select_admin_events"
  ON public.admin_events
  FOR SELECT
  TO authenticated
  USING (is_ekthos_admin());
