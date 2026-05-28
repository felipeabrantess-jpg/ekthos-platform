-- Migration: rpc_church_agent_config_get_upsert
-- Creates two SECURITY DEFINER RPCs for the Ekthos admin cockpit to
-- read and write church_agent_config.custom_instructions.
--
-- Auth pattern: auth.uid() + query auth.users (NOT auth.jwt()) — required
-- because auth.jwt() is unreliable inside SECURITY DEFINER chains in this
-- project's PostgREST / ES256 setup.

-- ── get_church_agent_config ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_church_agent_config(
  p_church_id  uuid,
  p_agent_slug text
)
RETURNS TABLE (
  church_id          uuid,
  agent_slug         text,
  custom_instructions text,
  formality          text,
  denomination       text,
  updated_by         uuid,
  created_at         timestamptz,
  updated_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT COALESCE((raw_app_meta_data->>'is_ekthos_admin')::boolean, false)
  INTO v_is_admin FROM auth.users WHERE id = auth.uid();

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin Ekthos.';
  END IF;

  RETURN QUERY
  SELECT
    cac.church_id::uuid,
    cac.agent_slug::text,
    cac.custom_instructions::text,
    cac.formality::text,
    cac.denomination::text,
    cac.updated_by::uuid,
    cac.created_at::timestamptz,
    cac.updated_at::timestamptz
  FROM public.church_agent_config cac
  WHERE cac.church_id = p_church_id
    AND cac.agent_slug = p_agent_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_church_agent_config(uuid, text) TO authenticated;

-- ── upsert_church_agent_config ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_agent_config(
  p_church_id           uuid,
  p_agent_slug          text,
  p_custom_instructions text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean := false;
BEGIN
  v_admin_id := auth.uid();

  SELECT COALESCE((raw_app_meta_data->>'is_ekthos_admin')::boolean, false)
  INTO v_is_admin FROM auth.users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin Ekthos.';
  END IF;

  IF p_church_id IS NULL OR p_agent_slug IS NULL THEN
    RAISE EXCEPTION 'church_id e agent_slug são obrigatórios.';
  END IF;

  INSERT INTO public.church_agent_config (
    church_id, agent_slug, custom_instructions, updated_by
  )
  VALUES (
    p_church_id, p_agent_slug, p_custom_instructions, v_admin_id
  )
  ON CONFLICT (church_id, agent_slug)
  DO UPDATE SET
    custom_instructions = EXCLUDED.custom_instructions,
    updated_by          = EXCLUDED.updated_by,
    updated_at          = now();

  RETURN jsonb_build_object(
    'ok',         true,
    'church_id',  p_church_id,
    'agent_slug', p_agent_slug
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_church_agent_config(uuid, text, text) TO authenticated;
