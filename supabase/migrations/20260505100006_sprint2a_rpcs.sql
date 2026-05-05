-- ============================================================
-- Sprint 2A — Onda A — Migration 6
-- 3 RPCs para o cockpit de configuração de agentes
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- RPC 1: get_church_agent_full_config
-- Leitura cross-tenant completa para o cockpit.
-- Retorna church_agent_config + church_followup_config + template meta.
-- Somente admin Ekthos ou service_role pode chamar.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_church_agent_full_config(
  p_church_id  uuid,
  p_agent_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config    jsonb;
  v_followup  jsonb;
  v_template  jsonb;
BEGIN
  -- Guard: apenas admin Ekthos ou service_role
  IF NOT is_ekthos_admin() AND current_setting('role', true) <> 'service_role' THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  -- Ler configuração de identidade/tom do agente
  SELECT row_to_json(cac)::jsonb
  INTO   v_config
  FROM   public.church_agent_config cac
  WHERE  cac.church_id  = p_church_id
    AND  cac.agent_slug = p_agent_slug
  LIMIT 1;

  -- Ler configuração de follow-up / touchpoints
  SELECT row_to_json(cfc)::jsonb
  INTO   v_followup
  FROM   public.church_followup_config cfc
  WHERE  cfc.church_id  = p_church_id
    AND  cfc.agent_slug = p_agent_slug
  LIMIT 1;

  -- Metadados do template ativo (sem expor base_prompt por segurança)
  SELECT jsonb_build_object(
    'agent_slug', apt.agent_slug,
    'name',       apt.name,
    'version',    apt.version,
    'active',     apt.active
  )
  INTO   v_template
  FROM   public.agent_prompt_templates apt
  WHERE  apt.agent_slug = p_agent_slug
    AND  apt.active = true
  ORDER BY apt.version DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'church_id',     p_church_id,
    'agent_slug',    p_agent_slug,
    'config',        COALESCE(v_config,   '{}'::jsonb),
    'followup',      COALESCE(v_followup, '{}'::jsonb),
    'template_meta', COALESCE(v_template, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_church_agent_full_config(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_church_agent_full_config(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_church_agent_full_config(uuid, text) TO service_role;


-- ────────────────────────────────────────────────────────────
-- RPC 2: upsert_church_agent_config_admin
-- Cockpit: admin Ekthos grava configuração de identidade/tom do agente.
-- COALESCE em cada campo: só sobrescreve o que foi enviado.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_agent_config_admin(
  p_church_id  uuid,
  p_agent_slug text,
  p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: only ekthos admin can call this function';
  END IF;

  INSERT INTO public.church_agent_config (
    church_id, agent_slug,
    agent_name, pastor_name, church_name_short,
    formality, denomination, preferred_verses, forbidden_topics,
    pastoral_depth, first_contact_delay, send_window,
    emoji_usage, custom_overrides, custom_instructions,
    service_schedule, escalation_config,
    updated_by, updated_at
  )
  VALUES (
    p_church_id, p_agent_slug,
    p_data->>'agent_name',
    p_data->>'pastor_name',
    p_data->>'church_name_short',
    p_data->>'formality',
    p_data->>'denomination',
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_data->'preferred_verses', '[]'::jsonb))),
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_data->'forbidden_topics', '[]'::jsonb))),
    p_data->>'pastoral_depth',
    p_data->>'first_contact_delay',
    p_data->'send_window',
    p_data->>'emoji_usage',
    p_data->'custom_overrides',
    p_data->>'custom_instructions',
    p_data->'service_schedule',
    p_data->'escalation_config',
    auth.uid(),
    now()
  )
  ON CONFLICT (church_id, agent_slug)
  DO UPDATE SET
    agent_name          = COALESCE(EXCLUDED.agent_name,          church_agent_config.agent_name),
    pastor_name         = COALESCE(EXCLUDED.pastor_name,         church_agent_config.pastor_name),
    church_name_short   = COALESCE(EXCLUDED.church_name_short,   church_agent_config.church_name_short),
    formality           = COALESCE(EXCLUDED.formality,           church_agent_config.formality),
    denomination        = COALESCE(EXCLUDED.denomination,        church_agent_config.denomination),
    preferred_verses    = COALESCE(EXCLUDED.preferred_verses,    church_agent_config.preferred_verses),
    forbidden_topics    = COALESCE(EXCLUDED.forbidden_topics,    church_agent_config.forbidden_topics),
    pastoral_depth      = COALESCE(EXCLUDED.pastoral_depth,      church_agent_config.pastoral_depth),
    first_contact_delay = COALESCE(EXCLUDED.first_contact_delay, church_agent_config.first_contact_delay),
    send_window         = COALESCE(EXCLUDED.send_window,         church_agent_config.send_window),
    emoji_usage         = COALESCE(EXCLUDED.emoji_usage,         church_agent_config.emoji_usage),
    custom_overrides    = COALESCE(EXCLUDED.custom_overrides,    church_agent_config.custom_overrides),
    custom_instructions = COALESCE(EXCLUDED.custom_instructions, church_agent_config.custom_instructions),
    service_schedule    = COALESCE(EXCLUDED.service_schedule,    church_agent_config.service_schedule),
    escalation_config   = COALESCE(EXCLUDED.escalation_config,   church_agent_config.escalation_config),
    updated_by          = EXCLUDED.updated_by,
    updated_at          = now();

  SELECT row_to_json(cac)::jsonb
  INTO   v_result
  FROM   public.church_agent_config cac
  WHERE  cac.church_id = p_church_id AND cac.agent_slug = p_agent_slug;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_church_agent_config_admin(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_church_agent_config_admin(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_church_agent_config_admin(uuid, text, jsonb) TO service_role;


-- ────────────────────────────────────────────────────────────
-- RPC 3: upsert_church_followup_config_admin
-- Cockpit: admin Ekthos grava touchpoints e régua de follow-up.
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_followup_config_admin(
  p_church_id  uuid,
  p_agent_slug text,
  p_data       jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: only ekthos admin can call this function';
  END IF;

  INSERT INTO public.church_followup_config (
    church_id, agent_slug,
    enabled_touchpoints, followup_enabled, duration_days,
    send_window_start, send_window_end,
    stop_conditions, escalation_conditions,
    next_action_after_completion,
    updated_by, updated_at
  )
  VALUES (
    p_church_id, p_agent_slug,
    ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_data->'enabled_touchpoints', '[]'::jsonb))),
    COALESCE((p_data->>'followup_enabled')::boolean, true),
    (p_data->>'duration_days')::integer,
    (p_data->>'send_window_start')::time,
    (p_data->>'send_window_end')::time,
    COALESCE(p_data->'stop_conditions',       '{"on_response": true, "on_attendance": true}'::jsonb),
    COALESCE(p_data->'escalation_conditions', '{}'::jsonb),
    p_data->>'next_action_after_completion',
    auth.uid(),
    now()
  )
  ON CONFLICT (church_id, agent_slug)
  DO UPDATE SET
    enabled_touchpoints          = COALESCE(EXCLUDED.enabled_touchpoints,          church_followup_config.enabled_touchpoints),
    followup_enabled             = COALESCE(EXCLUDED.followup_enabled,             church_followup_config.followup_enabled),
    duration_days                = COALESCE(EXCLUDED.duration_days,                church_followup_config.duration_days),
    send_window_start            = COALESCE(EXCLUDED.send_window_start,            church_followup_config.send_window_start),
    send_window_end              = COALESCE(EXCLUDED.send_window_end,              church_followup_config.send_window_end),
    stop_conditions              = COALESCE(EXCLUDED.stop_conditions,              church_followup_config.stop_conditions),
    escalation_conditions        = COALESCE(EXCLUDED.escalation_conditions,        church_followup_config.escalation_conditions),
    next_action_after_completion = COALESCE(EXCLUDED.next_action_after_completion, church_followup_config.next_action_after_completion),
    updated_by                   = EXCLUDED.updated_by,
    updated_at                   = now();

  SELECT row_to_json(cfc)::jsonb
  INTO   v_result
  FROM   public.church_followup_config cfc
  WHERE  cfc.church_id = p_church_id AND cfc.agent_slug = p_agent_slug;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_church_followup_config_admin(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_church_followup_config_admin(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_church_followup_config_admin(uuid, text, jsonb) TO service_role;
