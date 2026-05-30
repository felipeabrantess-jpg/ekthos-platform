-- Migration: revoke EXECUTE from anon/PUBLIC on sensitive RPCs
-- Applied: 2026-05-30 (SA-B1 MEGA-ONDA SEGURANÇA AMPLA)
--
-- Diagnóstico SA-B1 (pre-migration):
--   60 RPCs tinham EXECUTE concedido para anon ou PUBLIC
--   21 mantidos como KEEP-ANON (funções legítimas para uso não-autenticado)
--   39 revogados (funções que nunca deveriam ser acessíveis sem auth)
--
-- KEEP-ANON (21 funções — mantidas com acesso anon):
--   capture_visitor_to_pipeline, increment_qr_scanned_count, validate_session_token,
--   trigger_n8n_pipeline, auth_church_id, auth_user_role, auth_can_financial,
--   auth_can_all_people, set_updated_at, set_updated_at_generic,
--   trg_regenerate_event_occurrences, sync_is_volunteer_flag, fn_distressed_alert,
--   prevent_immutable_coupon_changes, queue_coupon_sync,
--   moddatetime (extensão), uuid_generate_v4 (extensão), gen_random_uuid (extensão)
--
-- REVOKED (39 funções):
--   Operacionais internas (exigem auth service_role ou JWT válido):
--   activate_agent, apply_credit_topup, apply_discipleship_template, cancel_agent,
--   check_credit_thresholds, church_has_access, count_remaining_admins,
--   create_default_messaging_config, create_default_pipeline_stages, debit_agent_credits,
--   generate_event_occurrences, grant_access, has_ekthos_role, is_ekthos_admin,
--   _is_ekthos_admin, list_church_channels, list_church_whatsapp_channels,
--   list_pending_activations, pause_agent, pause_agents_at_zero,
--   process_invoice_payment_failed, process_stripe_checkout_completed,
--   process_subscription_deleted, process_subscription_updated, record_audit_event,
--   reengajamento_scan_disparar, renew_agent_credit_cycles, reset_church_agent_config,
--   resolve_notification, start_agent_setup, upsert_church_agent_config,
--   upsert_church_agent_config_admin, upsert_church_cadastro_cristalino,
--   upsert_church_channel, upsert_church_followup_config_admin,
--   upsert_church_onboarding_pastoral, upsert_church_whatsapp_channel,
--   upsert_session_token, get_agent_prompt_resolved
--
-- Risco: BAIXO — funções chamadas apenas por Edge Functions (service_role) ou usuários autenticados
-- Prova empírica: curl anon → 403 forbidden em todas as 39 funções após apply

REVOKE EXECUTE ON FUNCTION public.activate_agent(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_credit_topup(uuid, text, integer, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_discipleship_template(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_agent(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_credit_thresholds(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.church_has_access(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.count_remaining_admins(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_messaging_config(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_default_pipeline_stages(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.debit_agent_credits(uuid, text, integer, text, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_event_occurrences(uuid, date, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.grant_access(uuid, uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_ekthos_role(text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_ekthos_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._is_ekthos_admin() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_church_channels(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_church_whatsapp_channels(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_pending_activations() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pause_agent(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pause_agents_at_zero() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_invoice_payment_failed(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_stripe_checkout_completed(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_subscription_deleted(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_subscription_updated(jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_audit_event(uuid, uuid, text, jsonb, jsonb, text, text, text[], text, uuid, text, text, uuid, uuid, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reengajamento_scan_disparar() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.renew_agent_credit_cycles() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_church_agent_config(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_notification(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_agent_setup(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_agent_config(uuid, text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_agent_config_admin(uuid, text, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_cadastro_cristalino(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_channel(uuid, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_followup_config_admin(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_onboarding_pastoral(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_church_whatsapp_channel(uuid, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.upsert_session_token(uuid, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_agent_prompt_resolved(uuid, text) FROM anon, PUBLIC;

-- Audit log
INSERT INTO public.audit_logs (action, entity_type, payload, actor_type, tokens_used)
VALUES (
  'security_revoke_anon_rpcs_bulk',
  'pg_proc',
  jsonb_build_object(
    'revoked_count', 39,
    'kept_anon_count', 21,
    'reason', 'SA-B1 MEGA-ONDA SEGURANÇA — revogar acesso anon a RPCs sensíveis',
    'migration', '20260530070000_security_revoke_anon_rpcs_bulk'
  ),
  'system',
  0
)
ON CONFLICT DO NOTHING;
