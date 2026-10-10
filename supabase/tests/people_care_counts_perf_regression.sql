-- ============================================================
-- people_care_counts_perf_regression.sql
-- Valida 20261010120000_people_care_counts_performance.sql
--
-- BEGIN … ROLLBACK, backend real (IGV). A migration é injetada na linha marcada.
-- Provas: (1) person_care_rows == person_care_state()/person_care_alert() para TODAS as pessoas;
-- (2) get_care_status_counts == contagem por pessoa; (3) get_people_page(sem_contato_48h) == universo do alerta;
-- (4) tempos < 3 s (limite do papel authenticated = 8 s); (5) person_care_rows não é chamável por anon/authenticated.
-- Saída: JSONB {falhas, total, resultados[]}. Esperado: falhas = 0.
-- ============================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
SET LOCAL statement_timeout = '175s';
CREATE TEMP TABLE t_out(k text, ok boolean, info text);

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

DO $$
DECLARE ch constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  n int; bad_s int; bad_a int; t0 timestamptz; ms numeric; c jsonb; tot bigint; expected_alert int; page_total bigint;
BEGIN
  -- 1. equivalência linha a linha
  SELECT count(*) INTO n FROM person_care_rows(ch);
  SELECT count(*) INTO bad_s FROM person_care_rows(ch) r WHERE r.care_state IS DISTINCT FROM person_care_state(r.person_id);
  SELECT count(*) INTO bad_a FROM person_care_rows(ch) r WHERE r.care_alert IS DISTINCT FROM person_care_alert(r.person_id);
  INSERT INTO t_out VALUES ('person_care_rows: estado de ' || n || ' pessoas = person_care_state()', bad_s = 0, 'divergentes=' || bad_s);
  INSERT INTO t_out VALUES ('person_care_rows: alerta de ' || n || ' pessoas = person_care_alert()', bad_a = 0, 'divergentes=' || bad_a);
  -- 2. contadores = agregação por pessoa, em todos os escopos de unidade, e com tempo < 3 s
  FOR n IN 1..4 LOOP
    DECLARE u text := (ARRAY[NULL,'none','dcf2852d-e790-46dc-b66b-e8f74977a706','c90fde1a-2a81-42cd-9769-f1b85a05dc2f'])[n]; cs jsonb; ref jsonb;
    BEGIN
      t0 := clock_timestamp(); cs := get_care_status_counts(p_church_id => ch, p_unit_id => u); ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
      SELECT jsonb_build_object(
        'nao_atendida',   count(*) FILTER (WHERE person_care_state(b.id) = 'nao_atendida'),
        'em_atendimento', count(*) FILTER (WHERE person_care_state(b.id) = 'em_atendimento'),
        'atendida',       count(*) FILTER (WHERE person_care_state(b.id) = 'atendida'),
        'cancelado',      count(*) FILTER (WHERE person_care_state(b.id) = 'cancelado'),
        'total',          count(*),
        'sem_contato_48h', count(*) FILTER (WHERE person_care_alert(b.id))) INTO ref
      FROM people_filter_base(ch, u, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL) b;
      INSERT INTO t_out VALUES ('contadores unidade=' || coalesce(left(u, 8), 'todas') || ' = contagem por pessoa e < 3 s',
        (cs - 'alert_threshold_hours') = ref AND ms < 3000, ms || ' ms ' || (cs->>'total'));
    END;
  END LOOP;
  -- 3. lista "Sem contato +48h" = universo do alerta (total e primeira página)
  SELECT (get_care_status_counts(p_church_id => ch)->>'sem_contato_48h')::int INTO expected_alert;
  t0 := clock_timestamp();
  SELECT max(total_count) INTO page_total FROM get_people_page(p_church_id => ch, p_care_status => 'sem_contato_48h', p_limit => 50, p_offset => 0);
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  INSERT INTO t_out VALUES ('lista Sem contato +48h: total = contador (' || expected_alert || ') e < 3 s', page_total = expected_alert AND ms < 3000, page_total || ' / ' || ms || ' ms');
  INSERT INTO t_out VALUES ('lista Sem contato +48h: todos os itens da página têm care_alert = true',
    NOT EXISTS (SELECT 1 FROM get_people_page(p_church_id => ch, p_care_status => 'sem_contato_48h', p_limit => 50, p_offset => 0) g WHERE (g.row_data->>'care_alert')::boolean IS DISTINCT FROM true), '');
  -- 4. estados continuam como antes (ramo não alterado)
  SELECT max(total_count) INTO page_total FROM get_people_page(p_church_id => ch, p_care_status => 'nao_atendida', p_limit => 50, p_offset => 0);
  INSERT INTO t_out VALUES ('lista Não atendida: total = contador', page_total = (get_care_status_counts(p_church_id => ch)->>'nao_atendida')::int, page_total::text);
END $$;

-- 5. person_care_rows é interna: anon/authenticated não podem chamá-la (devolve dados da igreja informada)
INSERT INTO t_out SELECT 'person_care_rows não executável por anon/authenticated/PUBLIC',
  NOT has_function_privilege('anon', 'public.person_care_rows(uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.person_care_rows(uuid)', 'EXECUTE'), '';
-- 6. isolamento: admin de outra igreja não lê contadores da IGV
DO $$ BEGIN
  PERFORM set_config('request.jwt.claims', '{"sub":"579d0f7b-9b8b-4c20-94c5-513b4a424642","role":"authenticated","app_metadata":{"church_id":"62e473b8-cd39-4da2-aa5d-c296b03d6873","role":"admin"}}', true);
  PERFORM get_care_status_counts(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5');
  INSERT INTO t_out VALUES ('outra igreja não lê contadores da IGV', false, 'PERMITIDO');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_out VALUES ('outra igreja não lê contadores da IGV', SQLERRM LIKE '%FORBIDDEN%', SQLERRM);
END $$;

SELECT jsonb_build_object(
  'falhas', (SELECT count(*) FROM t_out WHERE NOT ok),
  'total',  (SELECT count(*) FROM t_out),
  'resultados', (SELECT jsonb_agg(jsonb_build_object('k', k, 'ok', ok, 'info', info)) FROM t_out)
) AS r;
ROLLBACK;
