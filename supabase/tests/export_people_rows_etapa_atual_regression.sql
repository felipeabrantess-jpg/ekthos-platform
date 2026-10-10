-- ============================================================
-- Regressão — item 18 da ata IGV: CSV com "Etapa desde" e "Dias na etapa"
-- (migration 20261010140000). Roda em BEGIN … ROLLBACK; não escreve nada.
-- Compara a função ANTERIOR com a nova, na mesma transação, sobre a base real da IGV:
--   * tudo que existia continua idêntico (hash por linha, total, max_contacts, ordem);
--   * os dois campos novos refletem exatamente person_pipeline.entered_at (nada inventado);
--   * tempo de execução registrado antes/depois.
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _b (k text, j jsonb, ms numeric) ON COMMIT DROP;
CREATE TEMP TABLE _a (k text, j jsonb, ms numeric) ON COMMIT DROP;
GRANT ALL ON _r, _b, _a TO authenticated;

CREATE FUNCTION pg_temp.login(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', p_church))::text, true)
$$;

-- ANTES (função atual)
SELECT pg_temp.login('5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', '6c127559-874a-4748-8fce-55d4079613a5');
SET LOCAL ROLE authenticated;
DO $$
DECLARE t0 timestamptz; j jsonb;
BEGIN
  t0 := clock_timestamp(); j := export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid);
  INSERT INTO _b VALUES ('todos', j, extract(milliseconds FROM clock_timestamp() - t0));
  t0 := clock_timestamp(); j := export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_care_status => 'nao_atendida');
  INSERT INTO _b VALUES ('nao_atendida', j, extract(milliseconds FROM clock_timestamp() - t0));
  t0 := clock_timestamp(); j := export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_source => 'qr_code');
  INSERT INTO _b VALUES ('qr_code', j, extract(milliseconds FROM clock_timestamp() - t0));
END $$;
RESET ROLE;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- DEPOIS (função nova)
SELECT pg_temp.login('5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349', '6c127559-874a-4748-8fce-55d4079613a5');
SET LOCAL ROLE authenticated;
DO $$
DECLARE t0 timestamptz; j jsonb;
BEGIN
  t0 := clock_timestamp(); j := export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid);
  INSERT INTO _a VALUES ('todos', j, extract(milliseconds FROM clock_timestamp() - t0));
  t0 := clock_timestamp(); j := export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_care_status => 'nao_atendida');
  INSERT INTO _a VALUES ('nao_atendida', j, extract(milliseconds FROM clock_timestamp() - t0));
  t0 := clock_timestamp(); j := export_people_rows('6c127559-874a-4748-8fce-55d4079613a5'::uuid, p_source => 'qr_code');
  INSERT INTO _a VALUES ('qr_code', j, extract(milliseconds FROM clock_timestamp() - t0));
END $$;
RESET ROLE;

-- 1. mesmo universo, mesma ordem e mesmo conteúdo anterior (linha a linha) em cada filtro
INSERT INTO _r
SELECT 1, 'filtro "' || b.k || '": total, max_contacts, limiar e linhas anteriores idênticos',
  (b.j->>'total') = (a.j->>'total') AND (b.j->>'max_contacts') = (a.j->>'max_contacts')
  AND (b.j->>'alert_threshold_hours') = (a.j->>'alert_threshold_hours')
  AND (SELECT md5(string_agg(md5((x - 'etapa_desde' - 'dias_na_etapa')::text), '' ORDER BY ord)) FROM jsonb_array_elements(b.j->'rows') WITH ORDINALITY t(x, ord))
    = (SELECT md5(string_agg(md5((x - 'etapa_desde' - 'dias_na_etapa')::text), '' ORDER BY ord)) FROM jsonb_array_elements(a.j->'rows') WITH ORDINALITY t(x, ord)),
  'total=' || (a.j->>'total')
FROM _b b JOIN _a a USING (k);

-- 2. campos novos presentes em todas as linhas (NULL quando não há registro)
INSERT INTO _r
SELECT 2, 'todas as linhas têm os campos etapa_desde e dias_na_etapa',
  (SELECT bool_and(x ? 'etapa_desde' AND x ? 'dias_na_etapa') FROM jsonb_array_elements(a.j->'rows') x), NULL
FROM _a a WHERE k = 'todos';

-- 3. valores exatamente iguais a person_pipeline.entered_at
INSERT INTO _r
SELECT 3, 'etapa_desde == person_pipeline.entered_at; sem registro → NULL (nada inventado)',
  NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(a.j->'rows') x
    LEFT JOIN person_pipeline pp ON pp.person_id = (x->>'id')::uuid AND pp.church_id = '6c127559-874a-4748-8fce-55d4079613a5'
    WHERE (x->>'etapa_desde') IS DISTINCT FROM (to_jsonb(pp.entered_at) #>> '{}')
       OR ((x->>'etapa_desde') IS NULL AND (x->>'dias_na_etapa') IS NOT NULL)
  ),
  (SELECT count(*) FILTER (WHERE x->>'etapa_desde' IS NOT NULL) || ' com etapa de ' || count(*) FROM jsonb_array_elements(a.j->'rows') x)
FROM _a a WHERE k = 'todos';

-- 4. dias = dias corridos desde a entrada
INSERT INTO _r
SELECT 4, 'dias_na_etapa == hoje − data de entrada (nunca negativo)',
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.j->'rows') x
              WHERE (x->>'etapa_desde') IS NOT NULL
                AND (x->>'dias_na_etapa')::int IS DISTINCT FROM GREATEST(0, CURRENT_DATE - (x->>'etapa_desde')::timestamptz::date)), NULL
FROM _a a WHERE k = 'todos';

-- 5. a etapa mostrada e a data vêm da mesma linha (etapa preenchida ⇔ etapa_desde preenchida)
INSERT INTO _r
SELECT 5, 'quem tem etapa tem "Etapa desde"; quem não tem etapa não tem',
  NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.j->'rows') x WHERE (x->>'etapa' IS NULL) <> (x->>'etapa_desde' IS NULL)),
  (SELECT count(*)::text || ' divergências' FROM jsonb_array_elements(a.j->'rows') x WHERE (x->>'etapa' IS NULL) <> (x->>'etapa_desde' IS NULL))
FROM _a a WHERE k = 'todos';

-- 6. desempenho: registra antes/depois e exige folga do limite de 8 s do papel authenticated
INSERT INTO _r
SELECT 6, 'desempenho "' || b.k || '": depois < 4 s e sem piora relevante (> 1,5× + 300 ms)',
  a.ms < 4000 AND a.ms <= b.ms * 1.5 + 300, round(b.ms) || ' ms → ' || round(a.ms) || ' ms'
FROM _b b JOIN _a a USING (k);

-- 7. ACL e assinatura preservadas
INSERT INTO _r SELECT 7, 'ACL inalterada: authenticated executa, anon não',
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND p.prosecdef, NULL
FROM pg_proc p WHERE p.proname = 'export_people_rows' AND p.pronamespace = 'public'::regnamespace;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
