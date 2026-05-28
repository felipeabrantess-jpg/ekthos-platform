-- supabase/migrations/20260508000005_record_audit_event_function.sql
-- Frente 4A: função centralizadora de auditoria. Chamada via supabase.rpc()
-- por todas as EFs admin (service_role bypassa RLS).
-- NÃO lança exceção — engole erro com WARNING para nunca bloquear ação principal.
-- p_request_id: capturado do header x-request-id e propagado ao audit.

DROP FUNCTION IF EXISTS public.record_audit_event(
  uuid, uuid, text, jsonb, jsonb, text, text, text[], text, uuid, text, text, uuid, uuid, text
);

CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_church_id                uuid,
  p_admin_user_id            uuid,
  p_action                   text,
  p_before                   jsonb    DEFAULT NULL,
  p_after                    jsonb    DEFAULT NULL,
  p_reason                   text     DEFAULT NULL,
  p_actor_email              text     DEFAULT NULL,
  p_actor_roles              text[]   DEFAULT NULL,
  p_resource                 text     DEFAULT NULL,
  p_resource_id              uuid     DEFAULT NULL,
  p_status                   text     DEFAULT 'success',
  p_error_msg                text     DEFAULT NULL,
  p_impersonation_session_id uuid     DEFAULT NULL,
  p_impersonated_church_id   uuid     DEFAULT NULL,
  p_source                   text     DEFAULT 'cockpit',
  p_request_id               text     DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.admin_events (
    church_id,      admin_user_id,            action,
    before,         after,                    reason,
    actor_email,    actor_roles,              resource,
    resource_id,    status,                   error_msg,
    impersonation_session_id,  impersonated_church_id,  source,
    request_id
  ) VALUES (
    p_church_id,    p_admin_user_id,          p_action,
    p_before,       p_after,                  p_reason,
    p_actor_email,  p_actor_roles,            p_resource,
    p_resource_id,  p_status,                 p_error_msg,
    p_impersonation_session_id, p_impersonated_church_id, p_source,
    p_request_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[record_audit_event] falha: % — action=%, church=%',
    SQLERRM, p_action, p_church_id;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_audit_event TO service_role;
