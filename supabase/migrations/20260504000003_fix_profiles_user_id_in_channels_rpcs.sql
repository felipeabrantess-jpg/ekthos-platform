-- Migration: fix_profiles_user_id_in_channels_rpcs
-- Bug B: RPCs usavam profiles.id = auth.uid() para verificar permissão de pastor,
-- mas profiles.id é PK auto-gerado (UUID distinto do user UUID).
-- O campo correto é profiles.user_id, que é FK para auth.users(id).
-- Resultado: nenhum pastor não-admin conseguia listar canais (zero rows em profiles.id = auth.uid()).
-- Fix: trocar profiles.id = auth.uid() → profiles.user_id = auth.uid() nas 2 funções.
-- Diagnóstico: systematic-debugging 2026-05-04

-- ── list_church_channels ──────────────────────────────────────────────────────

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
  -- FIX A: auth.users.id qualificado (42702 ambiguity fix, 20260504000001)
  -- FIX B: profiles.user_id em vez de profiles.id (profiles.id é PK, não user FK)
  IF NOT (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  ) AND NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.user_id = auth.uid()        -- FIX B: era profiles.id
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

-- ── list_church_whatsapp_channels ─────────────────────────────────────────────

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
  -- FIX A: auth.users.id qualificado (42702 ambiguity fix, 20260504000002)
  -- FIX B: profiles.user_id em vez de profiles.id (profiles.id é PK, não user FK)
  IF NOT (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.user_id = auth.uid()      -- FIX B: era profiles.id
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
