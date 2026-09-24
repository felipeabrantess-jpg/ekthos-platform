-- Teste de regressão — BUSCA NORMALIZADA server-side (caixa / acento / cedilha / espaços)
-- Somente leitura, em transação com ROLLBACK. JWT simulado de admin da IGV.
-- Predicados EXATAMENTE como o frontend envia após a padronização:
--   Líderes / Voluntários / Cuidado→Pessoas : people.name_sort ILIKE '%' || normalizado || '%'
--   Conversas                               : people.contact_name_sort ILIKE '%' || normalizado || '%'
--   (normalizado = extensions.unaccent(lower(trim(termo))), o mesmo que normalizeSearch no cliente)
-- Regressão das buscas já corretas: get_people_page(p_search), get_discipulado_stage_people(p_search), PersonSelect (name_sort).

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"6c127559-874a-4748-8fce-55d4079613a5","role":"admin"}}', true);
CREATE TEMP TABLE t (seq serial, cenario text, resultado text, ok boolean) ON COMMIT DROP;

DO $$
DECLARE
  c_igv constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
  grp text[]; v text; n_ref bigint; n bigint; all_equal boolean; v_variants text[][] := ARRAY[
    ARRAY['Fernanda','fernanda','FERNANDA',' Fernanda ','fErNaNdA'],
    ARRAY['João','joao','JOAO','JOÃO',' joão '],
    ARRAY['Conceição','conceicao','CONCEICAO','CONCEIÇÃO','  conceição  ']];
  norm text;
BEGIN
  FOR i IN 1..3 LOOP
    -- ── name_sort (Líderes, Voluntários ×2, Cuidado→Pessoas) ──────────────
    all_equal := true; n_ref := NULL; v := '';
    FOR j IN 1..5 LOOP
      norm := extensions.unaccent(lower(trim(v_variants[i][j])));
      SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND left_at IS NULL AND name_sort ILIKE '%' || norm || '%';
      IF n_ref IS NULL THEN n_ref := n; END IF;
      all_equal := all_equal AND (n = n_ref);
      v := v || v_variants[i][j] || '=' || n || ' ';
    END LOOP;
    INSERT INTO t(cenario, resultado, ok) VALUES ('name_sort (Líderes/Voluntários/Cuidado): ' || v_variants[i][1] || ' e variantes → mesmo total', trim(v), all_equal AND n_ref > 0);

    -- ── contact_name_sort (Conversas) ─────────────────────────────────────
    all_equal := true; n_ref := NULL; v := '';
    FOR j IN 1..5 LOOP
      norm := extensions.unaccent(lower(trim(v_variants[i][j])));
      SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND contact_name_sort ILIKE '%' || norm || '%';
      IF n_ref IS NULL THEN n_ref := n; END IF;
      all_equal := all_equal AND (n = n_ref);
      v := v || v_variants[i][j] || '=' || n || ' ';
    END LOOP;
    INSERT INTO t(cenario, resultado, ok) VALUES ('contact_name_sort (Conversas): ' || v_variants[i][1] || ' e variantes → mesmo total', trim(v), all_equal AND n_ref > 0);

    -- ── regressão: RPCs já corretas continuam iguais entre variantes ──────
    all_equal := true; n_ref := NULL; v := '';
    FOR j IN 1..5 LOOP
      SELECT total_count INTO n FROM get_people_page(p_church_id => c_igv, p_search => v_variants[i][j], p_limit => 1) LIMIT 1;
      IF n_ref IS NULL THEN n_ref := n; END IF;
      all_equal := all_equal AND (n = n_ref);
      v := v || v_variants[i][j] || '=' || COALESCE(n, 0) || ' ';
    END LOOP;
    INSERT INTO t(cenario, resultado, ok) VALUES ('regressão Pessoas (get_people_page p_search): ' || v_variants[i][1], trim(v), all_equal AND n_ref > 0);
  END LOOP;

  -- ── Conversas: contatos SEM name (só first/last) passam a ser encontrados ──
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND name IS NULL AND first_name IS NOT NULL;
  SELECT COUNT(*) INTO n_ref FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND name IS NULL AND first_name IS NOT NULL AND contact_name_sort IS NOT NULL;
  INSERT INTO t(cenario, resultado, ok) VALUES ('Conversas: contatos sem name (first/last) têm contact_name_sort', n || ' contatos, ' || n_ref || ' com coluna preenchida', n = n_ref AND n > 0);
  -- exemplo concreto: primeiro contato sem name; busca pelo first_name em CAIXA ALTA com acento removido
  SELECT first_name INTO v FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND name IS NULL AND first_name IS NOT NULL ORDER BY created_at LIMIT 1;
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND contact_name_sort ILIKE '%' || extensions.unaccent(lower(trim(upper(v)))) || '%';
  INSERT INTO t(cenario, resultado, ok) VALUES ('Conversas: buscar "' || upper(v) || '" (contato sem name) encontra', n::text, n >= 1);
  -- nome completo "first last" também encontra
  SELECT COUNT(*) INTO n FROM people p WHERE church_id = c_igv AND deleted_at IS NULL AND name IS NULL AND first_name IS NOT NULL AND last_name IS NOT NULL
    AND contact_name_sort ILIKE '%' || extensions.unaccent(lower(trim(first_name || ' ' || last_name))) || '%';
  SELECT COUNT(*) INTO n_ref FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND name IS NULL AND first_name IS NOT NULL AND last_name IS NOT NULL;
  INSERT INTO t(cenario, resultado, ok) VALUES ('Conversas: nome completo "first last" encontra todos os contatos sem name', n || ' de ' || n_ref, n = n_ref);
  -- onde name existe, contact_name_sort == name_sort (semântica preservada)
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND name IS NOT NULL AND name <> '' AND contact_name_sort IS DISTINCT FROM name_sort;
  INSERT INTO t(cenario, resultado, ok) VALUES ('contact_name_sort == name_sort quando name existe', n || ' divergentes', n = 0);

  -- ── regressão PersonSelect / Ministérios / Células / Gabinete (name_sort direto) e Discipulado ──
  SELECT COUNT(*) INTO n FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND left_at IS NULL AND name_sort ILIKE '%' || extensions.unaccent(lower('CONCEIÇÃO')) || '%';
  SELECT COUNT(*) INTO n_ref FROM people WHERE church_id = c_igv AND deleted_at IS NULL AND left_at IS NULL AND name_sort ILIKE '%conceicao%';
  INSERT INTO t(cenario, resultado, ok) VALUES ('regressão PersonSelect (name_sort): CONCEIÇÃO = conceicao', n || ' = ' || n_ref, n = n_ref AND n > 0);
  SELECT COUNT(*) INTO n FROM get_discipulado_stage_people(c_igv, (SELECT id FROM pipeline_stages WHERE church_id = c_igv AND is_active ORDER BY order_index LIMIT 1), 500, 0, 'JOÃO', NULL);
  SELECT COUNT(*) INTO n_ref FROM get_discipulado_stage_people(c_igv, (SELECT id FROM pipeline_stages WHERE church_id = c_igv AND is_active ORDER BY order_index LIMIT 1), 500, 0, 'joao', NULL);
  INSERT INTO t(cenario, resultado, ok) VALUES ('regressão Discipulado (p_search): JOÃO = joao', n || ' = ' || n_ref, n = n_ref);
END $$;

SELECT seq, cenario, resultado, CASE WHEN ok THEN 'OK' ELSE 'FALHOU' END status FROM t ORDER BY seq;
ROLLBACK;
