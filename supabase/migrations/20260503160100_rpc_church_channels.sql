-- Migration: rpc_church_channels
-- RPCs para church_channels (tabela genérica de canais):
--   upsert_church_channel  — admin Ekthos cria/atualiza canal
--   list_church_channels   — admin ou pastor da igreja lista canais

-- ── upsert_church_channel ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_channel(
  p_church_id            UUID,
  p_provider             TEXT,
  p_provider_instance_id TEXT,
  p_phone_number         TEXT,
  p_display_name         TEXT,
  p_agent_slugs          TEXT[],
  p_initial_status       TEXT    DEFAULT 'pending',
  p_channel_id           UUID    DEFAULT NULL  -- UPDATE explícito pelo id
)
RETURNS TABLE (
  channel_id UUID,
  is_new     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin    BOOLEAN;
  v_existing_id UUID;
  v_new_id      UUID;
BEGIN
  -- Validação admin Ekthos (Decisão 57: auth.uid() + query auth.users)
  SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
  INTO v_is_admin
  FROM auth.users WHERE id = auth.uid();

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas admin Ekthos pode configurar canais';
  END IF;

  -- Validar provider
  IF p_provider NOT IN ('zapi','meta_cloud','instagram','telegram','whatsapp_cloud') THEN
    RAISE EXCEPTION 'Provider inválido: %. Permitidos: zapi, meta_cloud, instagram, telegram, whatsapp_cloud', p_provider;
  END IF;

  -- Validar status
  IF p_initial_status NOT IN ('pending','provisioning','connected','error','disabled') THEN
    RAISE EXCEPTION 'Status inválido: %. Permitidos: pending, provisioning, connected, error, disabled', p_initial_status;
  END IF;

  -- Modo UPDATE explícito: channel_id fornecido
  IF p_channel_id IS NOT NULL THEN
    UPDATE church_channels
    SET provider              = p_provider,
        provider_instance_id  = p_provider_instance_id,
        phone_number          = p_phone_number,
        display_name          = p_display_name,
        agent_slugs           = p_agent_slugs,
        status                = p_initial_status,
        error_message         = NULL,
        updated_by            = auth.uid(),
        updated_at            = now()
    WHERE id = p_channel_id
    RETURNING id INTO v_existing_id;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'Canal não encontrado: %', p_channel_id;
    END IF;

    RETURN QUERY SELECT v_existing_id, false;
    RETURN;
  END IF;

  -- Modo upsert por (church_id, provider, provider_instance_id)
  SELECT id INTO v_existing_id
  FROM church_channels
  WHERE church_id            = p_church_id
    AND provider             = p_provider
    AND COALESCE(provider_instance_id, '') = COALESCE(p_provider_instance_id, '');

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE
    UPDATE church_channels
    SET phone_number         = p_phone_number,
        display_name         = p_display_name,
        agent_slugs          = p_agent_slugs,
        status               = p_initial_status,
        error_message        = NULL,
        updated_by           = auth.uid(),
        updated_at           = now()
    WHERE id = v_existing_id;

    RETURN QUERY SELECT v_existing_id, false;
  ELSE
    -- INSERT
    INSERT INTO church_channels
      (church_id, provider, provider_instance_id, phone_number,
       display_name, agent_slugs, status, updated_by)
    VALUES
      (p_church_id, p_provider, p_provider_instance_id, p_phone_number,
       p_display_name, p_agent_slugs, p_initial_status, auth.uid())
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_church_channel(UUID,TEXT,TEXT,TEXT,TEXT,TEXT[],TEXT,UUID)
  TO authenticated;

-- ── list_church_channels ─────────────────────────────────────────────────────

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
  IF NOT (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users WHERE id = auth.uid()) = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.church_id = p_church_id
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para listar canais desta igreja';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.provider,
    c.provider_instance_id,
    c.phone_number,
    c.display_name,
    c.status,
    c.agent_slugs,
    c.error_message,
    c.last_provisioned_at,
    c.updated_at
  FROM church_channels c
  WHERE c.church_id = p_church_id
  ORDER BY c.provider, c.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_church_channels(UUID)
  TO authenticated;
