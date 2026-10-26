-- ============================================================
-- Regressão — Filtro Contato (migration 20261027100000)
-- Roda inteira numa transação e TERMINA COM EXCEÇÃO PROPOSITAL: tudo é desfeito (nada persiste),
-- e o resultado volta na mensagem de erro "RESULTADO:[...]". Nenhum dado é escrito.
-- Executa as funções como o admin da IGV (role authenticated + JWT), igual ao navegador.
-- Uso: node supabase/tests/run-regression.mjs (injeta a migration no ponto marcado)
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '240s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _antes (k text PRIMARY KEY, v text) ON COMMIT DROP;
GRANT ALL ON _r, _antes TO authenticated;

-- total exportado (todas as páginas) para um filtro — mesmo laço do navegador
CREATE FUNCTION pg_temp.csv_total(p_status text, p_source text, p_contact text, p_com_contato boolean) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE r jsonb; ac timestamptz; ai uuid; tot int := 0;
BEGIN
  LOOP
    IF p_com_contato THEN
      r := export_people_rows_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_care_status => p_status, p_source => p_source,
                                   p_after_created_at => ac, p_after_id => ai, p_limit => 2000, p_contact => p_contact);
    ELSE
      r := export_people_rows_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_care_status => p_status, p_source => p_source,
                                   p_after_created_at => ac, p_after_id => ai, p_limit => 2000);
    END IF;
    tot := tot + (r ->> 'count')::int;
    EXIT WHEN NOT (r ->> 'has_more')::boolean;
    ac := (r ->> 'next_after_created_at')::timestamptz; ai := (r ->> 'next_after_id')::uuid;
  END LOOP;
  RETURN tot;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.csv_total(text, text, text, boolean) TO authenticated;

SELECT set_config('request.jwt.claims', json_build_object('sub', '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', 'role', 'authenticated',
  'app_metadata', json_build_object('church_id', '6c127559-874a-4748-8fce-55d4079613a5'))::text, true);

-- ── ANTES (definições atuais) ───────────────────────────────
SET LOCAL ROLE authenticated;
INSERT INTO _antes VALUES
  ('page_total',   (SELECT total_count::text FROM get_people_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_limit => 1) LIMIT 1)),
  ('page_nao',     (SELECT total_count::text FROM get_people_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_care_status => 'nao_atendida', p_limit => 1) LIMIT 1)),
  ('page_alerta',  (SELECT total_count::text FROM get_people_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_care_status => 'sem_contato_48h', p_limit => 1) LIMIT 1)),
  ('counts',       (SELECT get_care_status_counts(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5')::text)),
  ('counts_qr',    (SELECT get_care_status_counts(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_source => 'qr_code')::text)),
  ('csv_total',    (SELECT pg_temp.csv_total(NULL, NULL, NULL, false)::text)),
  ('csv_qr',       (SELECT pg_temp.csv_total(NULL, 'qr_code', NULL, false)::text)),
  ('sort_contatos',(SELECT string_agg(row_data ->> 'id', ',') FROM get_people_page(p_church_id => '6c127559-874a-4748-8fce-55d4079613a5', p_sort_by => 'contatos', p_sort_dir => 'desc', p_limit => 20)));
RESET ROLE;

-- ── MIGRATION (injetada aqui pelo executor) ─────────────────
--@@MIGRATION@@

-- ── DEPOIS ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  c  constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  a  jsonb; b jsonb; t_all int; t_com int; t_sem int; t_real int; csv_com int; csv_sem int; esperado_com int; nn int;
  cnt_com jsonb; cnt_sem jsonb; amostra_com int; amostra_sem int;
BEGIN
  -- 1. sem p_contact: tudo idêntico ao antes
  INSERT INTO _r SELECT 1, 'lista sem filtro idêntica', (SELECT total_count::text FROM get_people_page(p_church_id => c, p_limit => 1) LIMIT 1) = (SELECT v FROM _antes WHERE k = 'page_total'), (SELECT v FROM _antes WHERE k = 'page_total');
  INSERT INTO _r SELECT 2, 'lista "Não atendida" idêntica', (SELECT total_count::text FROM get_people_page(p_church_id => c, p_care_status => 'nao_atendida', p_limit => 1) LIMIT 1) = (SELECT v FROM _antes WHERE k = 'page_nao'), NULL;
  INSERT INTO _r SELECT 3, 'lista alerta +48h idêntica', (SELECT total_count::text FROM get_people_page(p_church_id => c, p_care_status => 'sem_contato_48h', p_limit => 1) LIMIT 1) = (SELECT v FROM _antes WHERE k = 'page_alerta'), NULL;
  INSERT INTO _r SELECT 4, 'contadores idênticos', get_care_status_counts(p_church_id => c)::text = (SELECT v FROM _antes WHERE k = 'counts'), NULL;
  INSERT INTO _r SELECT 5, 'contadores QR idênticos', get_care_status_counts(p_church_id => c, p_source => 'qr_code')::text = (SELECT v FROM _antes WHERE k = 'counts_qr'), NULL;
  INSERT INTO _r SELECT 6, 'CSV total idêntico', pg_temp.csv_total(NULL, NULL, NULL, false)::text = (SELECT v FROM _antes WHERE k = 'csv_total'), (SELECT v FROM _antes WHERE k = 'csv_total');
  INSERT INTO _r SELECT 7, 'CSV QR idêntico', pg_temp.csv_total(NULL, 'qr_code', NULL, false)::text = (SELECT v FROM _antes WHERE k = 'csv_qr'), NULL;
  INSERT INTO _r SELECT 8, 'ordenação por Contatos idêntica', (SELECT string_agg(row_data ->> 'id', ',') FROM get_people_page(p_church_id => c, p_sort_by => 'contatos', p_sort_dir => 'desc', p_limit => 20)) = (SELECT v FROM _antes WHERE k = 'sort_contatos'), NULL;

  -- 2. filtro Contato
  t_all  := (SELECT total_count FROM get_people_page(p_church_id => c, p_limit => 1) LIMIT 1);
  t_com  := COALESCE((SELECT total_count FROM get_people_page(p_church_id => c, p_contact => 'com_contato', p_limit => 1) LIMIT 1), 0);
  t_sem  := COALESCE((SELECT total_count FROM get_people_page(p_church_id => c, p_contact => 'sem_contato', p_limit => 1) LIMIT 1), 0);
  t_real := COALESCE((SELECT total_count FROM get_people_page(p_church_id => c, p_contact => 'contato_realizado', p_limit => 1) LIMIT 1), 0);
  INSERT INTO _r VALUES (9, 'com contato + sem contato = total da lista', t_com + t_sem = t_all AND t_com > 0 AND t_sem > 0, format('%s + %s = %s', t_com, t_sem, t_all));
  INSERT INTO _r VALUES (10, 'contato realizado ⊆ com contato', t_real > 0 AND t_real <= t_com, format('realizado %s de %s', t_real, t_com));

  -- 3. conferência independente (SQL direto, sem as funções) do "com contato"
  RESET ROLE;
  esperado_com := (SELECT count(*) FROM people_filter_base(c) b WHERE EXISTS (
    SELECT 1 FROM person_journey pj JOIN journey_events je ON je.journey_id = pj.id WHERE pj.person_id = b.id AND je.event_type = 'pastoral_contact'));
  SET LOCAL ROLE authenticated;
  INSERT INTO _r VALUES (11, '"com contato" confere com contagem direta de tentativas reais', esperado_com = t_com, format('%s × %s', esperado_com, t_com));

  -- 4. amostras: toda pessoa listada em "com contato" tem tentativa; nenhuma em "sem contato" tem
  RESET ROLE;
  amostra_com := (SELECT count(*) FROM (SELECT (row_data ->> 'id')::uuid id FROM get_people_page(p_church_id => c, p_contact => 'com_contato', p_limit => 500)) s
                  WHERE NOT EXISTS (SELECT 1 FROM person_journey pj JOIN journey_events je ON je.journey_id = pj.id WHERE pj.person_id = s.id AND je.event_type = 'pastoral_contact'));
  SET LOCAL ROLE authenticated;
  INSERT INTO _r VALUES (12, 'nenhuma pessoa sem tentativa em "com contato"', amostra_com = 0, amostra_com::text);

  -- 5. contadores, lista e CSV no mesmo universo com o filtro
  cnt_com := get_care_status_counts(p_church_id => c, p_contact => 'com_contato');
  cnt_sem := get_care_status_counts(p_church_id => c, p_contact => 'sem_contato');
  csv_com := pg_temp.csv_total(NULL, NULL, 'com_contato', true);
  csv_sem := pg_temp.csv_total(NULL, NULL, 'sem_contato', true);
  INSERT INTO _r VALUES (13, 'contadores (total) = lista, com o filtro', (cnt_com ->> 'total')::int = t_com AND (cnt_sem ->> 'total')::int = t_sem, format('%s/%s × %s/%s', cnt_com ->> 'total', cnt_sem ->> 'total', t_com, t_sem));
  INSERT INTO _r VALUES (14, 'CSV = lista, com o filtro', csv_com = t_com AND csv_sem = t_sem, format('%s/%s', csv_com, csv_sem));
  nn := COALESCE((SELECT total_count FROM get_people_page(p_church_id => c, p_care_status => 'nao_atendida', p_contact => 'com_contato', p_limit => 1) LIMIT 1), 0);
  INSERT INTO _r VALUES (15, 'STATUS + Contato: lista "Não atendida com contato" = contador', nn = (cnt_com ->> 'nao_atendida')::int, format('%s × %s', nn, cnt_com ->> 'nao_atendida'));
  INSERT INTO _r VALUES (16, 'valor inválido de p_contact não vaza ninguém (lista vazia)',
    NOT EXISTS (SELECT 1 FROM get_people_page(p_church_id => c, p_contact => 'xpto', p_limit => 1)), 'lista vazia esperada para valor inválido');

  -- 6. isolamento: admin da IGV continua sem acesso a outra igreja
  BEGIN
    PERFORM get_people_page(p_church_id => (SELECT id FROM churches WHERE id <> c ORDER BY created_at LIMIT 1), p_contact => 'com_contato', p_limit => 1);
    INSERT INTO _r VALUES (17, 'isolamento: outra igreja continua bloqueada', false, 'não bloqueou');
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO _r VALUES (17, 'isolamento: outra igreja continua bloqueada', SQLERRM ILIKE '%FORBIDDEN%' OR SQLSTATE = '42501', SQLERRM);
  END;
END $$;
RESET ROLE;

-- 7. permissões das funções novas
INSERT INTO _r SELECT 18, 'people_filter_base fechada para anon/authenticated',
  NOT has_function_privilege('authenticated', 'people_filter_base(uuid,text,text,text,text,uuid,integer,date,date,date,date,text,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'people_filter_base(uuid,text,text,text,text,uuid,integer,date,date,date,date,text,text,text,text)', 'EXECUTE'), NULL;
INSERT INTO _r SELECT 19, 'funções da tela: authenticated sim, anon não',
  has_function_privilege('authenticated', 'get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'export_people_rows_page(uuid,text,text,text,text,text,date,date,date,date,text,uuid,integer,text,text,timestamptz,uuid,integer,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'get_care_status_counts(uuid,text,text,text,text,uuid,integer,date,date,date,date,text,text,text,text)', 'EXECUTE'), NULL;
INSERT INTO _r SELECT 20, 'assinaturas antigas removidas (sem ambiguidade)',
  (SELECT count(*) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('people_filter_base','get_people_page','get_care_status_counts','export_people_rows','export_people_rows_page')) = 5, NULL;

-- fim: exceção proposital desfaz TUDO e devolve o resultado
DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n) FROM _r); END $$;
