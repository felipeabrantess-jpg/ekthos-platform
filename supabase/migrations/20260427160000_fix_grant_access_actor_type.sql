-- =============================================================
-- Migration: fix_grant_access_actor_type
-- Data: 2026-04-27
-- Problema: grant_access() inseria actor_type='user' em audit_logs,
--           mas o CHECK só aceita: agent|human|system|webhook
-- Correção: 'user' → 'human' (admin humano que concede o acesso)
-- Impacto: Caminho B (cockpit_manual) e qualquer chamada futura
--          de grant_access com p_granted_by != NULL
-- =============================================================

CREATE OR REPLACE FUNCTION public.grant_access(
  p_church_id        uuid,
  p_plan_slug        text,
  p_grant_type       character varying,
  p_source           character varying,
  p_subscription_id  uuid                     DEFAULT NULL,
  p_starts_at        timestamp with time zone DEFAULT now(),
  p_ends_at          timestamp with time zone DEFAULT NULL,
  p_granted_reason   character varying        DEFAULT NULL,
  p_notes            text                     DEFAULT NULL,
  p_granted_by       uuid                     DEFAULT NULL,
  p_affiliate_id     uuid                     DEFAULT NULL,
  p_converts_to_paid boolean                  DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_grant_id uuid;
BEGIN
  INSERT INTO public.access_grants (
    church_id, plan_slug, grant_type, source,
    subscription_id, starts_at, ends_at,
    granted_by, granted_reason, notes,
    affiliate_id, converts_to_paid
  )
  VALUES (
    p_church_id, p_plan_slug, p_grant_type, p_source,
    p_subscription_id, p_starts_at, p_ends_at,
    p_granted_by, p_granted_reason, p_notes,
    p_affiliate_id, p_converts_to_paid
  )
  RETURNING id INTO v_grant_id;

  INSERT INTO public.audit_logs (
    church_id, entity_type, entity_id, action,
    actor_type, actor_id, payload
  )
  VALUES (
    p_church_id,
    'access_grant',
    v_grant_id,
    'created',
    -- FIX: era 'user' (inválido); CHECK aceita: agent|human|system|webhook
    CASE WHEN p_granted_by IS NULL THEN 'system' ELSE 'human' END,
    COALESCE(p_granted_by::text, 'system'),
    jsonb_build_object(
      'grant_type',       p_grant_type,
      'source',           p_source,
      'plan_slug',        p_plan_slug,
      'subscription_id',  p_subscription_id,
      'starts_at',        p_starts_at,
      'ends_at',          p_ends_at,
      'granted_reason',   p_granted_reason,
      'affiliate_id',     p_affiliate_id,
      'converts_to_paid', p_converts_to_paid
    )
  );

  RETURN v_grant_id;
END;
$$;
