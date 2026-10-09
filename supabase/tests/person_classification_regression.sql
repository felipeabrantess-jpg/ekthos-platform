-- ============================================================
-- Regressão — Release 1: classificação única de Pessoas (migration 20261009100000)
-- Roda inteira em BEGIN … ROLLBACK: nada persiste. Pessoas/ministérios/células sintéticos ZZ-CLS.
-- Nenhum dado histórico é alterado (md5 antes/depois).
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1,
       '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid adm,          -- admin IGV
       '1b0d7654-618e-41e4-bf00-abb58da8aec8'::uuid cell_user,    -- cell_leader IGV
       '48338f75-b6e8-40c4-871a-5f1193b18af9'::uuid treasurer,    -- treasurer IGV (sem escopo)
       'dcf2852d-e790-46dc-b66b-e8f74977a706'::uuid itaipu,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'visitante') st_visit,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'membro') st_membro,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'novo_convertido') st_nc,
       (SELECT id FROM pipeline_stages WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND stage_key = 'membro_afastado') st_afast;
GRANT ALL ON _r, _c TO authenticated, anon;
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, membership_status, person_stage FROM people WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5') x) people_md5,
       (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, entered_at FROM person_pipeline WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5') x) pipeline_md5,
       (SELECT count(*) FROM person_tags) tags_n, (SELECT count(*) FROM audit_logs) audit_n, (SELECT count(*) FROM pipeline_history) hist_n;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

-- ── Estado legado: tudo lê como Não classificado; nada mudou nos dados ──
DO $$
DECLARE c record; j jsonb; n_ms int;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT count(*) INTO n_ms FROM people p WHERE p.church_id = c.c1 AND p.deleted_at IS NULL AND p.left_at IS NULL AND person_classification_value(p.id) IS NOT NULL;
  INSERT INTO _r VALUES (1, 'legado: nenhuma pessoa da IGV foi classificada pela migration (todas "Não classificado")', n_ms = 0, n_ms::text);
  INSERT INTO _r VALUES (2, 'legado: membership_status / person_stage / person_pipeline intactos (md5)',
    (SELECT people_md5 FROM _snap) = (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, membership_status, person_stage FROM people WHERE church_id = c.c1) x)
    AND (SELECT pipeline_md5 FROM _snap) = (SELECT md5(string_agg(md5(x::text), '' ORDER BY id)) FROM (SELECT id, person_id, stage_id, entered_at FROM person_pipeline WHERE church_id = c.c1) x), '');
  INSERT INTO _r VALUES (3, 'Sidinéia e Ozias: Não classificado, etapa Visitante preservada, etiqueta Membro preservada (só leitura)',
    (SELECT bool_and(person_classification_value(p.id) IS NULL AND (person_classification(p.id)->>'stage_key') = 'visitante'
                     AND EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = p.id AND t.name = 'Membro'))
       FROM people p WHERE p.id IN ('26000cc3-1f76-4621-ae32-707f8c100549', '06b2a999-3453-4bb2-93e2-6fc3cdf76052')), '');
  INSERT INTO _r VALUES (4, 'etapas: requires_classification configurado (membro/afastado/voluntario/lider = member; visitante = visitor; NC/reconciliado/connect livres)',
    (SELECT bool_and(CASE stage_key WHEN 'membro' THEN requires_classification = 'member' WHEN 'membro_afastado' THEN requires_classification = 'member'
                       WHEN 'visitante' THEN requires_classification = 'visitor' WHEN 'novo_convertido' THEN requires_classification IS NULL
                       WHEN 'reconciliado' THEN requires_classification IS NULL WHEN 'connect' THEN requires_classification IS NULL ELSE true END)
       FROM pipeline_stages WHERE church_id = c.c1), '');
END $$;

-- ── Dados sintéticos ──
INSERT INTO ministries (church_id, name, slug, is_active) SELECT c1, 'ZZ-CLS Louvor', 'zz-cls-louvor', true FROM _c;
INSERT INTO groups (church_id, name, status) SELECT c1, 'ZZ-CLS Célula', 'active' FROM _c;
INSERT INTO people (church_id, name, phone, source) SELECT c1, 'ZZ-CLS Alice', '+55 20 99940-0001', 'manual' FROM _c;
INSERT INTO people (church_id, name, phone, source) SELECT c1, 'ZZ-CLS Bruno', '+55 20 99940-0002', 'manual' FROM _c;
INSERT INTO people (church_id, name, phone, source) SELECT c1, 'ZZ-CLS Carla', '+55 20 99940-0003', 'manual' FROM _c;
INSERT INTO people (church_id, name, phone, source) SELECT c1, 'ZZ-CLS Davi', '+55 20 99940-0004', 'manual' FROM _c;
INSERT INTO people (church_id, name, phone, source, person_stage) SELECT c1, 'ZZ-CLS QR Visitante', '+55 20 99940-0005', 'qr_code', 'visitante' FROM _c;
INSERT INTO people (church_id, name, phone, source, person_stage, needs_review) SELECT c1, 'ZZ-CLS QR Ja Sou Membro', '+55 20 99940-0006', 'qr_code', 'frequentador', true FROM _c;
INSERT INTO people (church_id, name, phone, source, is_bulk_import) SELECT c1, 'ZZ-CLS Importada', '+55 20 99940-0007', 'import_xlsx', true FROM _c;
INSERT INTO people (church_id, name, phone, source) SELECT c2, 'ZZ-CLS Outra Igreja', '+55 20 99940-0008', 'manual' FROM _c;
CREATE TEMP TABLE _p ON COMMIT DROP AS SELECT id, name FROM people WHERE name LIKE 'ZZ-CLS %';
GRANT ALL ON _p TO authenticated, anon;
-- Carla pertence à célula sintética; Davi é membro do ministério sintético (sem ser voluntário)
UPDATE people SET celula_id = (SELECT id FROM groups WHERE name = 'ZZ-CLS Célula') WHERE name = 'ZZ-CLS Carla';
INSERT INTO ministry_members (church_id, ministry_id, person_id) SELECT c.c1, m.id, p.id FROM _c c, ministries m, _p p WHERE m.name = 'ZZ-CLS Louvor' AND p.name = 'ZZ-CLS Davi';
-- Conta do cell_leader vinculada à célula sintética (padrão leader_user_id)
UPDATE groups SET leader_user_id = (SELECT cell_user FROM _c) WHERE name = 'ZZ-CLS Célula';

-- ── Entradas: QR / importação / manual ──
DO $$
DECLARE c record; r jsonb;
BEGIN
  SELECT * INTO c FROM _c;
  INSERT INTO _r VALUES (10, 'QR (visitante): nova pessoa nasce Visitante definido', (SELECT person_classification_value(id) = 'visitor' AND classification_set_at IS NOT NULL FROM people WHERE name = 'ZZ-CLS QR Visitante'), '');
  INSERT INTO _r VALUES (11, 'QR "já sou membro": NÃO vira Membro; fica Não classificado com declaração pendente auditada',
    (SELECT person_classification_value(id) IS NULL AND membership_status IS NULL FROM people WHERE name = 'ZZ-CLS QR Ja Sou Membro')
    AND EXISTS (SELECT 1 FROM audit_logs a JOIN _p p ON p.id = a.entity_id WHERE p.name = 'ZZ-CLS QR Ja Sou Membro' AND a.action = 'member_declaration_pending'), '');
  INSERT INTO _r VALUES (12, 'importação: Não classificado (default "visitor" da coluna não conta como decisão)', (SELECT person_classification_value(id) IS NULL FROM people WHERE name = 'ZZ-CLS Importada'), '');
  INSERT INTO _r VALUES (13, 'cadastro manual: Não classificado até a tela decidir', (SELECT bool_and(person_classification_value(id) IS NULL) FROM people WHERE name IN ('ZZ-CLS Alice', 'ZZ-CLS Bruno')), '');
  -- INSERT direto tentando se declarar classificado: ignorado
  INSERT INTO people (church_id, name, phone, source, membership_status, classification_set_at) VALUES (c.c1, 'ZZ-CLS Direto', '+55 20 99940-0009', 'manual', 'member', NOW());
  INSERT INTO _r VALUES (14, 'INSERT direto com membership_status=member e classification_set_at: não classifica (fica Não classificado)', (SELECT person_classification_value(id) IS NULL FROM people WHERE name = 'ZZ-CLS Direto'), '');
  -- UPDATE direto de membership_status em legado: ignorado silenciosamente (compatibilidade), sem erro
  UPDATE people SET membership_status = 'member' WHERE name = 'ZZ-CLS Importada';
  INSERT INTO _r VALUES (15, 'UPDATE direto de membership_status em legado: valor mantido, sem classificar', (SELECT person_classification_value(id) IS NULL AND membership_status = 'visitor' FROM people WHERE name = 'ZZ-CLS Importada'), '');
END $$;

-- ── RPCs como admin ──
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; r jsonb; pa uuid; pb uuid; pd uuid; ok boolean; msg text; n_before int;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT id INTO pa FROM _p WHERE name = 'ZZ-CLS Alice'; SELECT id INTO pb FROM _p WHERE name = 'ZZ-CLS Bruno'; SELECT id INTO pd FROM _p WHERE name = 'ZZ-CLS Davi';
  -- confirmação obrigatória
  BEGIN PERFORM person_set_classification(pa, 'member'); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'CONFIRMATION_REQUIRED%'; END;
  INSERT INTO _r VALUES (20, 'sem confirmação → CONFIRMATION_REQUIRED', ok, '');
  -- Não classificado → Membro com confirmação
  r := person_set_classification(pa, 'member', NULL, true);
  INSERT INTO _r VALUES (21, 'admin: Não classificado → Membro (confirmado); label "Membro"; auditoria com base global_role', (r->>'changed')::boolean AND r->>'label' = 'Membro' AND r->>'scope_basis' LIKE 'global_role:%'
    AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = pa AND a.action = 'person_classification_changed' AND a.payload->>'new' = 'member' AND a.payload->>'old' IS NULL AND a.payload->>'scope_basis' LIKE 'global_role:%' AND a.actor_id = c.adm::text), r::text);
  -- no-op
  SELECT count(*) INTO n_before FROM audit_logs WHERE entity_id = pa;
  r := person_set_classification(pa, 'member', NULL, true);
  INSERT INTO _r VALUES (22, 'no-op: mesma classificação não grava nada', NOT (r->>'changed')::boolean AND (SELECT count(*) FROM audit_logs WHERE entity_id = pa) = n_before, '');
  -- Visitante
  r := person_set_classification(pb, 'visitor', NULL, true);
  INSERT INTO _r VALUES (23, 'Não classificado → Visitante', r->>'classification' = 'visitor' AND r->>'label' = 'Visitante', r::text);
  -- Visitante → Membro (confirmação, sem justificativa)
  r := person_set_classification(pb, 'member', NULL, true);
  INSERT INTO _r VALUES (24, 'Visitante → Membro com confirmação (sem justificativa)', r->>'classification' = 'member', '');
  -- Membro → Visitante sem justificativa → REASON_REQUIRED
  BEGIN PERFORM person_set_classification(pb, 'visitor', NULL, true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'REASON_REQUIRED%'; END;
  INSERT INTO _r VALUES (25, 'Membro → Visitante sem justificativa → REASON_REQUIRED', ok, '');
  -- Membro → Visitante com justificativa
  r := person_set_classification(pb, 'visitor', 'mudou de cidade, pediu desligamento', true);
  INSERT INTO _r VALUES (26, 'Membro → Visitante com justificativa: auditado com reason', r->>'classification' = 'visitor'
    AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = pb AND a.payload->>'old' = 'member' AND a.payload->>'new' = 'visitor' AND a.payload->>'reason' = 'mudou de cidade, pediu desligamento'), '');
  -- Funções: voluntário exige Membro
  BEGIN INSERT INTO volunteers (church_id, person_id, ministry_id, is_active) VALUES (c.c1, pb, (SELECT id FROM ministries WHERE name = 'ZZ-CLS Louvor'), true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'CLASSIFICATION_REQUIRED%'; END;
  INSERT INTO _r VALUES (30, 'voluntário para Visitante → CLASSIFICATION_REQUIRED', ok, '');
  INSERT INTO volunteers (church_id, person_id, ministry_id, is_active) VALUES (c.c1, pa, (SELECT id FROM ministries WHERE name = 'ZZ-CLS Louvor'), true);
  r := person_classification(pa);
  INSERT INTO _r VALUES (31, 'Membro + voluntário ativo → "Membro · Voluntário", is_volunteer', r->>'label' = 'Membro · Voluntário' AND (r->>'is_volunteer')::boolean AND NOT (r->>'is_leader')::boolean, r::text);
  -- Líder: ministério exige Membro; Membro com liderança + voluntariado → "Membro · Líder" (prioridade), voluntário visível em roles
  BEGIN UPDATE ministries SET leader_id = pb WHERE name = 'ZZ-CLS Louvor'; ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'CLASSIFICATION_REQUIRED%'; END;
  INSERT INTO _r VALUES (32, 'líder de ministério para Visitante → CLASSIFICATION_REQUIRED', ok, '');
  UPDATE ministries SET leader_id = pa WHERE name = 'ZZ-CLS Louvor';
  r := person_classification(pa);
  INSERT INTO _r VALUES (33, 'Membro líder E voluntário → label "Membro · Líder"; roles contém leader e volunteer', r->>'label' = 'Membro · Líder' AND (r->>'is_leader')::boolean AND (r->>'is_volunteer')::boolean
    AND jsonb_array_length(r->'roles') = 2, r::text);
  -- participar de ministério não é voluntariado
  r := person_set_classification(pd, 'member', NULL, true); r := person_classification(pd);
  INSERT INTO _r VALUES (34, 'membro de ministério (ministry_members) NÃO é voluntário: label "Membro", roles vazio', r->>'label' = 'Membro' AND NOT (r->>'is_volunteer')::boolean AND r->'roles' = '[]'::jsonb, r::text);
  -- rebaixamento com funções → HAS_ROLES, nada apagado
  BEGIN PERFORM person_set_classification(pa, 'visitor', 'teste', true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'HAS_ROLES%' AND SQLERRM LIKE '%volunteer%' AND SQLERRM LIKE '%ZZ-CLS Louvor%'; msg := SQLERRM; END;
  INSERT INTO _r VALUES (36, 'Membro com funções → Visitante: HAS_ROLES lista as funções; vínculos e classificação intactos', ok
    AND person_classification_value(pa) = 'member' AND EXISTS (SELECT 1 FROM volunteers WHERE person_id = pa AND is_active) AND (SELECT leader_id FROM ministries WHERE name = 'ZZ-CLS Louvor') = pa, left(msg, 200));
  -- Membro afastado continua Membro
  r := person_set_stage(pa, c.st_afast);
  r := person_classification(pa);
  INSERT INTO _r VALUES (37, 'etapa Membro afastado: classificação continua Membro, condition = afastado', r->>'classification' = 'member' AND r->>'condition' = 'afastado' AND r->>'label' LIKE 'Membro%', r::text);
END $$;

-- coordenador de ministério = líder (ministry_members.role só é alterado por fluxo privilegiado; aqui via RESET ROLE)
RESET ROLE;
UPDATE ministry_members SET role = 'coordenador' WHERE person_id = (SELECT id FROM _p WHERE name = 'ZZ-CLS Davi');
SET LOCAL ROLE authenticated;
DO $$
DECLARE pd uuid; r jsonb;
BEGIN
  SELECT id INTO pd FROM _p WHERE name = 'ZZ-CLS Davi';
  r := person_classification(pd);
  INSERT INTO _r VALUES (35, 'coordenador de ministério → Líder', r->>'label' = 'Membro · Líder' AND (r->'roles'->0->>'basis') = 'ministry_coordenador', r::text);
END $$;

-- ── Etapas × classificação ──
DO $$
DECLARE c record; r jsonb; pa uuid; pb uuid; ok boolean; t1 timestamptz; t2 timestamptz; nh int;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT id INTO pa FROM _p WHERE name = 'ZZ-CLS Alice'; SELECT id INTO pb FROM _p WHERE name = 'ZZ-CLS Bruno';
  -- Visitante não pode ir para etapa Membro
  BEGIN PERFORM person_set_stage(pb, c.st_membro); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'CLASSIFICATION_REQUIRED%'; END;
  INSERT INTO _r VALUES (40, 'Visitante → etapa Membro: CLASSIFICATION_REQUIRED (não promove em silêncio)', ok, '');
  -- Membro não pode ir para etapa Visitante
  BEGIN PERFORM person_set_stage(pa, c.st_visit); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'STAGE_CONFLICT%'; END;
  INSERT INTO _r VALUES (41, 'Membro → etapa Visitante: STAGE_CONFLICT', ok, '');
  -- etapas livres aceitam qualquer classificação; histórico gravado
  r := person_set_stage(pb, c.st_nc, 'aceitou Jesus');
  INSERT INTO _r VALUES (42, 'Visitante → Novo Convertido (etapa livre): ok, pipeline_history com motivo', (r->>'changed')::boolean AND EXISTS (SELECT 1 FROM pipeline_history h WHERE h.person_id = pb AND h.to_stage_id = c.st_nc AND h.notes = 'aceitou Jesus' AND h.moved_by = c.adm), r::text);
  r := person_set_stage(pb, c.st_visit);
  SELECT entered_at INTO t1 FROM person_pipeline WHERE person_id = pb;
  PERFORM pg_sleep(0.05);
  r := person_set_stage(pb, c.st_visit);
  SELECT entered_at INTO t2 FROM person_pipeline WHERE person_id = pb;
  SELECT count(*) INTO nh FROM pipeline_history WHERE person_id = pb;
  INSERT INTO _r VALUES (43, 'mesma etapa de novo: no-op, entered_at preservado, sem histórico extra', NOT (r->>'changed')::boolean AND t1 = t2 AND nh = 2, format('%s %s nh=%s', t1, t2, nh));
  -- escrita direta em person_pipeline bloqueada para authenticated
  BEGIN UPDATE person_pipeline SET stage_id = c.st_nc, entered_at = NOW() WHERE person_id = pb; ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'PIPELINE_DIRECT_WRITE%'; END;
  INSERT INTO _r VALUES (44, 'UPDATE direto em person_pipeline (Kanban antigo) → PIPELINE_DIRECT_WRITE', ok, '');
  -- Atendimento (journey_register_attendance) continua funcionando e respeita a guarda
  r := journey_register_attendance(p_person_id => pb, p_new_stage_id => c.st_visit, p_contact_channel => 'ligacao', p_contact_result => 'nao_atendeu', p_register_contact => true);
  INSERT INTO _r VALUES (45, 'Atendimento: abre jornada em etapa compatível (Visitante) normalmente', r ? 'journey_id', r::text);
  BEGIN PERFORM journey_register_attendance(p_person_id => pb, p_expected_version => 1, p_new_stage_id => c.st_membro, p_contact_channel => 'ligacao', p_contact_result => 'realizado', p_register_contact => true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'CLASSIFICATION_REQUIRED%'; END;
  INSERT INTO _r VALUES (46, 'Atendimento: escolher etapa Membro para Visitante → CLASSIFICATION_REQUIRED (nada gravado: atômico)', ok AND (SELECT count(*) FROM journey_events e JOIN person_journey j ON j.id = e.journey_id WHERE j.person_id = pb AND e.event_type = 'pastoral_contact') = 1, '');
  -- Release 1: pessoa Não classificada (legado) ainda pode ir para etapa Membro (nada é promovido em silêncio: continua Não classificado)
  r := person_set_stage((SELECT id FROM _p WHERE name = 'ZZ-CLS Importada'), c.st_membro);
  INSERT INTO _r VALUES (48, 'legado Não classificado → etapa Membro: permitido; classificação continua Não classificado', (r->>'changed')::boolean AND r->>'classification' IS NULL AND r->>'label' = 'Não classificado', r::text);
  -- etiqueta de tipo bloqueada
  BEGIN INSERT INTO person_tags (person_id, tag_id, church_id) SELECT pb, t.id, c.c1 FROM tags t WHERE t.church_id = c.c1 AND t.category = 'person_type' AND t.name = 'Membro'; ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'PERSON_TYPE_TAG_DEPRECATED%'; END;
  INSERT INTO _r VALUES (47, 'atribuir etiqueta de tipo → PERSON_TYPE_TAG_DEPRECATED', ok, '');
END $$;

-- ── Permissões: líder de célula (conta vinculada) e treasurer ──
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT cell_user FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
DO $$
DECLARE c record; r jsonb; pc uuid; pd uuid; ok boolean; basis text;
BEGIN
  SELECT * INTO c FROM _c;
  SELECT id INTO pc FROM _p WHERE name = 'ZZ-CLS Carla'; SELECT id INTO pd FROM _p WHERE name = 'ZZ-CLS Davi';
  basis := can_classify_person(pc);
  r := person_set_classification(pc, 'member', NULL, true);
  INSERT INTO _r VALUES (50, 'líder de célula (groups.leader_user_id): classifica pessoa da própria célula; base cell_leader auditada', basis LIKE 'cell_leader:%' AND r->>'classification' = 'member'
    AND EXISTS (SELECT 1 FROM audit_logs a WHERE a.entity_id = pc AND a.payload->>'scope_basis' LIKE 'cell_leader:%' AND a.actor_id = c.cell_user::text), basis);
  BEGIN PERFORM person_set_classification(pd, 'visitor', 'x', true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'FORBIDDEN%'; END;
  INSERT INTO _r VALUES (51, 'líder de célula: pessoa de fora da célula → FORBIDDEN (sem acesso global)', ok AND can_classify_person(pd) IS NULL, '');
  BEGIN PERFORM person_set_stage(pd, c.st_nc); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'FORBIDDEN%'; END;
  INSERT INTO _r VALUES (52, 'líder de célula: etapa de pessoa fora da célula → FORBIDDEN', ok, '');
END $$;
-- vice-líder (co_leader_user_id)
RESET ROLE;
UPDATE groups SET leader_user_id = NULL, co_leader_user_id = (SELECT cell_user FROM _c) WHERE name = 'ZZ-CLS Célula';
SET LOCAL ROLE authenticated;
DO $$
DECLARE pc uuid; basis text;
BEGIN
  SELECT id INTO pc FROM _p WHERE name = 'ZZ-CLS Carla';
  basis := can_classify_person(pc);
  INSERT INTO _r VALUES (53, 'vice-líder (co_leader_user_id): mesmo escopo da célula', basis LIKE 'cell_leader:%', COALESCE(basis, 'NULL'));
END $$;
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT treasurer FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
DO $$
DECLARE pa uuid; ok boolean;
BEGIN
  SELECT id INTO pa FROM _p WHERE name = 'ZZ-CLS Alice';
  BEGIN PERFORM person_set_classification(pa, 'visitor', 'x', true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'FORBIDDEN%'; END;
  INSERT INTO _r VALUES (54, 'treasurer (sem escopo): FORBIDDEN', ok, '');
END $$;
-- responsável pela jornada aberta (owner) sem papel global: pode classificar quem acompanha
RESET ROLE;
INSERT INTO person_journey (person_id, church_id, stage_id, owner_id, version)
SELECT p.id, c.c1, c.st_visit, c.treasurer, 1 FROM _p p, _c c WHERE p.name = 'ZZ-CLS Davi';
SET LOCAL ROLE authenticated;
DO $$
DECLARE pd uuid; basis text;
BEGIN
  SELECT id INTO pd FROM _p WHERE name = 'ZZ-CLS Davi';
  basis := can_classify_person(pd);
  INSERT INTO _r VALUES (55, 'responsável pela jornada aberta (owner_id): autorizado com base journey_owner', basis LIKE 'journey_owner:%', COALESCE(basis, 'NULL'));
END $$;
-- outra igreja
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c2 FROM _c)))::text, true);
DO $$
DECLARE pa uuid; ok boolean;
BEGIN
  SELECT id INTO pa FROM _p WHERE name = 'ZZ-CLS Alice';
  BEGIN PERFORM person_set_classification(pa, 'visitor', 'x', true); ok := false; EXCEPTION WHEN OTHERS THEN ok := SQLERRM LIKE 'FORBIDDEN%'; END;
  INSERT INTO _r VALUES (56, 'tenant: admin de outra igreja → FORBIDDEN', ok, '');
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN PERFORM person_set_classification('06b2a999-3453-4bb2-93e2-6fc3cdf76052', 'member', NULL, true); INSERT INTO _r VALUES (57, 'anon negado', false, 'executou');
  EXCEPTION WHEN insufficient_privilege OR raise_exception THEN INSERT INTO _r VALUES (57, 'anon: person_set_classification negado', true, SQLERRM); END;
END $$;
RESET ROLE;

-- ── Leitura única: lista, contadores, CSV, dashboard, filtros ──
SELECT set_config('request.jwt.claims', json_build_object('sub', (SELECT adm FROM _c), 'role', 'authenticated',
       'app_metadata', json_build_object('church_id', (SELECT c1 FROM _c)))::text, true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; j jsonb; lista bigint; r jsonb;
BEGIN
  SELECT * INTO c FROM _c;
  j := (get_people_stage_counts(c.c1))->'classificacao';
  SELECT max(total_count) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CLS', p_classification => 'member', p_limit => 1);
  INSERT INTO _r VALUES (60, 'filtro Membros + busca: lista = 3 (Alice, Carla, Davi)', lista = 3, lista::text);
  SELECT max(total_count) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CLS', p_classification => 'visitor', p_limit => 1);
  INSERT INTO _r VALUES (61, 'filtro Visitantes + busca: 2 (Bruno, QR Visitante)', lista = 2, lista::text);
  SELECT max(total_count) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CLS', p_classification => 'none', p_limit => 1);
  INSERT INTO _r VALUES (62, 'filtro Não classificados + busca: 3 (QR já sou membro, Importada, Direto)', lista = 3, lista::text);
  SELECT max(total_count) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CLS', p_role => 'leader_volunteer', p_limit => 1);
  INSERT INTO _r VALUES (63, 'filtro Líderes que também são voluntários: 1 (Alice)', lista = 1, lista::text);
  SELECT max(total_count) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CLS', p_role => 'member_only', p_limit => 1);
  INSERT INTO _r VALUES (64, 'filtro Somente membros sem função: 1 (Carla)', lista = 1, lista::text);
  SELECT max(total_count) INTO lista FROM get_people_page(c.c1, p_search => 'ZZ-CLS', p_role => 'leader', p_limit => 1);
  INSERT INTO _r VALUES (65, 'filtro Membros líderes: 2 (Alice, Davi coordenador)', lista = 2, lista::text);
  INSERT INTO _r VALUES (66, 'contadores de classificação (IGV + sintéticos): visitor + member + none = total da lista',
    (j->>'visitor')::int + (j->>'member')::int + (j->>'none')::int = (SELECT max(total_count) FROM get_people_page(c.c1, p_limit => 1)), j::text);
  j := get_care_status_counts(c.c1, p_search => 'ZZ-CLS', p_classification => 'member');
  INSERT INTO _r VALUES (67, 'contador de atendimento respeita o filtro de classificação (total 3)', (j->>'total')::int = 3, j::text);
  r := (SELECT row_data FROM get_people_page(c.c1, p_search => 'ZZ-CLS Alice', p_limit => 1));
  INSERT INTO _r VALUES (68, 'row_data traz classification.label "Membro · Líder" e roles', r->'classification'->>'label' = 'Membro · Líder' AND jsonb_array_length(r->'classification'->'roles') = 2, r->'classification'::text);
  j := export_people_rows(c.c1, p_search => 'ZZ-CLS', p_classification => 'member');
  INSERT INTO _r VALUES (69, 'CSV: respeita filtro de classificação e traz classification por linha', (j->>'total')::int = 3 AND (SELECT bool_and(x->'classification'->>'classification' = 'member') FROM jsonb_array_elements(j->'rows') x), j->>'total');
  j := get_dashboard_people_stats(c.c1);
  INSERT INTO _r VALUES (70, 'dashboard: "membros" pela classificação canônica (= contagem member do mesmo escopo)', (j->>'membros')::int = (SELECT count(*) FROM people p WHERE p.church_id = c.c1 AND p.deleted_at IS NULL AND p.left_at IS NULL AND person_classification_value(p.id) = 'member'), j->>'membros');
  -- nenhuma pessoa com label contraditório
  INSERT INTO _r VALUES (71, 'nenhuma pessoa lê como Visitante e Membro ao mesmo tempo (classificação única por construção)',
    NOT EXISTS (SELECT 1 FROM people p WHERE p.church_id = c.c1 AND person_classification_value(p.id) NOT IN ('visitor', 'member')), '');
END $$;

-- ── Histórico e dados preservados ──
RESET ROLE;
INSERT INTO _r SELECT 80, 'etiquetas, auditoria e histórico pré-existentes preservados (só acrescenta)',
  (SELECT count(*) FROM person_tags) = s.tags_n AND (SELECT count(*) FROM audit_logs) > s.audit_n AND (SELECT count(*) FROM pipeline_history) > s.hist_n, ''
FROM _snap s;

SELECT n, teste, ok, info FROM _r ORDER BY n;
ROLLBACK;
