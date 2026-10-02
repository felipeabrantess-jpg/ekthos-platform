-- ============================================================
-- Regressão — Tipo da pessoa: no máximo UM tipo (migration 20261004100000)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Pessoas e etiquetas sintéticas (ZZ-TIPO).
-- Saída: uma linha por verificação (n, teste, ok, info).
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1, '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid adm,
       'dcf2852d-e790-46dc-b66b-e8f74977a706'::uuid u_itaipu, 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f'::uuid u_trindade,
       (SELECT id FROM tags WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND name = 'Membro')          t_mem,
       (SELECT id FROM tags WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND name = 'Visitante')       t_vis,
       (SELECT id FROM tags WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND name = 'Novo Convertido') t_nc,
       (SELECT id FROM tags WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND name = 'Reconciliado')    t_rec,
       (SELECT id FROM tags WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND name = 'Inativos')        t_ina,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'membro')    s_mem,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'visitante') s_vis,
       NULL::uuid p_ita, NULL::uuid p_tri, NULL::uuid p_sem, NULL::uuid p_des, NULL::uuid g1, NULL::uuid g2, NULL::uuid t_outra;
GRANT ALL ON _r, _c TO authenticated;

-- Fotografia do que já existe (antes de qualquer coisa — inclusive antes da migration na validação pré-deploy)
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, church_id, name, phone, unit_id, person_stage, pipeline_stage_id, membership_status, care_status, left_at, deleted_at, name_sort FROM people) x) people_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, tag_id, church_id, created_at, assigned_by FROM person_tags) x) person_tags_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, entered_at FROM person_pipeline) x) pipeline_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, closed_at, outcome, version FROM person_journey) x) journey_md5,
       (SELECT count(*) FROM journey_events) journey_events, (SELECT count(*) FROM journey_events WHERE event_type = 'pastoral_contact') contatos,
       (SELECT count(*) FROM acolhimento_journey) acolhimento, (SELECT count(*) FROM ministry_members) ministry_members, (SELECT count(*) FROM volunteers) volunteers,
       (SELECT count(*) FROM (SELECT person_id FROM person_tags GROUP BY 1 HAVING count(*) > 1) g) pessoas_2_tipos,
       -- divergências de baseline que NÃO podem ser tocadas
       (SELECT count(*) FROM person_tags pt JOIN tags t ON t.id = pt.tag_id JOIN people p ON p.id = pt.person_id AND p.deleted_at IS NULL
          JOIN person_pipeline pp ON pp.person_id = pt.person_id JOIN pipeline_stages s ON s.id = pp.stage_id WHERE s.name <> t.name AND pt.church_id = '6c127559-874a-4748-8fce-55d4079613a5') tipo_dif_etapa,
       (SELECT count(*) FROM people p LEFT JOIN person_pipeline pp ON pp.person_id = p.id WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND p.deleted_at IS NULL AND p.pipeline_stage_id IS DISTINCT FROM pp.stage_id) pipeline_id_dif,
       (SELECT count(*) FROM person_journey j JOIN people p ON p.id = j.person_id WHERE j.closed_at IS NULL AND j.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND j.stage_id IS DISTINCT FROM p.pipeline_stage_id) jornada_dif_pipeline_id,
       (SELECT count(*) FROM person_journey j JOIN person_pipeline pp ON pp.person_id = j.person_id WHERE j.closed_at IS NULL AND j.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND j.stage_id IS DISTINCT FROM pp.stage_id) jornada_dif_etapa,
       (SELECT count(*) FROM person_journey j JOIN people p ON p.id = j.person_id WHERE j.closed_at IS NULL AND p.left_at IS NOT NULL AND j.church_id = '6c127559-874a-4748-8fce-55d4079613a5') jornada_desligado;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- ── Cenário sintético ────────────────────────────────────────
INSERT INTO people (church_id, name, phone, source, unit_id) SELECT c1, 'ZZ-TIPO Itaipu',   '+5520933310001', 'manual', u_itaipu   FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id) SELECT c1, 'ZZ-TIPO Trindade', '+5520933310002', 'manual', u_trindade FROM _c;
INSERT INTO people (church_id, name, phone, source)          SELECT c1, 'ZZ-TIPO SemUnidade', '+5520933310003', 'manual' FROM _c;
INSERT INTO people (church_id, name, phone, source, unit_id, left_at, left_reason) SELECT c1, 'ZZ-TIPO Desligada', '+5520933310004', 'manual', u_itaipu, '2026-05-01', 'mudou' FROM _c;
UPDATE _c SET p_ita = (SELECT id FROM people WHERE name = 'ZZ-TIPO Itaipu'), p_tri = (SELECT id FROM people WHERE name = 'ZZ-TIPO Trindade'),
              p_sem = (SELECT id FROM people WHERE name = 'ZZ-TIPO SemUnidade'), p_des = (SELECT id FROM people WHERE name = 'ZZ-TIPO Desligada');
INSERT INTO tags (church_id, name, color, sort_order, category) SELECT c1, 'ZZ-TIPO Geral 1', '#111111', 90, 'general' FROM _c;
INSERT INTO tags (church_id, name, color, sort_order, category) SELECT c1, 'ZZ-TIPO Geral 2', '#222222', 91, 'general' FROM _c;
INSERT INTO tags (church_id, name, color, sort_order) SELECT c2, 'ZZ-TIPO Outra Igreja', '#333333', 1 FROM _c;
UPDATE _c SET g1 = (SELECT id FROM tags WHERE name = 'ZZ-TIPO Geral 1'), g2 = (SELECT id FROM tags WHERE name = 'ZZ-TIPO Geral 2'), t_outra = (SELECT id FROM tags WHERE name = 'ZZ-TIPO Outra Igreja');
-- etapa + atendimento da pessoa de Itaipu: Membro, com jornada e um contato (para provar que nada disso muda)
INSERT INTO person_pipeline (church_id, person_id, stage_id, entered_at, last_activity_at) SELECT c1, p_ita, s_mem, now(), now() FROM _c;
INSERT INTO person_tags (person_id, tag_id, church_id) SELECT p_ita, t_mem, c1 FROM _c;
INSERT INTO person_tags (person_id, tag_id, church_id) SELECT p_tri, t_vis, c1 FROM _c;
INSERT INTO person_tags (person_id, tag_id, church_id) SELECT p_sem, t_nc,  c1 FROM _c;
INSERT INTO person_tags (person_id, tag_id, church_id) SELECT p_des, t_rec, c1 FROM _c;

INSERT INTO _r SELECT 0, 'as cinco etiquetas atuais (por id) ficaram na categoria person_type',
  (SELECT count(*) FROM tags t, _c WHERE t.id IN (_c.t_mem, _c.t_vis, _c.t_nc, _c.t_rec, _c.t_ina) AND t.category = 'person_type') = 5
  AND (SELECT count(*) FROM tags WHERE category <> 'person_type' AND name NOT LIKE 'ZZ-TIPO%') = 0, (SELECT count(*)::text || ' etiquetas reais' FROM tags WHERE name NOT LIKE 'ZZ-TIPO%');
INSERT INTO _r SELECT 0, 'default seguro: etiqueta criada SEM categoria nasce "general" (nunca tipo por acidente)',
  category = 'general' AND (SELECT column_default LIKE '%general%' AND is_nullable = 'NO' FROM information_schema.columns WHERE table_name = 'tags' AND column_name = 'category'), category FROM tags WHERE name = 'ZZ-TIPO Outra Igreja';
INSERT INTO _r SELECT 0, 'categoria inválida é rejeitada (CHECK)', NOT EXISTS (SELECT 1 FROM tags WHERE category NOT IN ('person_type', 'general')), NULL;
INSERT INTO _r SELECT 0, 'a trigger decide SOMENTE por tags.category (não usa nome, cor, ordem ou rótulo)',
  prosrc LIKE '%t.category%' AND prosrc NOT ILIKE '%name%' AND prosrc NOT ILIKE '%color%' AND prosrc NOT ILIKE '%sort_order%', NULL FROM pg_proc WHERE proname = 'person_tags_enforce_single_type';

SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE c record; r text; n int; tipos text; care0 text; care1 text;
BEGIN
  SELECT * INTO c FROM _c;
  care0 := get_care_status_counts(c.c1, NULL)::text;

  -- 1–4. substituição de tipo (set_person_tags, como a tela faz)
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_vis]);
  SELECT string_agg(t.name, '+' ORDER BY t.name) INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (1, 'Membro → Visitante SUBSTITUI (Itaipu, não atendida)', tipos = 'Visitante', tipos);
  PERFORM set_person_tags(c.p_tri, ARRAY[c.t_mem]);
  SELECT string_agg(t.name, '+' ORDER BY t.name) INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_tri;
  INSERT INTO _r VALUES (2, 'Visitante → Membro SUBSTITUI (Trindade)', tipos = 'Membro', tipos);
  PERFORM set_person_tags(c.p_sem, ARRAY[c.t_mem]);
  SELECT string_agg(t.name, '+' ORDER BY t.name) INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_sem;
  INSERT INTO _r VALUES (3, 'Novo Convertido → Membro SUBSTITUI (Sem unidade)', tipos = 'Membro', tipos);
  PERFORM set_person_tags(c.p_des, ARRAY[c.t_mem]);
  SELECT string_agg(t.name, '+' ORDER BY t.name) INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_des;
  INSERT INTO _r VALUES (4, 'Reconciliado → Membro SUBSTITUI (pessoa desligada)', tipos = 'Membro', tipos);
  INSERT INTO _r VALUES (4, 'autor da troca fica registrado (assigned_by = usuário logado)',
    (SELECT bool_and(assigned_by = c.adm) FROM person_tags WHERE person_id IN (c.p_ita, c.p_tri, c.p_sem, c.p_des)), NULL);

  -- 7. segunda edição não ressuscita o tipo anterior
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_vis]);
  SELECT string_agg(t.name, '+') INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (7, 'salvar de novo o mesmo tipo não ressuscita o anterior', tipos = 'Visitante', tipos);

  -- 8–9. dois tipos são impedidos em TODAS as portas
  BEGIN PERFORM set_person_tags(c.p_ita, ARRAY[c.t_mem, c.t_vis]); r := 'ACEITO';
  EXCEPTION WHEN check_violation THEN r := SQLERRM; END;
  SELECT string_agg(t.name, '+') INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (8, 'Membro + Visitante pela RPC → bloqueado; tipo anterior intacto (sem escrita parcial)', r LIKE 'PERSON_TYPE_SINGLE%' AND tipos = 'Visitante', r);
  BEGIN INSERT INTO person_tags (person_id, tag_id, church_id) VALUES (c.p_ita, c.t_mem, c.c1); r := 'ACEITO';
  EXCEPTION WHEN check_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (8, 'INSERT direto de um 2º tipo (caminho antigo da tela) → bloqueado pelo banco', r = 'BLOQUEADO', r);
  FOR n IN 1..3 LOOP
    BEGIN
      INSERT INTO person_tags (person_id, tag_id, church_id)
      SELECT c.p_tri, x, c.c1 FROM unnest(CASE n WHEN 1 THEN ARRAY[c.t_nc] WHEN 2 THEN ARRAY[c.t_rec] ELSE ARRAY[c.t_ina] END) x;
      r := 'ACEITO';
    EXCEPTION WHEN check_violation THEN r := 'BLOQUEADO'; END;
    INSERT INTO _r VALUES (9, 'qualquer combinação de dois tipos → bloqueada (Membro + ' || (ARRAY['Novo Convertido','Reconciliado','Inativos'])[n] || ')', r = 'BLOQUEADO', r);
  END LOOP;
  BEGIN
    DELETE FROM person_tags WHERE person_id = c.p_sem;
    INSERT INTO person_tags (person_id, tag_id, church_id) VALUES (c.p_sem, c.t_mem, c.c1), (c.p_sem, c.t_vis, c.c1);
    r := 'ACEITO';
  EXCEPTION WHEN check_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (9, 'dois tipos no MESMO INSERT (2 linhas) → bloqueado', r = 'BLOQUEADO', r);
  BEGIN UPDATE person_tags SET person_id = c.p_tri WHERE person_id = c.p_ita; r := 'ACEITO';
  EXCEPTION WHEN check_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (9, 'mover etiqueta de tipo para pessoa que já tem tipo (UPDATE) → bloqueado', r = 'BLOQUEADO', r);
  PERFORM set_person_tags(c.p_sem, ARRAY[c.t_mem]);
  PERFORM set_person_tags(c.p_ita, '{}');
  INSERT INTO _r VALUES (9, 'ficar SEM tipo continua permitido', (SELECT count(*) FROM person_tags WHERE person_id = c.p_ita) = 0, NULL);
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_vis]);

  -- 10. outras categorias continuam multi-seleção
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_vis, c.g1, c.g2]);
  SELECT string_agg(t.name, ' + ' ORDER BY t.name) INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (10, 'etiquetas de outra categoria continuam múltiplas, junto com 1 tipo', tipos = 'Visitante + ZZ-TIPO Geral 1 + ZZ-TIPO Geral 2', tipos);
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_mem, c.g1, c.g2]);
  SELECT string_agg(t.name, ' + ' ORDER BY t.name) INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (10, 'trocar o tipo preserva as etiquetas gerais', tipos = 'Membro + ZZ-TIPO Geral 1 + ZZ-TIPO Geral 2', tipos);
  BEGIN UPDATE tags SET category = 'person_type' WHERE id = c.g1; r := 'ACEITO';
  EXCEPTION WHEN check_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (10, 'virar "tipo" uma etiqueta geral de quem já tem tipo → bloqueado', r = 'BLOQUEADO', r);
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_vis]);

  -- A / D. sem tipo → Membro; e tipo → sem tipo
  PERFORM set_person_tags(c.p_ita, '{}');
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_mem]);
  SELECT string_agg(t.name, '+') INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (33, 'A. pessoa sem tipo → Membro', tipos = 'Membro', tipos);
  PERFORM set_person_tags(c.p_ita, '{}');
  INSERT INTO _r VALUES (33, 'D. remover o tipo atual → pessoa fica sem tipo', (SELECT count(*) FROM person_tags WHERE person_id = c.p_ita) = 0, NULL);
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_vis]);

  -- F. duas etiquetas "general" direto no banco → permitido
  BEGIN
    INSERT INTO person_tags (person_id, tag_id, church_id) VALUES (c.p_tri, c.g1, c.c1), (c.p_tri, c.g2, c.c1);
    r := 'ACEITO';
  EXCEPTION WHEN check_violation THEN r := 'BLOQUEADO'; END;
  SELECT count(*) INTO n FROM person_tags WHERE person_id = c.p_tri;
  INSERT INTO _r VALUES (33, 'F. duas etiquetas general direto no banco (junto com 1 tipo) → permitido', r = 'ACEITO' AND n = 3, r || ', ' || n || ' etiquetas');

  -- RPC: troca só o que mudou — a etiqueta que permanece não é regravada
  SELECT string_agg(pt.id::text, ',' ORDER BY pt.tag_id) INTO tipos FROM person_tags pt WHERE pt.person_id = c.p_tri AND pt.tag_id IN (c.g1, c.g2);
  PERFORM set_person_tags(c.p_tri, ARRAY[c.t_vis, c.g1, c.g2]);
  INSERT INTO _r VALUES (33, 'RPC: trocar o tipo não regrava as etiquetas que permanecem; resultado tem exatamente 1 tipo',
    (SELECT string_agg(pt.id::text, ',' ORDER BY pt.tag_id) FROM person_tags pt WHERE pt.person_id = c.p_tri AND pt.tag_id IN (c.g1, c.g2)) = tipos
    AND (SELECT count(*) FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_tri AND t.category = 'person_type') = 1, NULL);
  PERFORM set_person_tags(c.p_tri, ARRAY[c.t_mem]);

  -- RPC: pessoa inexistente / removida
  BEGIN PERFORM set_person_tags(gen_random_uuid(), ARRAY[c.t_mem]); r := 'ACEITO';
  EXCEPTION WHEN insufficient_privilege THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (33, 'RPC: pessoa inexistente → recusada', r LIKE 'PERSON_NOT_FOUND%', r);

  -- 14–16. status de atendimento não muda com a troca de tipo
  care1 := get_care_status_counts(c.c1, NULL)::text;
  INSERT INTO _r VALUES (14, 'trocar tipo NÃO altera status de atendimento (não atendida / em atendimento / atendida)', care1 = care0, care1);

  -- 17–19. situação
  INSERT INTO _r VALUES (18, 'pessoa desligada: tipo trocado e left_at/left_reason intactos',
    (SELECT left_at = '2026-05-01'::timestamptz AND left_reason = 'mudou' FROM people WHERE id = c.p_des), NULL);

  -- 20–22. etapa × tipo: dimensões independentes
  UPDATE person_pipeline SET stage_id = c.s_vis, entered_at = now(), last_activity_at = now() WHERE person_id = c.p_ita;
  GET DIAGNOSTICS n = ROW_COUNT;
  SELECT string_agg(t.name, '+') INTO tipos FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = c.p_ita;
  INSERT INTO _r VALUES (22, 'trocar ETAPA (Membro → Visitante) não altera o TIPO', n = 1 AND tipos = 'Visitante', tipos);
  PERFORM set_person_tags(c.p_ita, ARRAY[c.t_mem]);
  INSERT INTO _r VALUES (22, 'trocar TIPO para Membro não altera a ETAPA (continua Visitante), nem person_stage/pipeline_stage_id',
    (SELECT stage_id = c.s_vis FROM person_pipeline WHERE person_id = c.p_ita)
    AND (SELECT person_stage::text = 'visitante' AND pipeline_stage_id IS NULL AND membership_status = 'visitor' FROM people WHERE id = c.p_ita), NULL);

  -- 32. isolamento entre igrejas
  BEGIN PERFORM set_person_tags(c.p_ita, ARRAY[c.t_outra]); r := 'ACEITO';
  EXCEPTION WHEN insufficient_privilege THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (32, 'etiqueta de outra igreja → recusada', r LIKE 'INVALID_TAG%', r);

  -- 23. telefone único continua valendo
  BEGIN INSERT INTO people (church_id, name, phone, source) VALUES (c.c1, 'ZZ-TIPO Dup', '(20) 93331-0001', 'manual'); r := 'ACEITO';
  EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO'; END;
  INSERT INTO _r VALUES (23, 'telefone único por igreja continua funcionando', r = 'BLOQUEADO', r);
END $$;
RESET ROLE;

-- 32. outro tenant não mexe no tipo de pessoa da IGV
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c2 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE r text;
BEGIN
  BEGIN PERFORM set_person_tags((SELECT p_ita FROM _c), '{}'); r := 'ACEITO';
  EXCEPTION WHEN insufficient_privilege THEN r := SQLERRM; END;
  INSERT INTO _r VALUES (32, 'usuário de outra igreja não altera tipo de pessoa da IGV', r LIKE 'PERSON_NOT_FOUND%', r);
END $$;
RESET ROLE;

-- concorrência: lock por pessoa mantido até o fim da transação
INSERT INTO _r SELECT 9, 'concorrência: gravações de tipo da mesma pessoa são serializadas (advisory lock)',
  EXISTS (SELECT 1 FROM pg_locks l WHERE l.locktype = 'advisory' AND l.pid = pg_backend_pid() AND l.granted
            AND ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended('person_type:' || (SELECT p_ita::text FROM _c), 8013)), NULL;

-- ── Preservação: o que já existia continua idêntico ──────────
INSERT INTO _r SELECT 15, 'registro legado com 2 tipos NÃO foi alterado, e os vínculos reais de tipo estão idênticos',
  (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT pt.id, pt.person_id, pt.tag_id, pt.church_id, pt.created_at, pt.assigned_by FROM person_tags pt JOIN people p ON p.id = pt.person_id WHERE p.name NOT LIKE 'ZZ-TIPO%' OR p.name IS NULL) x) = s.person_tags_md5
  AND (SELECT count(*) FROM (SELECT pt.person_id FROM person_tags pt JOIN people p ON p.id = pt.person_id WHERE coalesce(p.name, '') NOT LIKE 'ZZ-TIPO%' GROUP BY 1 HAVING count(*) > 1) g) = s.pessoas_2_tipos,
  s.pessoas_2_tipos || ' pessoa(s) com 2 tipos, como antes' FROM _snap s;
INSERT INTO _r SELECT 16, 'divergências de baseline intactas (tipo≠etapa, pipeline_stage_id, jornadas)',
  s.tipo_dif_etapa = (SELECT count(*) FROM person_tags pt JOIN tags t ON t.id = pt.tag_id JOIN people p ON p.id = pt.person_id AND p.deleted_at IS NULL AND coalesce(p.name, '') NOT LIKE 'ZZ-TIPO%'
          JOIN person_pipeline pp ON pp.person_id = pt.person_id JOIN pipeline_stages st ON st.id = pp.stage_id WHERE st.name <> t.name AND pt.church_id = '6c127559-874a-4748-8fce-55d4079613a5')
  AND s.pipeline_id_dif = (SELECT count(*) FROM people p LEFT JOIN person_pipeline pp ON pp.person_id = p.id WHERE p.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND p.deleted_at IS NULL AND coalesce(p.name, '') NOT LIKE 'ZZ-TIPO%' AND p.pipeline_stage_id IS DISTINCT FROM pp.stage_id)
  AND s.jornada_dif_pipeline_id = (SELECT count(*) FROM person_journey j JOIN people p ON p.id = j.person_id WHERE j.closed_at IS NULL AND j.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND j.stage_id IS DISTINCT FROM p.pipeline_stage_id)
  AND s.jornada_dif_etapa = (SELECT count(*) FROM person_journey j JOIN person_pipeline pp ON pp.person_id = j.person_id WHERE j.closed_at IS NULL AND j.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND j.stage_id IS DISTINCT FROM pp.stage_id)
  AND s.jornada_desligado = (SELECT count(*) FROM person_journey j JOIN people p ON p.id = j.person_id WHERE j.closed_at IS NULL AND p.left_at IS NOT NULL AND j.church_id = '6c127559-874a-4748-8fce-55d4079613a5'),
  format('tipo≠etapa=%s | pipeline_stage_id≠etapa=%s | jornada≠pipeline_stage_id=%s | jornada≠etapa=%s | jornada aberta de desligado=%s', s.tipo_dif_etapa, s.pipeline_id_dif, s.jornada_dif_pipeline_id, s.jornada_dif_etapa, s.jornada_desligado) FROM _snap s;
INSERT INTO _r SELECT 19, 'people pré-existentes idênticos (left_at, deleted_at, unidade, person_stage, membership_status, care_status, telefone, busca)',
  (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, church_id, name, phone, unit_id, person_stage, pipeline_stage_id, membership_status, care_status, left_at, deleted_at, name_sort FROM people WHERE coalesce(name, '') NOT LIKE 'ZZ-TIPO%') x) = s.people_md5, NULL FROM _snap s;
INSERT INTO _r SELECT 25, 'jornadas, journey_events, contatos e acolhimento inalterados',
  (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, closed_at, outcome, version FROM person_journey) x) = s.journey_md5
  AND (SELECT count(*) FROM journey_events) = s.journey_events AND (SELECT count(*) FROM journey_events WHERE event_type = 'pastoral_contact') = s.contatos
  AND (SELECT count(*) FROM acolhimento_journey) = s.acolhimento, s.journey_events || ' eventos, ' || s.contatos || ' contatos' FROM _snap s;
INSERT INTO _r SELECT 21, 'person_pipeline pré-existente idêntico (nenhuma etapa real alterada)',
  (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT pp.id, pp.person_id, pp.stage_id, pp.entered_at FROM person_pipeline pp JOIN people p ON p.id = pp.person_id WHERE coalesce(p.name, '') NOT LIKE 'ZZ-TIPO%') x) = s.pipeline_md5, NULL FROM _snap s;
INSERT INTO _r SELECT 28, 'ministry_members e volunteers inalterados',
  (SELECT count(*) FROM ministry_members) = s.ministry_members AND (SELECT count(*) FROM volunteers) = s.volunteers, s.ministry_members || ' / ' || s.volunteers FROM _snap s;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
