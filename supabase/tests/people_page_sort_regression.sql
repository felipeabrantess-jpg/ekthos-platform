-- ============================================================
-- Regressão — item 23 da ata IGV: ordenação das colunas em Pessoas (migration 20261010160000).
-- BEGIN … ROLLBACK, sobre a base real da IGV (leitura). Compara a função ANTERIOR com a nova na mesma
-- transação: sem ordenação, o resultado é idêntico; com ordenação, a ordem é a pedida e estável.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '30s';
SET LOCAL statement_timeout = '170s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _old (k text, h text, total bigint, ids uuid[]) ON COMMIT DROP;
CREATE TEMP TABLE _tm (k text, ms numeric) ON COMMIT DROP;
GRANT ALL ON _r, _old, _tm TO authenticated, anon;

CREATE FUNCTION pg_temp.login(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', p_church))::text, true)
$$;

-- ANTES: função atual (17 parâmetros), vários filtros, ordem padrão
SELECT pg_temp.login('5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', '6c127559-874a-4748-8fce-55d4079613a5');
SET LOCAL ROLE authenticated;
INSERT INTO _old
SELECT f.k, md5(string_agg(md5(g.row_data::text), '' ORDER BY g.ord)), max(g.total_count), array_agg((g.row_data->>'id')::uuid ORDER BY g.ord)
FROM (VALUES ('todos', NULL, NULL, NULL), ('qr_code', NULL, 'qr_code', NULL), ('nao_atendida', 'nao_atendida', NULL, NULL), ('visitor', NULL, NULL, 'visitor')) f(k, st, src, cls)
CROSS JOIN LATERAL (SELECT row_number() OVER () AS ord, x.row_data, x.total_count
                    FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, f.st, NULL, NULL, f.src, NULL, NULL, NULL, 200, 0, NULL, NULL, NULL, NULL, NULL, f.cls, NULL) x) g
GROUP BY f.k;
RESET ROLE;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

SELECT pg_temp.login('5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', '6c127559-874a-4748-8fce-55d4079613a5');
SET LOCAL ROLE authenticated;

-- 1. sem ordenação: resultado idêntico (linha a linha, total e ordem) à função anterior
INSERT INTO _r
SELECT 1, 'sem ordenação "' || o.k || '": idêntico à função anterior (200 linhas, ordem e total)',
  o.h = (SELECT md5(string_agg(md5(g.row_data::text), '' ORDER BY g.ord))
         FROM (SELECT row_number() OVER () AS ord, x.row_data
               FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid,
                     CASE o.k WHEN 'nao_atendida' THEN 'nao_atendida' END, NULL, NULL,
                     CASE o.k WHEN 'qr_code' THEN 'qr_code' END, NULL, NULL, NULL, 200, 0, NULL, NULL, NULL, NULL, NULL,
                     CASE o.k WHEN 'visitor' THEN 'visitor' END, NULL) x) g)
  AND o.total = (SELECT max(total_count) FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid,
                     CASE o.k WHEN 'nao_atendida' THEN 'nao_atendida' END, NULL, NULL,
                     CASE o.k WHEN 'qr_code' THEN 'qr_code' END, NULL, NULL, NULL, 200, 0, NULL, NULL, NULL, NULL, NULL,
                     CASE o.k WHEN 'visitor' THEN 'visitor' END, NULL)),
  'total=' || o.total
FROM _old o;

-- 2. ordenações pedidas: ordem correta (independente) + estável + total preservado
CREATE TEMP TABLE _full (k text, ids uuid[], total bigint) ON COMMIT DROP;
GRANT ALL ON _full TO authenticated;
DO $$
DECLARE k text; d text; t0 timestamptz; rows_ jsonb; ids uuid[]; tot bigint; expected uuid[]; n int := 0;
BEGIN
  FOREACH k IN ARRAY ARRAY['nome', 'telefone', 'atendimento', 'contatos', 'cadastro'] LOOP
    FOREACH d IN ARRAY ARRAY['asc', 'desc'] LOOP
      t0 := clock_timestamp();
      SELECT array_agg((x.row_data->>'id')::uuid ORDER BY x.o), max(x.total_count)
        INTO ids, tot
      FROM (SELECT row_number() OVER () AS o, g.row_data, g.total_count
            FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_unit_id => 'dcf2852d-e790-46dc-b66b-e8f74977a706', p_limit => 100000, p_sort_by => k, p_sort_dir => d) g) x;
      INSERT INTO _full VALUES (k || ' ' || d, ids, tot);
    END LOOP;
  END LOOP;
END $$;

-- universo independente da ordenação: mesmo conjunto em todas as ordens
INSERT INTO _r
SELECT 2, 'todas as 10 ordenações devolvem o MESMO universo (' || max(total) || ' pessoas da unidade Itaipu) sem perder nem duplicar ninguém',
  count(DISTINCT total) = 1 AND bool_and(cardinality(ids) = total) AND bool_and((SELECT count(DISTINCT i) FROM unnest(ids) i) = total), NULL
FROM _full;

-- ordem de cada chave (calculada de forma independente a partir dos dados)
INSERT INTO _r
SELECT 3, 'ordenar por Nome ' || d || ': name_sort na direção pedida, desempate estável',
  f.ids = (SELECT array_agg(p.id ORDER BY
             CASE WHEN d = 'asc' THEN p.name_sort END ASC NULLS LAST, CASE WHEN d = 'desc' THEN p.name_sort END DESC NULLS LAST,
             p.created_at DESC, p.id DESC) FROM people p WHERE p.id = ANY (f.ids)), NULL
FROM _full f CROSS JOIN LATERAL (SELECT split_part(f.k, ' ', 2) AS d) x WHERE f.k LIKE 'nome %';

INSERT INTO _r
SELECT 4, 'ordenar por Telefone ' || d || ': phone_normalized na direção pedida',
  f.ids = (SELECT array_agg(p.id ORDER BY
             CASE WHEN d = 'asc' THEN p.phone_normalized END ASC NULLS LAST, CASE WHEN d = 'desc' THEN p.phone_normalized END DESC NULLS LAST,
             p.created_at DESC, p.id DESC) FROM people p WHERE p.id = ANY (f.ids)), NULL
FROM _full f CROSS JOIN LATERAL (SELECT split_part(f.k, ' ', 2) AS d) x WHERE f.k LIKE 'telefone %';

INSERT INTO _r
SELECT 5, 'ordenar por Cadastro ' || d || ': created_at na direção pedida',
  f.ids = (SELECT array_agg(p.id ORDER BY
             CASE WHEN d = 'asc' THEN p.created_at END ASC NULLS LAST, CASE WHEN d = 'desc' THEN p.created_at END DESC NULLS LAST,
             p.created_at DESC, p.id DESC) FROM people p WHERE p.id = ANY (f.ids)), NULL
FROM _full f CROSS JOIN LATERAL (SELECT split_part(f.k, ' ', 2) AS d) x WHERE f.k LIKE 'cadastro %';

INSERT INTO _r
SELECT 6, 'ordenar por Atendimento ' || d || ': person_care_state na direção pedida',
  f.ids = (SELECT array_agg(p.id ORDER BY
             CASE WHEN d = 'asc' THEN person_care_state(p.id) END ASC NULLS LAST, CASE WHEN d = 'desc' THEN person_care_state(p.id) END DESC NULLS LAST,
             p.created_at DESC, p.id DESC) FROM people p WHERE p.id = ANY (f.ids)), NULL
FROM _full f CROSS JOIN LATERAL (SELECT split_part(f.k, ' ', 2) AS d) x WHERE f.k LIKE 'atendimento %';

INSERT INTO _r
SELECT 8, 'ordenar por Contatos ' || d || ': nº de contatos pastorais na direção pedida',
  f.ids = (SELECT array_agg(p.id ORDER BY
             CASE WHEN d = 'asc' THEN c.n END ASC NULLS LAST, CASE WHEN d = 'desc' THEN c.n END DESC NULLS LAST,
             p.created_at DESC, p.id DESC)
           FROM people p
           LEFT JOIN LATERAL (SELECT count(*) AS n FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id
                              WHERE pj.person_id = p.id AND je.event_type = 'pastoral_contact') c ON true
           WHERE p.id = ANY (f.ids)), NULL
FROM _full f CROSS JOIN LATERAL (SELECT split_part(f.k, ' ', 2) AS d) x WHERE f.k LIKE 'contatos %';

-- 9. paginação consistente com a ordenação
DO $$
DECLARE p1 uuid[]; p2 uuid[]; full_ uuid[];
BEGIN
  SELECT ids INTO full_ FROM _full WHERE k = 'nome asc';
  SELECT array_agg((g.row_data->>'id')::uuid ORDER BY g.o) INTO p1 FROM (SELECT row_number() OVER () o, x.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_unit_id => 'dcf2852d-e790-46dc-b66b-e8f74977a706', p_limit => 50, p_offset => 0, p_sort_by => 'nome', p_sort_dir => 'asc') x) g;
  SELECT array_agg((g.row_data->>'id')::uuid ORDER BY g.o) INTO p2 FROM (SELECT row_number() OVER () o, x.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_unit_id => 'dcf2852d-e790-46dc-b66b-e8f74977a706', p_limit => 50, p_offset => 50, p_sort_by => 'nome', p_sort_dir => 'asc') x) g;
  INSERT INTO _r VALUES (9, 'paginação: página 1 + página 2 = primeiras 100 da lista ordenada, sem repetição',
    (p1 || p2) = full_[1:100] AND NOT (p1 && p2), cardinality(p1) || '+' || cardinality(p2));
END $$;

-- 10. valores inválidos são ignorados; desc/asc maiúsculo funciona
DO $$
DECLARE a text; b text; c text;
BEGIN
  SELECT md5(string_agg(md5(x.row_data::text), '' ORDER BY x.o)) INTO a FROM (SELECT row_number() OVER () o, g.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_limit => 60) g) x;
  SELECT md5(string_agg(md5(x.row_data::text), '' ORDER BY x.o)) INTO b FROM (SELECT row_number() OVER () o, g.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_limit => 60, p_sort_by => 'name; DROP TABLE people', p_sort_dir => 'desc') g) x;
  SELECT md5(string_agg(md5(x.row_data::text), '' ORDER BY x.o)) INTO c FROM (SELECT row_number() OVER () o, g.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_limit => 60, p_sort_by => 'cadastro', p_sort_dir => 'DESC') g) x;
  INSERT INTO _r VALUES (10, 'p_sort_by inválido (inclusive injeção) é ignorado: ordem padrão intacta', a = b, NULL);
  INSERT INTO _r VALUES (11, 'cadastro DESC (maiúsculo) = ordem padrão (created_at DESC)', a = c, NULL);
  SELECT md5(string_agg(md5(x.row_data::text), '' ORDER BY x.o)) INTO c FROM (SELECT row_number() OVER () o, g.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_limit => 60, p_sort_by => 'classificacao', p_sort_dir => 'asc') g) x;
  INSERT INTO _r VALUES (7, 'classificação não é ordenável (ignorada → ordem padrão, sem custo extra); segue filtrável', a = c, NULL);
END $$;

-- 12. aniversariantes continuam ordenados por dia/nome, ignorando p_sort_by
DO $$
DECLARE a text; b text;
BEGIN
  SELECT md5(string_agg(md5(x.row_data::text), '' ORDER BY x.o)) INTO a FROM (SELECT row_number() OVER () o, g.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_birth_month => 7, p_limit => 500) g) x;
  SELECT md5(string_agg(md5(x.row_data::text), '' ORDER BY x.o)) INTO b FROM (SELECT row_number() OVER () o, g.* FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_birth_month => 7, p_limit => 500, p_sort_by => 'nome', p_sort_dir => 'desc') g) x;
  INSERT INTO _r VALUES (12, 'aba Aniversários: ordem por dia/nome preservada mesmo com p_sort_by', a = b, NULL);
END $$;

-- 13. desempenho na BASE INTEIRA (página 1 de 50; limite do papel authenticated = 8 s)
DO $$
DECLARE k text; t0 timestamptz; n int;
BEGIN
  FOREACH k IN ARRAY ARRAY['nome', 'telefone', 'cadastro', 'atendimento', 'contatos'] LOOP
    t0 := clock_timestamp();
    SELECT count(*) INTO n FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_limit => 50, p_sort_by => k, p_sort_dir => 'desc');
    INSERT INTO _r VALUES (13, 'desempenho "' || k || '" na base inteira (5.454, página 1): < 6 s',
      extract(milliseconds FROM clock_timestamp() - t0) < 6000 AND n = 50, round(extract(milliseconds FROM clock_timestamp() - t0)) || ' ms');
  END LOOP;
END $$;

-- 14. isolamento e ACL
RESET ROLE;
SELECT pg_temp.login('5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', '184fd750-4354-4c31-9018-64bc3605eca3');
SET LOCAL ROLE authenticated;
DO $$ DECLARE r text; BEGIN
  BEGIN PERFORM * FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_sort_by => 'nome'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (14, 'admin atuando em outra igreja não lista pessoas da IGV (com ordenação)', r <> 'ACEITO', r);
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE r text; BEGIN
  BEGIN PERFORM * FROM get_people_page('6c127559-874a-4748-8fce-55d4079613a5'::uuid); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (15, 'anon não executa get_people_page', r = '42501', r);
END $$;
RESET ROLE;
INSERT INTO _r SELECT 16, 'ACL: authenticated e service_role executam; apenas 1 sobrecarga de get_people_page existe',
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AND has_function_privilege('service_role', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
  AND (SELECT count(*) FROM pg_proc WHERE proname = 'get_people_page' AND pronamespace = 'public'::regnamespace) = 1, NULL
FROM pg_proc p WHERE p.proname = 'get_people_page' AND p.pronamespace = 'public'::regnamespace;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
