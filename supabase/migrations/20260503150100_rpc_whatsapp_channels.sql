-- Migration: rpc_whatsapp_channels
-- RPCs:
--   upsert_church_whatsapp_channel — admin Ekthos cria/atualiza canal
--   list_church_whatsapp_channels  — admin ou pastor da igreja lista canais

-- ── upsert ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_whatsapp_channel(
  p_church_id      UUID,
  p_provider       TEXT,
  p_phone_number   TEXT,
  p_instance_id    TEXT,
  p_display_name   TEXT,
  p_initial_status TEXT DEFAULT 'pending'
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

  -- Validação status
  IF p_initial_status NOT IN ('pending','provisioning','connected','error') THEN
    RAISE EXCEPTION 'Status inválido: %', p_initial_status;
  END IF;

  -- Tenta encontrar registro existente
  SELECT id INTO v_existing_id
  FROM church_whatsapp_channels
  WHERE church_id = p_church_id AND provider = p_provider;

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE
    UPDATE church_whatsapp_channels
    SET phone_number  = p_phone_number,
        instance_id   = p_instance_id,
        display_name  = p_display_name,
        status        = p_initial_status,
        error_message = NULL,
        updated_by    = auth.uid(),
        updated_at    = now()
    WHERE id = v_existing_id;

    RETURN QUERY SELECT v_existing_id, false;
  ELSE
    -- INSERT — popula também channel_type e session_status para manter
    -- compatibilidade com lógica existente que lê essas colunas.
    -- channel_type CHECK: 'meta_cloud','zapi','chatpro','mock'
    --   → mapear 'meta' → 'meta_cloud'; demais iguais ao provider
    -- session_status CHECK: 'disconnected','connected','testing','active'
    --   → usar 'disconnected' como default seguro para novos registros
    INSERT INTO church_whatsapp_channels
      (church_id, provider, phone_number, instance_id, display_name,
       status, channel_type, session_status, updated_by)
    VALUES
      (p_church_id, p_provider, p_phone_number, p_instance_id, p_display_name,
       p_initial_status,
       CASE p_provider WHEN 'meta' THEN 'meta_cloud' ELSE p_provider END,
       CASE p_initial_status WHEN 'connected' THEN 'connected' ELSE 'disconnected' END,
       auth.uid())
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_church_whatsapp_channel(UUID,TEXT,TEXT,TEXT,TEXT,TEXT)
  TO authenticated;

-- ── list ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_church_whatsapp_channels(
  p_church_id UUID
)
RETURNS TABLE (
  id                   UUID,
  provider             TEXT,
  phone_number         TEXT,
  instance_id          TEXT,
  display_name         TEXT,
  status               TEXT,
  error_message        TEXT,
  last_provisioned_at  TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
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
    c.phone_number,
    c.instance_id,
    c.display_name,
    c.status,
    c.error_message,
    c.last_provisioned_at,
    c.updated_at
  FROM church_whatsapp_channels c
  WHERE c.church_id = p_church_id
  ORDER BY c.provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_church_whatsapp_channels(UUID)
  TO authenticated;
