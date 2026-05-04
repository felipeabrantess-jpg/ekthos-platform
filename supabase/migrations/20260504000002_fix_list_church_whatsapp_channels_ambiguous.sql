-- Migration: fix_list_church_whatsapp_channels_ambiguous
-- Bug: RETURNS TABLE (id UUID, ...) cria variável PL/pgSQL implícita "id"
-- que conflita com auth.users.id na subquery de permissão.
-- Erro: 42702 column reference "id" is ambiguous
-- Fix: qualificar explicitamente auth.users.id = auth.uid()
-- Diagnóstico: systematic-debugging 2026-05-04

CREATE OR REPLACE FUNCTION public.list_church_whatsapp_channels(
  p_church_id UUID
)
RETURNS TABLE (
  id                    UUID,
  provider              TEXT,
  phone_number          TEXT,
  instance_id           TEXT,
  display_name          TEXT,
  status                TEXT,
  error_message         TEXT,
  last_provisioned_at   TIMESTAMPTZ,
  updated_at            TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin Ekthos OU usuário da própria igreja
  -- FIX: auth.users.id qualificado para evitar ambiguidade com output var "id"
  IF NOT (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.church_id = p_church_id
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para listar canais desta igreja';
  END IF;

  RETURN QUERY
  SELECT c.id, c.provider, c.phone_number, c.instance_id,
         c.display_name, c.status, c.error_message,
         c.last_provisioned_at, c.updated_at
  FROM church_whatsapp_channels c
  WHERE c.church_id = p_church_id
  ORDER BY c.provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_church_whatsapp_channels(UUID)
  TO authenticated;
