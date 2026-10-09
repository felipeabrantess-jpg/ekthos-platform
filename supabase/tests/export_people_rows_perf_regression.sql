-- ============================================================
-- export_people_rows_perf_regression.sql
-- Valida 20261010110000_export_people_rows_performance.sql (ata IGV 05/10 — item 21)
--
-- Roda INTEIRO em BEGIN … ROLLBACK, com backend real (igreja IGV) e claims do admin.
-- A migration é injetada na linha marcada, dentro desta mesma transação.
-- Limite real do papel authenticated = 8 s (statement_timeout): cada exportação é cronometrada e deve
-- ficar abaixo disso. Sem a correção o filtro "Não atendida" leva ≈ 106 s e este teste FALHA.
--
-- Saída: JSONB {falhas, total, resultados[]}. Esperado: falhas = 0.
-- ============================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
SET LOCAL statement_timeout = '175s';  -- só protege o gateway; o limite de 8 s é verificado por medição (ms < 8000) em cada exportação

CREATE TEMP TABLE t_out(k text, ok boolean, info text);

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- Testes de equivalência e desempenho por estado (limite de 8 s por exportação, como em produção)
DO $$
DECLARE
  ch constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  s text; t0 timestamptz; ms numeric; e jsonb; oracle jsonb; esperado int; linhas int; erro text;
BEGIN
  FOREACH s IN ARRAY ARRAY['todos','nao_atendida','em_atendimento','atendida','cancelado','sem_contato_48h'] LOOP
    oracle := get_care_status_counts(p_church_id => ch);
    esperado := CASE s WHEN 'todos' THEN (oracle->>'total')::int
                       WHEN 'sem_contato_48h' THEN (oracle->>'sem_contato_48h')::int
                       ELSE (oracle->>s)::int END;
    t0 := clock_timestamp(); erro := NULL;
    BEGIN
      e := export_people_rows(p_church_id => ch, p_care_status => NULLIF(s, 'todos'));
    EXCEPTION WHEN OTHERS THEN erro := SQLERRM; e := NULL;
    END;
    ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    linhas := CASE WHEN e IS NULL THEN -1 ELSE jsonb_array_length(e->'rows') END;
    INSERT INTO t_out VALUES ('estado ' || s || ': exporta sem erro/timeout em < 8 s', erro IS NULL AND ms < 8000, coalesce(erro, ms || ' ms'));
    INSERT INTO t_out VALUES ('estado ' || s || ': total e linhas = contador da tela (' || esperado || ')', e IS NOT NULL AND (e->>'total')::int = esperado AND linhas = esperado, 'total=' || coalesce(e->>'total','-') || ' linhas=' || linhas);
  END LOOP;
END $$;

-- Linha a linha: estado e alerta idênticos às funções canônicas (base da regra de negócio)
DO $$
DECLARE ch constant uuid := '6c127559-874a-4748-8fce-55d4079613a5'; e jsonb; bad_state int; bad_alert int; n int;
BEGIN
  e := export_people_rows(p_church_id => ch);
  SELECT count(*) INTO n FROM jsonb_array_elements(e->'rows');
  SELECT count(*) INTO bad_state FROM jsonb_array_elements(e->'rows') r WHERE r->>'care_state' IS DISTINCT FROM person_care_state((r->>'id')::uuid);
  SELECT count(*) INTO bad_alert FROM jsonb_array_elements(e->'rows') r WHERE (r->>'care_alert')::boolean IS DISTINCT FROM person_care_alert((r->>'id')::uuid);
  INSERT INTO t_out VALUES ('care_state de ' || n || ' pessoas = person_care_state()', bad_state = 0, 'divergentes=' || bad_state);
  INSERT INTO t_out VALUES ('care_alert de ' || n || ' pessoas = person_care_alert()', bad_alert = 0, 'divergentes=' || bad_alert);
  -- contrato de colunas
  INSERT INTO t_out VALUES ('chaves de topo do JSON preservadas',
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) = ARRAY['alert_threshold_hours','max_contacts','rows','total'], '');
  INSERT INTO t_out VALUES ('chaves de cada linha preservadas (17)',
    (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e->'rows'->0) k) =
      ARRAY['care_alert','care_state','classification','contacts','contacts_count','created_at','email','etapa','first_visit_date','id','ministerios','name','phone','source','unit_id','unit_name','unit_operational_id'], '');
  INSERT INTO t_out VALUES ('ordenação created_at DESC, id DESC preservada',
    NOT EXISTS (SELECT 1 FROM (SELECT (r->>'created_at')::timestamptz c, (r->>'id') i, lag((r->>'created_at')::timestamptz) OVER (ORDER BY ord) pc FROM jsonb_array_elements(e->'rows') WITH ORDINALITY a(r, ord)) x WHERE pc IS NOT NULL AND c > pc), '');
  INSERT INTO t_out VALUES ('histórico de contatos: soma de contacts_count = itens de contacts',
    (SELECT coalesce(sum((r->>'contacts_count')::int),0) FROM jsonb_array_elements(e->'rows') r) = (SELECT coalesce(sum(jsonb_array_length(r->'contacts')),0) FROM jsonb_array_elements(e->'rows') r), '');
  INSERT INTO t_out VALUES ('max_contacts = maior contacts_count',
    (e->>'max_contacts')::int = (SELECT coalesce(max((r->>'contacts_count')::int),0) FROM jsonb_array_elements(e->'rows') r), e->>'max_contacts');
END $$;

-- Combinações de filtros (unidade × classificação × origem × estado) = contadores da tela
DO $$
DECLARE ch constant uuid := '6c127559-874a-4748-8fce-55d4079613a5'; e jsonb; o jsonb; c record; esperado int; t0 timestamptz; ms numeric;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('none','member',NULL,NULL), ('none','none',NULL,'nao_atendida'), ('none','visitor',NULL,'sem_contato_48h'),
      ('dcf2852d-e790-46dc-b66b-e8f74977a706','visitor','qr_code','nao_atendida'),
      ('dcf2852d-e790-46dc-b66b-e8f74977a706','member',NULL,'em_atendimento'),
      ('dcf2852d-e790-46dc-b66b-e8f74977a706',NULL,'qr_code','sem_contato_48h'),
      ('c90fde1a-2a81-42cd-9769-f1b85a05dc2f',NULL,NULL,'nao_atendida')
    ) v(unit, cls, src, st) LOOP
    o := get_care_status_counts(p_church_id => ch, p_unit_id => c.unit, p_classification => c.cls, p_source => c.src);
    esperado := CASE coalesce(c.st,'todos') WHEN 'todos' THEN (o->>'total')::int WHEN 'sem_contato_48h' THEN (o->>'sem_contato_48h')::int ELSE (o->>c.st)::int END;
    t0 := clock_timestamp();
    e := export_people_rows(p_church_id => ch, p_unit_id => c.unit, p_classification => c.cls, p_source => c.src, p_care_status => c.st);
    ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
    INSERT INTO t_out VALUES (format('combinação unidade=%s classif=%s origem=%s estado=%s: CSV = tela (%s)', left(c.unit,8), coalesce(c.cls,'-'), coalesce(c.src,'-'), coalesce(c.st,'todos'), esperado),
      (e->>'total')::int = esperado AND jsonb_array_length(e->'rows') = esperado AND ms < 8000, 'total=' || (e->>'total') || ' ' || ms || ' ms');
  END LOOP;
END $$;

-- Isolamento entre igrejas preservado
DO $$
BEGIN
  PERFORM export_people_rows(p_church_id => '62e473b8-cd39-4da2-aa5d-c296b03d6873');
  INSERT INTO t_out VALUES ('admin da IGV não exporta dados de outra igreja', false, 'PERMITIDO');
EXCEPTION WHEN OTHERS THEN
  INSERT INTO t_out VALUES ('admin da IGV não exporta dados de outra igreja', SQLERRM LIKE '%FORBIDDEN%', SQLERRM);
END $$;

SELECT jsonb_build_object(
  'falhas', (SELECT count(*) FROM t_out WHERE NOT ok),
  'total',  (SELECT count(*) FROM t_out),
  'resultados', (SELECT jsonb_agg(jsonb_build_object('k', k, 'ok', ok, 'info', info)) FROM t_out)
) AS r;
ROLLBACK;
