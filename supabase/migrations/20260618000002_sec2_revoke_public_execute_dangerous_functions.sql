-- SEC-2: Revogar EXECUTE FROM PUBLIC nas funções administrativas/operacionais
-- expostas desnecessariamente via REST sem autenticação.
--
-- Contexto: por padrão, Postgres concede EXECUTE TO PUBLIC em novas funções.
-- 'anon' herda esse grant de PUBLIC — REVOKE FROM anon é no-op.
-- Solução: REVOKE FROM PUBLIC. Os grants explícitos de 'authenticated' e
-- 'service_role' (presentes no ACL de cada função) são preservados automaticamente.
--
-- Funções NÃO tocadas (espinha dorsal do RLS multi-tenant):
--   auth_church_id, auth_user_role, auth_can_financial, auth_can_all_people
-- Trigger functions INCERTAS NÃO tocadas (auditoria dedicada futura):
--   trigger_n8n_pipeline, award_volunteer_service_points, fn_distressed_alert,
--   sync_is_volunteer_flag, sync_last_attendance_from_escala, trg_regenerate_event_occurrences

REVOKE EXECUTE ON FUNCTION public.volunteer_reengajamento_scan(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_agent_acolhimento_dashboard(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_church_consumo_summary(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_top_volunteers(uuid, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_volunteer_attendance_stats(uuid, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_volunteer_month_count(uuid, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_volunteer_service_history(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_blast_failed(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_blast_sent(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_course_enrolled(uuid) FROM PUBLIC;
