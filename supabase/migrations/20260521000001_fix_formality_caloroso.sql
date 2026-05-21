-- =====================================================
-- Fix: adiciona branch 'caloroso' no CASE formality
-- RPC: get_agent_prompt_resolved
-- Migration ADITIVA — preserva todos os branches existentes
-- Aprovado por Felipe em 2026-05-21
-- OPS-DEBT-041 parcialmente resolvido (gap formality='caloroso')
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_agent_prompt_resolved(p_church_id uuid, p_agent_slug text)
RETURNS TABLE(agent_slug text, church_id uuid, base_prompt text, church_config jsonb, custom_instructions text, resolved_prompt text, template_version integer, has_custom_config boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $function$
DECLARE
  v_template     RECORD;
  v_config       RECORD;
  v_church_name  TEXT;
  v_resolved     TEXT;
  v_config_json  JSONB;
  v_formality    TEXT;
  v_denomination TEXT;
  v_pastoral_depth TEXT;
  v_emoji_usage  TEXT;
  v_preferred_verses TEXT[];
  v_send_window  JSONB;
  v_custom_overrides JSONB;
  v_has_config   BOOLEAN := false;
BEGIN
  SELECT * INTO v_template
  FROM public.agent_prompt_templates
  WHERE agent_prompt_templates.agent_slug = p_agent_slug
    AND active = true
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template ativo não encontrado para agent_slug=%', p_agent_slug;
  END IF;

  SELECT c.name INTO v_church_name
  FROM public.churches c
  WHERE c.id = p_church_id;

  SELECT * INTO v_config
  FROM public.church_agent_config cac
  WHERE cac.church_id = p_church_id
    AND cac.agent_slug = p_agent_slug
  LIMIT 1;

  v_has_config := FOUND;

  IF v_has_config THEN
    v_formality         := v_config.formality;
    v_denomination      := v_config.denomination;
    v_pastoral_depth    := v_config.pastoral_depth;
    v_emoji_usage       := v_config.emoji_usage;
    v_preferred_verses  := v_config.preferred_verses;
    v_send_window       := v_config.send_window;
    v_custom_overrides  := v_config.custom_overrides;
  END IF;

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

  v_resolved := v_template.base_prompt;

  v_resolved := REPLACE(v_resolved, '{{church_name}}',
    COALESCE(v_church_name, 'Igreja'));

  v_resolved := REPLACE(v_resolved, '{{denomination}}',
    COALESCE(NULLIF(v_denomination, ''), 'Evangélica não-denominacional'));

  -- Fix 2026-05-21: adicionado WHEN 'caloroso' — anteriormente caía no ELSE (semiformal)
  v_resolved := REPLACE(v_resolved, '{{formality}}',
    CASE COALESCE(v_formality, 'semiformal')
      WHEN 'formal'    THEN 'Formal — use "você" com reverência, linguagem mais cuidadosa'
      WHEN 'informal'  THEN 'Informal — use "vc", emojis com moderação, tom jovem e próximo'
      WHEN 'caloroso'  THEN 'Caloroso — tom afetivo e acolhedor, como um pastor que conhece cada membro pelo nome'
      ELSE                  'Semi-formal — equilibrado, acolhedor mas respeitoso'
    END);

  v_resolved := REPLACE(v_resolved, '{{pastoral_depth}}',
    CASE COALESCE(v_pastoral_depth, 'moderate')
      WHEN 'deep'  THEN 'Alta — pode usar referências bíblicas e linguagem teológica'
      WHEN 'light' THEN 'Leve — foco no relacionamento, menos linguagem religiosa formal'
      ELSE              'Moderada — equilibrada entre calor relacional e fundamento bíblico'
    END);

  v_resolved := REPLACE(v_resolved, '{{emoji_usage}}',
    CASE COALESCE(v_emoji_usage, 'moderate')
      WHEN 'none' THEN 'Não usar emojis'
      WHEN 'high' THEN 'Usar emojis com frequência para humanizar'
      ELSE             'Usar emojis com moderação (máx 2-3 por mensagem)'
    END);

  v_resolved := REPLACE(v_resolved, '{{preferred_verses}}',
    CASE
      WHEN v_preferred_verses IS NOT NULL
           AND array_length(v_preferred_verses, 1) > 0
      THEN array_to_string(v_preferred_verses, ', ')
      ELSE 'A critério do agente (use versículos de boas-vindas e encorajamento)'
    END);

  v_resolved := REPLACE(v_resolved, '{{send_window}}',
    CASE
      WHEN v_send_window IS NOT NULL
      THEN '**Janela de envio personalizada:** das '
           || COALESCE(v_send_window->>'start', '8')
           || 'h às '
           || COALESCE(v_send_window->>'end', '21')
           || 'h'
      ELSE '**Janela de envio:** 8h–21h (padrão)'
    END);

  v_resolved := REPLACE(v_resolved, '{{custom_overrides}}',
    CASE
      WHEN v_custom_overrides IS NOT NULL
      THEN E'\n**Instruções customizadas da liderança:** ' || v_custom_overrides::text
      ELSE ''
    END);

  IF v_has_config
     AND v_config.custom_instructions IS NOT NULL
     AND length(trim(v_config.custom_instructions)) > 0
  THEN
    v_resolved := v_resolved
      || E'\n\n## INSTRUÇÕES ESPECÍFICAS DESTA IGREJA\n\n'
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
$function$;

GRANT EXECUTE ON FUNCTION public.get_agent_prompt_resolved(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_prompt_resolved(uuid, text) TO authenticated;
