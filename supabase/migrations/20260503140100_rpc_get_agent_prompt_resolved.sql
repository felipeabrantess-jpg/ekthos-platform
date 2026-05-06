-- Migration: rpc_get_agent_prompt_resolved
-- RPC SECURITY DEFINER que combina:
--   Camada 1: agent_prompt_templates.base_prompt (template global)
--   Camada 2: church_agent_config (config da igreja)
--   Camada 3: custom_instructions (texto livre do cockpit admin)
-- SET row_security = off: necessário porque auth.jwt() é NULL dentro de
-- SECURITY DEFINER — sem isso, RLS da church_agent_config bloqueia o SELECT.
-- Autenticação: auth.uid() + query auth.users (Decisão 57).

CREATE OR REPLACE FUNCTION public.get_agent_prompt_resolved(
  p_church_id  UUID,
  p_agent_slug TEXT
)
RETURNS TABLE (
  agent_slug          TEXT,
  church_id           UUID,
  base_prompt         TEXT,
  church_config       JSONB,
  custom_instructions TEXT,
  resolved_prompt     TEXT,
  template_version    INTEGER,
  has_custom_config   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_template         RECORD;
  v_config           RECORD;
  v_church_name      TEXT;
  v_resolved         TEXT;
  v_config_json      JSONB;
  v_formality        TEXT;
  v_denomination     TEXT;
  v_pastoral_depth   TEXT;
  v_emoji_usage      TEXT;
  v_preferred_verses TEXT[];
  v_send_window      JSONB;
  v_custom_overrides JSONB;
  v_has_config       BOOLEAN := false;
BEGIN
  -- Camada 1: template global (aborta se não existir)
  SELECT * INTO v_template
  FROM public.agent_prompt_templates
  WHERE agent_prompt_templates.agent_slug = p_agent_slug
    AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template ativo nao encontrado para agent_slug=%', p_agent_slug;
  END IF;

  -- Nome da igreja para placeholder {{church_name}}
  SELECT c.name INTO v_church_name
  FROM public.churches c
  WHERE c.id = p_church_id;

  -- Camada 2: config da igreja (fallback graceful se nao existir)
  SELECT * INTO v_config
  FROM public.church_agent_config cac
  WHERE cac.church_id = p_church_id
    AND cac.agent_slug = p_agent_slug
  LIMIT 1;

  v_has_config := FOUND;

  IF v_has_config THEN
    v_formality        := v_config.formality;
    v_denomination     := v_config.denomination;
    v_pastoral_depth   := v_config.pastoral_depth;
    v_emoji_usage      := v_config.emoji_usage;
    v_preferred_verses := v_config.preferred_verses;
    v_send_window      := v_config.send_window;
    v_custom_overrides := v_config.custom_overrides;
  END IF;

  -- Montar JSONB de config para retorno (estrutura previsivel mesmo vazia)
  IF NOT v_has_config THEN
    v_config_json := '{}'::jsonb;
  ELSE
    v_config_json := jsonb_build_object(
      'formality',           v_formality,
      'denomination',        v_denomination,
      'preferred_verses',    v_preferred_verses,
      'forbidden_topics',    v_config.forbidden_topics,
      'pastoral_depth',      v_pastoral_depth,
      'first_contact_delay', v_config.first_contact_delay,
      'send_window',         v_send_window,
      'emoji_usage',         v_emoji_usage,
      'custom_overrides',    v_custom_overrides
    );
  END IF;

  -- Resolver placeholders no base_prompt (mesmos labels do SYSTEM_BLOCK_B_TEMPLATE)
  v_resolved := v_template.base_prompt;

  v_resolved := REPLACE(v_resolved, '{{church_name}}',
    COALESCE(v_church_name, 'Igreja'));

  v_resolved := REPLACE(v_resolved, '{{denomination}}',
    COALESCE(NULLIF(v_denomination, ''), 'Evangelica nao-denominacional'));

  v_resolved := REPLACE(v_resolved, '{{formality}}',
    CASE COALESCE(v_formality, 'semiformal')
      WHEN 'formal'   THEN 'Formal - use "voce" com reverencia, linguagem mais cuidadosa'
      WHEN 'informal' THEN 'Informal - use "vc", emojis com moderacao, tom jovem e proximo'
      ELSE                 'Semi-formal - equilibrado, acolhedor mas respeitoso'
    END);

  v_resolved := REPLACE(v_resolved, '{{pastoral_depth}}',
    CASE COALESCE(v_pastoral_depth, 'moderate')
      WHEN 'deep'  THEN 'Alta - pode usar referencias biblicas e linguagem teologica'
      WHEN 'light' THEN 'Leve - foco no relacionamento, menos linguagem religiosa formal'
      ELSE              'Moderada - equilibrada entre calor relacional e fundamento biblico'
    END);

  v_resolved := REPLACE(v_resolved, '{{emoji_usage}}',
    CASE COALESCE(v_emoji_usage, 'moderate')
      WHEN 'none' THEN 'Nao usar emojis'
      WHEN 'high' THEN 'Usar emojis com frequencia para humanizar'
      ELSE             'Usar emojis com moderacao (max 2-3 por mensagem)'
    END);

  v_resolved := REPLACE(v_resolved, '{{preferred_verses}}',
    CASE
      WHEN v_preferred_verses IS NOT NULL
           AND array_length(v_preferred_verses, 1) > 0
      THEN array_to_string(v_preferred_verses, ', ')
      ELSE 'A criterio do agente (use versiculos de boas-vindas e encorajamento)'
    END);

  v_resolved := REPLACE(v_resolved, '{{send_window}}',
    CASE
      WHEN v_send_window IS NOT NULL
      THEN '**Janela de envio personalizada:** das '
           || COALESCE(v_send_window->>'start', '8')
           || 'h as '
           || COALESCE(v_send_window->>'end', '21')
           || 'h'
      ELSE '**Janela de envio:** 8h-21h (padrao)'
    END);

  v_resolved := REPLACE(v_resolved, '{{custom_overrides}}',
    CASE
      WHEN v_custom_overrides IS NOT NULL
      THEN E'\n**Instrucoes customizadas da lideranca:** ' || v_custom_overrides::text
      ELSE ''
    END);

  -- Camada 3: custom_instructions ao final (sob secao dedicada)
  IF v_has_config
     AND v_config.custom_instructions IS NOT NULL
     AND length(trim(v_config.custom_instructions)) > 0
  THEN
    v_resolved := v_resolved
      || E'\n\n## INSTRUCOES ESPECIFICAS DESTA IGREJA\n\n'
      || v_config.custom_instructions;
  END IF;

  RETURN QUERY SELECT
    p_agent_slug::TEXT,
    p_church_id::UUID,
    v_template.base_prompt::TEXT,
    v_config_json,
    CASE WHEN v_has_config THEN v_config.custom_instructions ELSE NULL END,
    v_resolved::TEXT,
    v_template.version::INTEGER,
    v_has_config;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_agent_prompt_resolved(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_prompt_resolved(UUID, TEXT) TO authenticated;
