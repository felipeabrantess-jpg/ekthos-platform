-- Teste de regressão — TENANT ESCAPE em RPCs SECURITY DEFINER
-- Simula JWTs via request.jwt.claims. Somente leitura (transação com ROLLBACK).
-- Igreja A = "Minha Fé" (5156cc30…), Igreja B = IGV (6c127559…).

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{"church_id":"5156cc30-6d76-4487-99ba-fff8013b38d4","role":"admin"}}', true);

DO $$
DECLARE
  v_igv uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  v_ok  int := 0;
  v_calls text[] := ARRAY[
    'SELECT * FROM get_people_page(p_church_id => $1, p_limit => 1)',
    'SELECT get_people_stage_counts($1, NULL)',
    'SELECT get_care_status_counts($1, NULL)',
    'SELECT get_dashboard_people_stats($1, NULL)',
    'SELECT get_people_counts($1)',
    'SELECT * FROM get_unit_counts($1)',
    'SELECT * FROM get_contact_counts($1, ARRAY[]::uuid[])',
    'SELECT * FROM get_top_volunteers($1, 5, 30)',
    'SELECT * FROM get_volunteer_attendance_stats($1)',
    'SELECT get_agent_reengajamento_dashboard($1)',
    'SELECT church_unit_cutoff($1)',
    'SELECT upsert_session_token($1)',
    'SELECT * FROM get_discipulado_overview($1, 30, NULL)'
  ];
  c text;
BEGIN
  FOREACH c IN ARRAY v_calls LOOP
    BEGIN
      EXECUTE c USING v_igv;
      RAISE EXCEPTION 'TENANT ESCAPE ABERTO: % (igreja A leu/escreveu na IGV)', c;
    EXCEPTION
      WHEN insufficient_privilege OR raise_exception THEN
        IF SQLERRM NOT ILIKE '%FORBIDDEN%' THEN RAISE; END IF;
        v_ok := v_ok + 1;
    END;
  END LOOP;
  RAISE NOTICE 'tenant_escape: % chamadas bloqueadas com FORBIDDEN', v_ok;
END $$;

-- Escritas sensíveis não podem ser executáveis por authenticated
DO $$
BEGIN
  IF has_function_privilege('authenticated', 'capture_visitor_to_pipeline(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'increment_qr_scanned_count(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'record_audit_event(uuid,uuid,text,jsonb,jsonb,text,text,text[],text,uuid,text,text,uuid,uuid,text,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'REGRESSÃO: função de escrita executável por authenticated'; END IF;
  IF NOT has_function_privilege('service_role', 'capture_visitor_to_pipeline(uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'increment_qr_scanned_count(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'record_audit_event(uuid,uuid,text,jsonb,jsonb,text,text,text[],text,uuid,text,text,uuid,uuid,text,text)', 'EXECUTE')
  THEN RAISE EXCEPTION 'REGRESSÃO: service_role perdeu EXECUTE nas funções de escrita'; END IF;
END $$;
ROLLBACK;

-- Usuário legítimo da IGV continua funcionando (números de referência)
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
SELECT
  (SELECT total_count FROM get_people_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_limit => 1) LIMIT 1) AS pessoas_todas,
  (get_people_stage_counts('6c127559-874a-4748-8fce-55d4079613a5', 'dcf2852d-e790-46dc-b66b-e8f74977a706')->>'total')::int AS badge_itaipu,
  (get_dashboard_people_stats('6c127559-874a-4748-8fce-55d4079613a5', 'none')->>'total')::int AS dashboard_sem_unidade,
  (SELECT COUNT(*) FROM get_unit_counts('6c127559-874a-4748-8fce-55d4079613a5')) AS unit_counts_linhas,
  (SELECT COUNT(*) FROM get_discipulado_overview('6c127559-874a-4748-8fce-55d4079613a5', 30, NULL)) AS discipulado_etapas,
  (SELECT COUNT(*) FROM church_units WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5') AS rls_units;
ROLLBACK;
