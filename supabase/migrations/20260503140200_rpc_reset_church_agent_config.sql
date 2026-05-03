-- Migration: rpc_reset_church_agent_config
-- Zera APENAS custom_instructions (NULL) em church_agent_config.
-- NÃO apaga o row — preserva os 8 campos estruturados (formality, denomination, etc.)
-- Apenas admin Ekthos pode executar (Decisão 57: auth.uid() + query auth.users).

CREATE OR REPLACE FUNCTION public.reset_church_agent_config(
  p_church_id  UUID,
  p_agent_slug TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
  INTO v_is_admin
  FROM auth.users
  WHERE id = auth.uid();

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas admin Ekthos pode resetar config';
  END IF;

  IF p_church_id IS NULL OR p_agent_slug IS NULL THEN
    RAISE EXCEPTION 'church_id e agent_slug são obrigatórios';
  END IF;

  UPDATE public.church_agent_config
  SET custom_instructions = NULL,
      updated_by          = auth.uid(),
      updated_at          = now()
  WHERE church_id  = p_church_id
    AND agent_slug = p_agent_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_church_agent_config(UUID, TEXT) TO authenticated;
