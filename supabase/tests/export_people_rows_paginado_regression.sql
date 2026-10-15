-- ============================================================
-- export_people_rows_paginado_regression.sql
-- Prova: as páginas de export_people_rows_page, concatenadas, são IDÊNTICAS à exportação inteira
-- (export_people_rows) — linhas, ordem, max_contacts e total — para vários filtros e tamanhos de página.
-- Executar APÓS aplicar 20261015120000_export_people_rows_paginado.sql. Tudo em transação revertida.
-- Falha (RAISE EXCEPTION) se qualquer caso divergir; ao final lança 'OK' com o resumo.
-- ============================================================
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

DO $t$
DECLARE
  v_church uuid := '6c127559-874a-4748-8fce-55d4079613a5';  -- IGV (somente leitura)
  c record; lim int;
  v_full jsonb; pg jsonb; acc jsonb; cur_c timestamptz; cur_i uuid; pages int; maxc int; ok boolean;
  out text := ''; falhas int := 0;
BEGIN
  FOR lim IN SELECT unnest(ARRAY[137, 500, 1000, 2000]) LOOP
    FOR c IN SELECT * FROM (VALUES
      ('todos', ''),
      ('classificação visitor', ', p_classification => ''visitor'''),
      ('estado sem_contato_48h', ', p_care_status => ''sem_contato_48h'''),
      ('estado nao_atendida', ', p_care_status => ''nao_atendida'''),
      ('busca "silva"', ', p_search => ''silva''')
    ) v(label, args) LOOP
      EXECUTE format('select public.export_people_rows(p_church_id => %L::uuid%s)', v_church, c.args) INTO v_full;
      acc := '[]'::jsonb; cur_c := NULL; cur_i := NULL; pages := 0; maxc := 0;
      LOOP
        EXECUTE format('select public.export_people_rows_page(p_church_id => %L::uuid%s, p_after_created_at => %L, p_after_id => %L, p_limit => %s)',
                       v_church, c.args, cur_c, cur_i, lim) INTO pg;
        pages := pages + 1;
        acc := acc || (pg -> 'rows');
        maxc := GREATEST(maxc, (pg ->> 'max_contacts')::int);
        EXIT WHEN NOT (pg ->> 'has_more')::boolean OR pages > 500;
        cur_c := (pg ->> 'next_after_created_at')::timestamptz;
        cur_i := (pg ->> 'next_after_id')::uuid;
      END LOOP;
      ok := (acc = v_full -> 'rows')
            AND maxc = (v_full ->> 'max_contacts')::int
            AND jsonb_array_length(acc) = (v_full ->> 'total')::int;
      IF NOT ok THEN falhas := falhas + 1; END IF;
      out := out || format('[lim %s] %s: total=%s páginas=%s %s%s', lim, c.label, v_full ->> 'total', pages, CASE WHEN ok THEN 'IGUAL' ELSE 'DIVERGE' END, E'\n');
    END LOOP;
  END LOOP;
  IF falhas > 0 THEN RAISE EXCEPTION E'FALHOU (% divergências)\n%', falhas, out; END IF;
  RAISE EXCEPTION E'OK — todas as páginas conferem com a exportação inteira\n%', out;
END $t$;
ROLLBACK;
