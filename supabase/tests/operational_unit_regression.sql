-- Teste de regressão — UNIDADE OPERACIONAL (rodar contra o banco: psql ou Management API)
-- Falha (RAISE) se alguém voltar a usar people.unit_id bruto nas RPCs ou reintroduzir
-- um interruptor opcional de corte.
--
-- Casos com dados reais (IGV) usam apenas COUNTs; nada é escrito.
-- Desde o hotfix de tenant (ETAPA 1) as RPCs exigem JWT da igreja: simulamos um usuário da IGV.

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);


DO $$
DECLARE
  v_cid uuid := '6c127559-874a-4748-8fce-55d4079613a5';   -- IGV
  v_cut date;
  v_todas int; v_soma int; v_none int; v_pre_com_unit_em_unidade int;
  v_page int; v_badge int; v_dash int;
  r record;
BEGIN
  -- 1. Nenhuma RPC de pessoas pode ter parâmetro opcional de corte
  FOR r IN SELECT proname, pg_get_function_identity_arguments(oid) a FROM pg_proc
           WHERE pronamespace='public'::regnamespace
             AND proname IN ('get_people_page','get_people_stage_counts','get_care_status_counts',
                             'get_dashboard_people_stats','get_discipulado_overview','get_discipulado_stage_people')
  LOOP
    IF position('p_apply_cutoff' IN r.a) > 0 THEN
      RAISE EXCEPTION 'REGRESSÃO: % voltou a ter p_apply_cutoff', r.proname;
    END IF;
  END LOOP;

  -- 2. Toda RPC que filtra pessoas por unidade usa o predicado central
  FOR r IN SELECT proname, pg_get_functiondef(oid) d FROM pg_proc
           WHERE pronamespace='public'::regnamespace
             AND proname IN ('get_people_page','get_people_stage_counts','get_care_status_counts',
                             'get_dashboard_people_stats','get_discipulado_overview','get_discipulado_stage_people','get_unit_counts')
  LOOP
    IF position('people_unit_scope_ok' IN r.d) = 0 AND position('people_operational_unit' IN r.d) = 0 THEN
      RAISE EXCEPTION 'REGRESSÃO: % não usa a regra central de unidade operacional', r.proname;
    END IF;
    IF position(', NULL, p_unit_id)' IN r.d) > 0 THEN
      RAISE EXCEPTION 'REGRESSÃO: % ignora o corte da igreja (passa NULL)', r.proname;
    END IF;
  END LOOP;

  -- 3. Semântica com a IGV (só se o corte estiver configurado)
  v_cut := church_unit_cutoff(v_cid);
  IF v_cut IS NOT NULL THEN
    -- "Todas" = soma das unidades + sem unidade (o corte não remove ninguém de Todas)
    SELECT (get_people_stage_counts(v_cid, NULL)->>'total')::int INTO v_todas;
    SELECT (get_people_stage_counts(v_cid, 'none')->>'total')::int INTO v_none;
    SELECT COALESCE(SUM((get_people_stage_counts(v_cid, u.id::text)->>'total')::int), 0) INTO v_soma
      FROM church_units u WHERE u.church_id = v_cid AND u.is_active;
    IF v_todas <> v_soma + v_none THEN
      RAISE EXCEPTION 'REGRESSÃO: Todas (%) <> unidades (%) + sem unidade (%)', v_todas, v_soma, v_none;
    END IF;

    -- Nenhuma pessoa pré-corte pode aparecer no escopo de uma unidade
    SELECT COUNT(*) INTO v_pre_com_unit_em_unidade
    FROM people p JOIN church_units u ON u.id = p.unit_id
    WHERE p.church_id = v_cid AND p.deleted_at IS NULL AND p.left_at IS NULL
      AND p.created_at::date < v_cut
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cut, u.id::text);
    IF v_pre_com_unit_em_unidade > 0 THEN
      RAISE EXCEPTION 'REGRESSÃO: % pessoas pré-corte contadas na unidade histórica', v_pre_com_unit_em_unidade;
    END IF;

    -- Pessoas = Dashboard = badge para Todas
    SELECT total_count INTO v_page FROM get_people_page(p_church_id => v_cid, p_limit => 1) LIMIT 1;
    SELECT (get_dashboard_people_stats(v_cid, NULL)->>'total')::int INTO v_dash;
    IF v_page IS DISTINCT FROM v_todas OR v_dash IS DISTINCT FROM v_todas THEN
      RAISE EXCEPTION 'REGRESSÃO: lista % / badge % / dashboard % divergem', v_page, v_todas, v_dash;
    END IF;
  END IF;

  RAISE NOTICE 'operational_unit_regression: OK';
END $$;
ROLLBACK;
