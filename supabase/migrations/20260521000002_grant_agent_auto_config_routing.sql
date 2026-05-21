-- =====================================================
-- Fix: admin_grant_agent auto-cria church_agent_config
--      e church_agent_channel_routing ao conceder grant
-- PR-3 + PR-4 — branch fix/grant-agent-config-routing-defaults
-- Aprovado por Felipe em 2026-05-21
-- OPS-DEBT: corrige zombie grants (grants sem config/routing)
-- =====================================================

CREATE OR REPLACE FUNCTION public.admin_grant_agent(
  p_church_id                uuid,
  p_agent_slug               text,
  p_grant_type               text,
  p_duration_days            integer DEFAULT NULL,
  p_notes                    text    DEFAULT NULL,
  p_stripe_payment_intent_id text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ends_at         timestamptz;
  v_grant_id        uuid;
  v_config_created  boolean := false;
  v_routing_created boolean := false;
  v_rows            integer;
BEGIN
  -- Auth: apenas admin Ekthos
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  -- Validar grant_type
  IF p_grant_type NOT IN ('trial', 'courtesy', 'paid') THEN
    RAISE EXCEPTION 'grant_type inválido: %. Use trial, courtesy ou paid.', p_grant_type;
  END IF;

  -- Trial exige duration_days > 0
  IF p_grant_type = 'trial' THEN
    IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
      RAISE EXCEPTION 'trial exige duration_days maior que zero';
    END IF;
    v_ends_at := now() + (p_duration_days || ' days')::interval;
  END IF;

  -- Verificar que o agente existe e está ativo
  IF NOT EXISTS (
    SELECT 1 FROM agents_catalog WHERE slug = p_agent_slug AND active = true
  ) THEN
    RAISE EXCEPTION 'agent_slug inválido ou inativo: %', p_agent_slug;
  END IF;

  -- Verificar que a igreja existe
  IF NOT EXISTS (SELECT 1 FROM churches WHERE id = p_church_id) THEN
    RAISE EXCEPTION 'church_id inválido: %', p_church_id;
  END IF;

  -- Upsert em agent_grants
  INSERT INTO agent_grants (
    church_id,
    agent_slug,
    grant_type,
    granted_by,
    ends_at,
    notes,
    stripe_payment_intent_id,
    active,
    revoked_at,
    revoked_by
  ) VALUES (
    p_church_id,
    p_agent_slug,
    p_grant_type,
    auth.uid(),
    v_ends_at,
    p_notes,
    p_stripe_payment_intent_id,
    true,
    NULL,
    NULL
  )
  ON CONFLICT (church_id, agent_slug) DO UPDATE SET
    grant_type               = EXCLUDED.grant_type,
    granted_by               = EXCLUDED.granted_by,
    ends_at                  = EXCLUDED.ends_at,
    notes                    = EXCLUDED.notes,
    stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    active                   = true,
    revoked_at               = NULL,
    revoked_by               = NULL,
    starts_at                = now(),
    updated_at               = now()
  RETURNING id INTO v_grant_id;

  -- PR-3: Auto-criar church_agent_config (enums NULL — RPC get_agent_prompt_resolved
  --  já tem COALESCE/ELSE para todos quando NULL; enums do DB diferem dos valores
  --  internos da RPC e não podem ser inseridos diretamente sem violar CHECK)
  INSERT INTO church_agent_config (church_id, agent_slug)
  VALUES (p_church_id, p_agent_slug)
  ON CONFLICT (church_id, agent_slug) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_config_created := v_rows > 0;

  -- PR-4: Auto-criar church_agent_channel_routing para agentes com canal configurado
  -- Whitelist dinâmica via agent_channel_routing (agentes internos sem entrada = sem routing)
  INSERT INTO church_agent_channel_routing (church_id, agent_slug, context_type)
  SELECT p_church_id, p_agent_slug, acr.context_type
  FROM agent_channel_routing acr
  WHERE acr.agent_slug = p_agent_slug
  ON CONFLICT (church_id, agent_slug) DO NOTHING;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  v_routing_created := v_rows > 0;

  RETURN jsonb_build_object(
    'ok',              true,
    'grant_id',        v_grant_id,
    'config_created',  v_config_created,
    'routing_created', v_routing_created
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_grant_agent(uuid, text, text, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_grant_agent(uuid, text, text, integer, text, text) TO authenticated;

-- =====================================================
-- BACKFILL: corrigir grants ativos sem church_agent_config
-- =====================================================
INSERT INTO public.church_agent_config (church_id, agent_slug)
SELECT ag.church_id, ag.agent_slug
FROM public.agent_grants ag
LEFT JOIN public.church_agent_config cac
  ON ag.church_id = cac.church_id AND ag.agent_slug = cac.agent_slug
WHERE ag.active = true
  AND cac.church_id IS NULL
ON CONFLICT (church_id, agent_slug) DO NOTHING;

-- BACKFILL: corrigir grants ativos sem routing (apenas agentes em agent_channel_routing)
INSERT INTO public.church_agent_channel_routing (church_id, agent_slug, context_type)
SELECT ag.church_id, ag.agent_slug, acr.context_type
FROM public.agent_grants ag
JOIN public.agent_channel_routing acr ON ag.agent_slug = acr.agent_slug
LEFT JOIN public.church_agent_channel_routing cacr
  ON ag.church_id = cacr.church_id AND ag.agent_slug = cacr.agent_slug
WHERE ag.active = true
  AND cacr.church_id IS NULL
ON CONFLICT (church_id, agent_slug) DO NOTHING;
