-- Migration: fix_list_church_channels_ambiguous
-- Bug: RETURNS TABLE (id UUID, ...) cria variável PL/pgSQL implícita "id"
-- que conflita com auth.users.id na subquery de permissão.
-- Fix: qualificar explicitamente auth.users.id = auth.uid()
-- Diagnóstico: systematic-debugging 2026-05-04

CREATE OR REPLACE FUNCTION public.list_church_channels(
  p_church_id UUID
)
RETURNS TABLE (
  id                    UUID,
  provider              TEXT,
  provider_instance_id  TEXT,
  phone_number          TEXT,
  display_name          TEXT,
  status                TEXT,
  agent_slugs           TEXT[],
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
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.church_id = p_church_id
  ) THEN
    RAISE EXCEPTION 'Sem permissão para listar canais desta igreja';
  END IF;

  RETURN QUERY
  SELECT c.id, c.provider, c.provider_instance_id, c.phone_number,
         c.display_name, c.status, c.agent_slugs, c.error_message,
         c.last_provisioned_at, c.updated_at
  FROM church_channels c
  WHERE c.church_id = p_church_id
  ORDER BY c.provider, c.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_church_channels(UUID)
  TO authenticated;
