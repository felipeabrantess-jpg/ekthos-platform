-- ============================================================
-- Regressão — 1 pessoa = 1 telefone por igreja (migration 20261003100000)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Usa telefones sintéticos (DDD 20, inexistente).
-- Saída: uma linha por verificação (n, teste, ok, info).
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _ctx ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid AS c1,
       (SELECT id FROM churches WHERE id <> '6c127559-874a-4748-8fce-55d4079613a5' ORDER BY created_at LIMIT 1) AS c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid AS admin_igv,
       NULL::uuid AS marcelo, NULL::uuid AS outro, NULL::uuid AS rel_alvo;
GRANT ALL ON _r, _ctx TO authenticated;

-- Fotografia do que já existia (para provar que nada pré-existente muda)
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT md5(string_agg(md5(p::text), '' ORDER BY id)) FROM
          (SELECT id, church_id, name, first_name, last_name, phone, email, observacoes_pastorais, unit_id, name_sort,
                  contact_name_sort, person_stage, deleted_at, left_at FROM people) p) AS people_md5,
       (SELECT count(*) FROM people)                 AS people_n,
       (SELECT count(*) FROM person_journey)         AS journeys,
       (SELECT count(*) FROM journey_events)         AS journey_events,
       (SELECT count(*) FROM journey_events WHERE event_type = 'pastoral_contact') AS contatos,
       (SELECT count(*) FROM ministry_members)       AS ministry_members,
       (SELECT count(*) FROM volunteers)             AS volunteers,
       (SELECT count(*) FROM family_relationships)   AS family,
       (SELECT count(*) FROM audit_logs)             AS audit_n,
       (SELECT count(*) FROM (SELECT 1 FROM people WHERE deleted_at IS NULL AND regexp_replace(coalesce(phone, ''), '\D', '', 'g') <> ''
                               GROUP BY church_id, regexp_replace(regexp_replace(phone, '\D', '', 'g'), '^55(?=\d{10,11}$)', '')
                               HAVING count(*) > 1) g) AS grupos_legados;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- Tenta um INSERT e devolve o resultado como texto
CREATE FUNCTION pg_temp.try_insert(p_church uuid, p_name text, p_phone text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO people (church_id, name, phone, source) VALUES (p_church, p_name, p_phone, 'manual');
  RETURN 'CRIADO';
EXCEPTION WHEN unique_violation THEN
  RETURN 'BLOQUEADO 23505 ' || CASE WHEN SQLERRM LIKE 'PHONE_ALREADY_LINKED%' THEN 'trigger' ELSE 'índice cru' END;
END $$;

-- ── Normalização ─────────────────────────────────────────────
INSERT INTO _r SELECT 0, 'normalização: 5 formatos do ticket → mesma forma canônica',
  count(DISTINCT normalize_phone_br(x)) = 1 AND min(normalize_phone_br(x)) = '21999999999', string_agg(DISTINCT normalize_phone_br(x), ',')
  FROM unnest(ARRAY['+55 (21) 99999-9999','5521999999999','55 21 99999-9999','(21) 99999-9999','21999999999','021 99999-9999']) x;
INSERT INTO _r SELECT 0, 'normalização: não iguala números diferentes (9º dígito, DDD 55, vazio)',
  normalize_phone_br('2199999999') <> normalize_phone_br('21999999999')
  AND normalize_phone_br('(55) 99999-9999') = '55999999999'
  AND normalize_phone_br('+55 55 99999-9999') = '55999999999'
  AND normalize_phone_br('') IS NULL AND normalize_phone_br('abc') IS NULL AND normalize_phone_br(NULL) IS NULL, NULL;

-- ── 1. telefone novo → pessoa criada ─────────────────────────
INSERT INTO _r SELECT 1, 'telefone novo → pessoa criada', r = 'CRIADO', r
  FROM (SELECT pg_temp.try_insert((SELECT c1 FROM _ctx), 'ZZ-TESTE Marcelo', '+5520912345678') r) x;
UPDATE _ctx SET marcelo = (SELECT id FROM people WHERE name = 'ZZ-TESTE Marcelo');
UPDATE people SET observacoes_pastorais = 'Anotação pastoral original', unit_id = (SELECT unit_id FROM people WHERE church_id = (SELECT c1 FROM _ctx) AND unit_id IS NOT NULL LIMIT 1)
 WHERE id = (SELECT marcelo FROM _ctx);
-- vínculos do Marcelo: família
UPDATE _ctx SET rel_alvo = (SELECT id FROM people WHERE church_id = (SELECT c1 FROM _ctx) AND deleted_at IS NULL AND id <> (SELECT marcelo FROM _ctx) ORDER BY created_at LIMIT 1);
INSERT INTO family_relationships (church_id, person_id, related_person_id, relationship_type)
SELECT c1, marcelo, rel_alvo, (SELECT relationship_type FROM family_relationships LIMIT 1) FROM _ctx;

-- ── 2–6. mesmo telefone em outros formatos → bloqueado ───────
INSERT INTO _r
SELECT t.n, t.teste, r LIKE 'BLOQUEADO%', r
FROM (VALUES
  (2, 'mesmo telefone + mesmo formato → bloqueado',            '+5520912345678'),
  (3, 'mesmo telefone com +55 formatado → bloqueado',          '+55 20 91234-5678'),
  (4, 'mesmo telefone com 55 sem + → bloqueado',               '5520912345678'),
  (5, 'mesmo telefone mascarado → bloqueado',                  '(20) 91234-5678'),
  (6, 'espaços/hífens/parênteses, sem DDI → bloqueado',        ' 20 9 1234 - 5678 ')
) AS t(n, teste, phone),
LATERAL (SELECT pg_temp.try_insert((SELECT c1 FROM _ctx), 'ZZ-TESTE João', t.phone) r) x;

-- ── 7. mesmo telefone + nome diferente → cadastro existente preservado ──
INSERT INTO _r SELECT 7, 'nome diferente no mesmo telefone → João não criado, Marcelo intacto',
  (SELECT count(*) FROM people WHERE name = 'ZZ-TESTE João') = 0
  AND (SELECT name = 'ZZ-TESTE Marcelo' AND phone = '+5520912345678' FROM people WHERE id = (SELECT marcelo FROM _ctx)),
  (SELECT count(*)::text || ' registro(s) com o telefone' FROM people WHERE church_id = (SELECT c1 FROM _ctx) AND phone_normalized = '20912345678');

-- ── 8–11. formulários públicos: passos SQL do código novo ────
-- (busca por phone_normalized; no existente grava SOMENTE last_contact_at)
DO $$
DECLARE c uuid := (SELECT c1 FROM _ctx); m uuid := (SELECT marcelo FROM _ctx); x uuid; f record; ok boolean;
BEGIN
  FOR f IN SELECT * FROM (VALUES
      (8,  'QR visitor-capture com telefone existente → não renomeia',      ARRAY['20912345678','2012345678']),  -- variantes 9º dígito
      (9,  'curso IGV (igv-public-enrollment) com telefone existente → não renomeia', ARRAY['20912345678']),
      (10, 'oração IGV (igv-prayer-request) com telefone existente → não renomeia',   ARRAY['20912345678']),
      (11, 'gabinete IGV (igv-cabinet-request, só dígitos) → não renomeia', ARRAY['20912345678'])) v(n, teste, chaves)
  LOOP
    SELECT id INTO x FROM people WHERE church_id = c AND phone_normalized = ANY (f.chaves) AND deleted_at IS NULL ORDER BY created_at LIMIT 1;
    UPDATE people SET last_contact_at = now() WHERE id = x;
    SELECT x = m AND p.name = 'ZZ-TESTE Marcelo' AND p.observacoes_pastorais = 'Anotação pastoral original'
           AND p.phone = '+5520912345678' AND p.last_contact_at IS NOT NULL
      INTO ok FROM people p WHERE p.id = m;
    INSERT INTO _r VALUES (f.n, f.teste, ok, 'achou o cadastro existente: ' || (x = m)::text);
  END LOOP;
END $$;

-- ── 13. edição de telefone para número de outra pessoa → bloqueada ──
SELECT pg_temp.try_insert((SELECT c1 FROM _ctx), 'ZZ-TESTE Outro', '+5520977776666');
UPDATE _ctx SET outro = (SELECT id FROM people WHERE name = 'ZZ-TESTE Outro');
DO $$
DECLARE r text;
BEGIN
  BEGIN
    UPDATE people SET phone = '(20) 91234-5678' WHERE id = (SELECT outro FROM _ctx);
    r := 'ACEITO';
  EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO 23505'; END;
  INSERT INTO _r VALUES (13, 'editar telefone para número de outra pessoa → bloqueado; ninguém muda',
    r LIKE 'BLOQUEADO%' AND (SELECT phone = '+5520977776666' FROM people WHERE id = (SELECT outro FROM _ctx))
    AND (SELECT phone = '+5520912345678' FROM people WHERE id = (SELECT marcelo FROM _ctx)), r);
  -- trocar só o formato do PRÓPRIO telefone continua permitido
  BEGIN
    UPDATE people SET phone = '5520977776666' WHERE id = (SELECT outro FROM _ctx);
    UPDATE people SET phone = '+5520977776666' WHERE id = (SELECT outro FROM _ctx);
    r := 'ACEITO';
  EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (13, 'reformatar o próprio telefone e editar outros campos → permitido', r = 'ACEITO', r);
END $$;

-- 13b. mesma regra pelo caminho real do usuário (role authenticated + RLS)
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT admin_igv FROM _ctx), 'role', 'authenticated',
         'app_metadata', json_build_object('church_id', (SELECT c1 FROM _ctx)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r text; n int;
BEGIN
  BEGIN
    UPDATE people SET phone = '20912345678' WHERE id = (SELECT outro FROM _ctx);
    r := 'ACEITO';
  EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO 23505: ' || SQLERRM; END;
  INSERT INTO _r VALUES (13, 'usuário logado (RLS) editando telefone para o de outra pessoa → bloqueado', r LIKE 'BLOQUEADO%', r);

  -- 12 (lado servidor): PersonModal localiza o dono do telefone, em qualquer formato
  SELECT count(*) INTO n FROM find_person_by_phone('(20) 91234-5678') f WHERE f.id = (SELECT marcelo FROM _ctx) AND f.name = 'ZZ-TESTE Marcelo';
  INSERT INTO _r VALUES (12, 'find_person_by_phone localiza o cadastro existente (usuário logado)', n = 1, NULL);
  SELECT count(*) INTO n FROM find_person_by_phone('+55 20 91234-5678', (SELECT marcelo FROM _ctx));
  INSERT INTO _r VALUES (12, 'find_person_by_phone ignora a própria pessoa em edição', n = 0, NULL);

  -- create_person: telefone duplicado nunca passa, nem com p_allow_duplicate
  INSERT INTO _r SELECT 12, 'create_person bloqueia telefone duplicado mesmo com p_allow_duplicate',
    (j->>'created') = 'false' AND j->>'reason' = 'phone_already_linked' AND j->'duplicates'->0->>'id' = (SELECT marcelo::text FROM _ctx), j->>'reason'
    FROM (SELECT create_person(p_name => 'ZZ-TESTE João', p_phone => '5520912345678', p_allow_duplicate => true) j) x;
  INSERT INTO _r SELECT 1, 'create_person com telefone novo → cria', (j->>'created') = 'true', j->>'reason'
    FROM (SELECT create_person(p_name => 'ZZ-TESTE Novo RPC', p_phone => '(20) 95555-4444') j) x;
END $$;
RESET ROLE;

-- ── 14. duas igrejas com o mesmo telefone → permitido ────────
INSERT INTO _r SELECT 14, 'mesmo telefone em outra igreja → permitido', r = 'CRIADO', r
  FROM (SELECT pg_temp.try_insert((SELECT c2 FROM _ctx), 'ZZ-TESTE Outra Igreja', '+5520912345678') r) x;

-- ── 24. RLS / isolamento de tenant ───────────────────────────
SELECT pg_temp.try_insert((SELECT c2 FROM _ctx), 'ZZ-TESTE Só Igreja 2', '+5520933332222');
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT admin_igv FROM _ctx), 'role', 'authenticated',
         'app_metadata', json_build_object('church_id', (SELECT c1 FROM _ctx)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE n int; r text;
BEGIN
  SELECT count(*) INTO n FROM find_person_by_phone('+5520933332222');
  INSERT INTO _r VALUES (24, 'find_person_by_phone não revela pessoa de outra igreja', n = 0, n::text || ' resultado(s)');
  SELECT count(*) INTO n FROM people WHERE name LIKE 'ZZ-TESTE%Igreja%';
  INSERT INTO _r VALUES (24, 'RLS: usuário da IGV não enxerga pessoas de outra igreja', n = 0, n::text);
  BEGIN
    INSERT INTO people (church_id, name, phone, source) VALUES ((SELECT c2 FROM _ctx), 'ZZ-TESTE Invasor', '+5520900001111', 'manual');
    r := 'ACEITO';
  EXCEPTION WHEN insufficient_privilege THEN r := 'NEGADO pela RLS'; END;
  INSERT INTO _r VALUES (24, 'RLS: usuário da IGV não cria pessoa em outra igreja', r LIKE 'NEGADO%', r);
END $$;
RESET ROLE;

-- ── 15. concorrência: o cadastro toma lock por (igreja, telefone) ──
-- Duas transações simultâneas com o mesmo telefone: a 2ª espera a 1ª e então é bloqueada.
INSERT INTO _r SELECT 15, 'concorrência: advisory lock por (igreja, telefone) mantido até o fim da transação',
  EXISTS (SELECT 1 FROM pg_locks l WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted
            AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended((SELECT c1::text FROM _ctx) || ':20912345678', 8012)),
  'ver phone_unique_concurrency.mjs para o teste com 2 conexões';

-- ── Compatibilidades que precisam continuar funcionando ──────
-- ON CONFLICT (church_id, phone) continua arbitrando pelo índice cru
DO $$
DECLARE n int;
BEGIN
  INSERT INTO people (church_id, phone, source, last_contact_at) VALUES ((SELECT c1 FROM _ctx), '+5520912345678', 'manual', now())
  ON CONFLICT (church_id, phone) WHERE deleted_at IS NULL DO UPDATE SET last_contact_at = EXCLUDED.last_contact_at;
  SELECT count(*) INTO n FROM people WHERE church_id = (SELECT c1 FROM _ctx) AND phone_normalized = '20912345678';
  INSERT INTO _r VALUES (25, 'compat: upsert ON CONFLICT (church_id, phone) continua funcionando sem duplicar', n = 1, n::text);
EXCEPTION WHEN OTHERS THEN
  INSERT INTO _r VALUES (25, 'compat: upsert ON CONFLICT (church_id, phone) continua funcionando sem duplicar', false, SQLERRM);
END $$;

-- exclusão lógica libera o telefone; reativar com telefone já tomado é bloqueado
DO $$
DECLARE r text; r2 text;
BEGIN
  UPDATE people SET deleted_at = now() WHERE id = (SELECT outro FROM _ctx);
  r := pg_temp.try_insert((SELECT c1 FROM _ctx), 'ZZ-TESTE Reuso', '20977776666');
  BEGIN
    UPDATE people SET deleted_at = NULL WHERE id = (SELECT outro FROM _ctx);
    r2 := 'REATIVADO';
  EXCEPTION WHEN unique_violation THEN r2 := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (26, 'excluído libera o telefone; reativação com telefone já tomado é bloqueada', r = 'CRIADO' AND r2 = 'BLOQUEADO', r || ' / ' || r2);
END $$;

-- sem telefone continua permitido (obrigatoriedade NÃO é imposta nesta frente)
INSERT INTO _r SELECT 27, 'pessoa sem telefone continua podendo ser criada (2x)', a = 'CRIADO' AND b = 'CRIADO', a || ' / ' || b
  FROM (SELECT pg_temp.try_insert((SELECT c1 FROM _ctx), 'ZZ-TESTE SemTel 1', NULL) a, pg_temp.try_insert((SELECT c1 FROM _ctx), 'ZZ-TESTE SemTel 2', '') b) x;

-- ── Auditoria de nome/telefone ───────────────────────────────
DO $$
DECLARE a0 int; a1 int;
BEGIN
  SELECT count(*) INTO a0 FROM audit_logs WHERE entity_id = (SELECT marcelo FROM _ctx) AND action IN ('person_name_changed', 'person_phone_changed');
  UPDATE people SET name = 'ZZ-TESTE Marcelo Silva' WHERE id = (SELECT marcelo FROM _ctx);
  UPDATE people SET phone = '+5520912340000' WHERE id = (SELECT marcelo FROM _ctx);
  UPDATE people SET city = 'Niterói' WHERE id = (SELECT marcelo FROM _ctx);            -- não gera auditoria
  UPDATE people SET name = 'ZZ-TESTE Marcelo', phone = '+5520912345678' WHERE id = (SELECT marcelo FROM _ctx);
  SELECT count(*) INTO a1 FROM audit_logs WHERE entity_id = (SELECT marcelo FROM _ctx) AND action IN ('person_name_changed', 'person_phone_changed');
  INSERT INTO _r VALUES (29, 'auditoria: alteração de nome/telefone grava audit_logs (old/new); outros campos não',
    a1 - a0 = 4 AND EXISTS (SELECT 1 FROM audit_logs WHERE entity_id = (SELECT marcelo FROM _ctx) AND action = 'person_name_changed'
                              AND payload->'old'->>'name' = 'ZZ-TESTE Marcelo' AND payload->'new'->>'name' = 'ZZ-TESTE Marcelo Silva'),
    (a1 - a0)::text || ' registros');
END $$;

-- blindada webhook-receiver: exceção temporária mantém o comportamento atual (limitação documentada)
DO $$
DECLARE r text;
BEGIN
  BEGIN
    INSERT INTO people (church_id, first_name, last_name, phone, person_stage, observacoes_pastorais, lgpd_consent)
    VALUES ((SELECT c1 FROM _ctx), 'Contato', '5678', '5520912345678', 'visitante', 'Cadastrado automaticamente via WhatsApp inbound', false);
    r := 'CRIADO (comportamento atual da blindada preservado)';
  EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (28, 'LIMITAÇÃO: INSERT "Contato NNNN" da webhook-receiver (blindada) segue passando', r LIKE 'CRIADO%', r);
END $$;

-- registros legados duplicados continuam editáveis e não foram tocados
DO $$
DECLARE v uuid; r text;
BEGIN
  SELECT p.id INTO v FROM people p
   WHERE p.deleted_at IS NULL AND p.phone_normalized IS NOT NULL
     AND coalesce(p.name, '') NOT LIKE 'ZZ-TESTE%' AND p.phone NOT LIKE '%5520%'
     AND EXISTS (SELECT 1 FROM people q WHERE q.church_id = p.church_id AND q.phone_normalized = p.phone_normalized
                    AND q.id <> p.id AND q.deleted_at IS NULL)
   LIMIT 1;
  IF v IS NULL THEN r := 'sem legado para testar';
  ELSE
    BEGIN
      UPDATE people SET last_contact_at = last_contact_at WHERE id = v;
      UPDATE people SET phone = phone WHERE id = v;
      r := 'EDITÁVEL';
    EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO'; END;
  END IF;
  INSERT INTO _r VALUES (19, 'impacto nos legados: registro duplicado antigo continua editável', r IN ('EDITÁVEL', 'sem legado para testar'), r);
END $$;

-- ── 16–23. o que já existia continua igual ───────────────────
INSERT INTO _r SELECT 16, 'observacoes_pastorais do cadastro existente preservadas',
  observacoes_pastorais = 'Anotação pastoral original', observacoes_pastorais FROM people WHERE id = (SELECT marcelo FROM _ctx);
INSERT INTO _r SELECT 17, 'família/cônjuge: vínculo do cadastro existente preservado',
  (SELECT count(*) FROM family_relationships WHERE person_id = (SELECT marcelo FROM _ctx)) = 1
  AND (SELECT count(*) FROM family_relationships) = s.family + 1, NULL FROM _snap s;
INSERT INTO _r SELECT 18, 'journeys / journey_events inalterados',
  (SELECT count(*) FROM person_journey) = s.journeys AND (SELECT count(*) FROM journey_events) = s.journey_events,
  s.journeys || ' jornadas, ' || s.journey_events || ' eventos' FROM _snap s;
INSERT INTO _r SELECT 19, 'ministry_members inalterado', (SELECT count(*) FROM ministry_members) = s.ministry_members, s.ministry_members::text FROM _snap s;
INSERT INTO _r SELECT 20, 'volunteers inalterado', (SELECT count(*) FROM volunteers) = s.volunteers, s.volunteers::text FROM _snap s;
INSERT INTO _r SELECT 21, 'contatos (pastoral_contact) inalterados',
  (SELECT count(*) FROM journey_events WHERE event_type = 'pastoral_contact') = s.contatos, s.contatos::text FROM _snap s;
INSERT INTO _r SELECT 22, 'unidades + 23 busca normalizada (name_sort/contact_name_sort) + demais dados: registros pré-existentes idênticos',
  (SELECT md5(string_agg(md5(p::text), '' ORDER BY id)) FROM
     (SELECT id, church_id, name, first_name, last_name, phone, email, observacoes_pastorais, unit_id, name_sort,
             contact_name_sort, person_stage, deleted_at, left_at FROM people
       WHERE coalesce(name, '') NOT LIKE 'ZZ-TESTE%' AND NOT (coalesce(first_name, '') = 'Contato' AND coalesce(phone, '') = '5520912345678')) p) = s.people_md5,
  s.people_n || ' pessoas conferidas por hash' FROM _snap s;
INSERT INTO _r SELECT 23, 'busca normalizada: colunas geradas seguem funcionando em cadastro novo',
  name_sort IS NOT NULL AND contact_name_sort = 'zz-teste marcelo', contact_name_sort FROM people WHERE id = (SELECT marcelo FROM _ctx);
INSERT INTO _r SELECT 19, 'impacto nos legados: grupos duplicados pré-existentes continuam como estavam (não mesclados)',
  s.grupos_legados = (SELECT count(*) FROM (SELECT 1 FROM people WHERE deleted_at IS NULL AND phone_normalized IS NOT NULL
        AND coalesce(name, '') NOT LIKE 'ZZ-TESTE%' AND NOT (coalesce(first_name, '') = 'Contato' AND coalesce(phone, '') = '5520912345678')
        GROUP BY church_id, phone_normalized HAVING count(*) > 1) g),
  s.grupos_legados || ' grupos' FROM _snap s;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
