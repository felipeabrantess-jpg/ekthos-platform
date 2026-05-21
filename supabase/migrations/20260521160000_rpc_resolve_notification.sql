-- ============================================================
-- Migration: resolve_notification RPC
-- Sprint: BLOCO 3 — SA-6
-- Criada em: 2026-05-21
--
-- Cria a função pública resolve_notification(uuid) que marca
-- uma internal_notification como resolvida pelo usuário autenticado.
--
-- Pré-requisitos:
--   - Tabela internal_notifications com colunas resolved_at, resolved_by
--     (criadas em 20260502000004_create_internal_notifications.sql)
--   - Funções auth.uid() e auth_church_id() disponíveis
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id   uuid;
  v_church_id uuid;
  v_rows      integer := 0;
BEGIN
  -- Requer autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado.';
  END IF;

  -- church_id vem do JWT app_metadata (fonte da verdade, read-only)
  v_church_id := auth_church_id();

  -- Valida posse tenant antes de atualizar
  IF NOT EXISTS (
    SELECT 1 FROM public.internal_notifications
    WHERE id        = p_notification_id
      AND church_id = v_church_id
  ) THEN
    RAISE EXCEPTION 'Notificação não encontrada ou acesso negado.';
  END IF;

  UPDATE public.internal_notifications
  SET
    status      = 'resolved',
    resolved_at = now(),
    resolved_by = v_user_id,
    updated_at  = now()
  WHERE id        = p_notification_id
    AND church_id = v_church_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN (v_rows = 1);
END;
$$;

-- Acesso: admins Ekthos autenticados + service_role (Edge Functions)
GRANT EXECUTE ON FUNCTION public.resolve_notification(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_notification(uuid) TO authenticated;
