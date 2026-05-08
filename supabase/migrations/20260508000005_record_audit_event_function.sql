-- supabase/migrations/20260508000005_record_audit_event_function.sql
-- Frente 4A: função centralizadora de auditoria. Chamada via supabase.rpc()
-- por todas as EFs admin (service_role bypassa RLS, GRANT não é necessário
-- mas está incluído para documentação de intenção).
-- NÃO lança exceção — engole erro com WARNING para nunca bloquear ação principal.

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
  p_source                   text     DEFAULT 'cockpit'
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
    impersonation_session_id,  impersonated_church_id,  source
  ) VALUES (
    p_church_id,    p_admin_user_id,          p_action,
    p_before,       p_after,                  p_reason,
    p_actor_email,  p_actor_roles,            p_resource,
    p_resource_id,  p_status,                 p_error_msg,
    p_impersonation_session_id, p_impersonated_church_id, p_source
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia a ação principal — resolve OPS-DEBT-014
  RAISE WARNING '[record_audit_event] falha: % — action=%, church=%',
    SQLERRM, p_action, p_church_id;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_audit_event TO service_role;
