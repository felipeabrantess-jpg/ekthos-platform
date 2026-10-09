-- ============================================================
-- RELEASE 1 — Classificação única de Pessoas (estrutura, sem migração histórica)
--
-- Fonte única da classificação vigente: people.membership_status ∈ {visitor, member, NULL}
--   + people.classification_set_at (NULL = valor legado/indefinido → "Não classificado").
--   Nenhum valor legado é alterado. TRANSIÇÃO: quem ainda não foi validado lê a
--   classificação DERIVADA das evidências existentes (person_legacy_classification),
--   só para leitura; sem evidência lê como Não classificado. O default 'visitor' da
--   importação nunca conta como evidência.
-- Funções (derivadas, nunca gravadas): Líder = liderança/coordenação de ministério,
--   liderança/vice-liderança de célula; Voluntário = volunteers.is_active.
-- Etapa pastoral (person_pipeline) independente; pipeline_stages.requires_classification
--   impede etapa contraditória. Escrita só pelas RPCs (GUC de sessão + triggers).
-- Auditoria: audit_logs (classificação) e pipeline_history (etapa).
-- ============================================================

-- ── 1. Colunas ────────────────────────────────────────────────────────────
ALTER TABLE public.people ADD COLUMN IF NOT EXISTS classification_set_at timestamptz;
COMMENT ON COLUMN public.people.classification_set_at IS
  'Quando a classificação (membership_status) foi definida por decisão (RPC/entrada/migração). NULL = legado, lê como Não classificado.';
ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_classification_domain;
ALTER TABLE public.people ADD CONSTRAINT people_classification_domain
  CHECK (classification_set_at IS NULL OR membership_status IS NULL OR membership_status IN ('visitor', 'member'));

ALTER TABLE public.pipeline_stages ADD COLUMN IF NOT EXISTS requires_classification text;
ALTER TABLE public.pipeline_stages DROP CONSTRAINT IF EXISTS pipeline_stages_requires_classification_check;
ALTER TABLE public.pipeline_stages ADD CONSTRAINT pipeline_stages_requires_classification_check
  CHECK (requires_classification IS NULL OR requires_classification IN ('member', 'visitor'));
COMMENT ON COLUMN public.pipeline_stages.requires_classification IS
  'member: só Membro pode estar nesta etapa; visitor: Membro não pode; NULL: etapa pastoral livre (Novo Convertido, Reconciliado, Connect…).';
-- Configuração das etapas (não é dado de pessoa): por stage_key, em todas as igrejas
UPDATE public.pipeline_stages SET requires_classification = 'member'
 WHERE stage_key IN ('membro', 'membro_afastado', 'voluntario', 'lider') AND requires_classification IS NULL;
UPDATE public.pipeline_stages SET requires_classification = 'visitor'
 WHERE stage_key = 'visitante' AND requires_classification IS NULL;

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS leader_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS co_leader_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.groups.leader_user_id IS 'Conta autenticada que exerce a liderança da célula (padrão ministries.leader_user_id). leader_id continua sendo a pessoa.';
COMMENT ON COLUMN public.groups.co_leader_user_id IS 'Conta autenticada do vice-líder da célula.';
CREATE INDEX IF NOT EXISTS groups_leader_user_id_idx ON public.groups (leader_user_id) WHERE leader_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS groups_co_leader_user_id_idx ON public.groups (co_leader_user_id) WHERE co_leader_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON public.audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ministries_leader_id_idx ON public.ministries (leader_id) WHERE leader_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS groups_leader_id_idx ON public.groups (leader_id) WHERE leader_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS groups_co_leader_id_idx ON public.groups (co_leader_id) WHERE co_leader_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ministry_members_person_id_idx ON public.ministry_members (person_id);
CREATE INDEX IF NOT EXISTS volunteers_person_active_idx ON public.volunteers (person_id) WHERE is_active = true;

-- ── 2. Leitura ────────────────────────────────────────────────────────────
-- Classificação VALIDADA (decisão registrada: RPC, entrada nova ou migração). NULL = ainda não validada.
CREATE OR REPLACE FUNCTION public.person_classification_validated(p_person_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor', 'member')
              THEN p.membership_status END
  FROM people p WHERE p.id = p_person_id
$$;

-- Classificação DERIVADA do legado (transição, só leitura — nada é gravado):
--   Membro   = etiqueta Membro, OU etapa de Membro (membro, membro_afastado, lider, voluntario),
--              OU liderança formal (ministério/coordenação/célula/vice), OU voluntariado ativo;
--   Visitante = (etiqueta Visitante OU etapa Visitante) e NENHUMA evidência de Membro;
--   NULL     = sem evidência (ex.: importação de junho sem etapa nem etiqueta).
-- membership_status legado (default 'visitor' da importação) NÃO é evidência.
CREATE OR REPLACE FUNCTION public.person_legacy_classification(p_person_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH ev AS (
    SELECT
      EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = p_person_id AND t.category = 'person_type' AND t.name = 'Membro') AS tag_m,
      EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = p_person_id AND t.category = 'person_type' AND t.name = 'Visitante') AS tag_v,
      (SELECT ps.stage_key FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p_person_id LIMIT 1) AS etapa,
      EXISTS (SELECT 1 FROM ministries m WHERE m.leader_id = p_person_id AND m.is_active IS NOT FALSE) AS lid_m,
      EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = p_person_id AND mm.role::text IN ('lider', 'coordenador')) AS coord,
      EXISTS (SELECT 1 FROM groups g WHERE (g.leader_id = p_person_id OR g.co_leader_id = p_person_id) AND COALESCE(g.status, 'active') NOT IN ('inactive', 'archived')) AS lid_c,
      EXISTS (SELECT 1 FROM volunteers v WHERE v.person_id = p_person_id AND v.is_active = true) AS vol)
  SELECT CASE
    WHEN tag_m OR etapa IN ('membro', 'membro_afastado', 'lider', 'voluntario') OR lid_m OR coord OR lid_c OR vol THEN 'member'
    WHEN tag_v OR etapa = 'visitante' THEN 'visitor'
  END FROM ev
$$;

-- Classificação EFETIVA (o que todas as telas, contadores, filtros, CSV e guardas usam):
-- validada quando existe; senão a derivada do legado; senão NULL (Não classificado).
CREATE OR REPLACE FUNCTION public.person_classification_value(p_person_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(person_classification_validated(p_person_id), person_legacy_classification(p_person_id))
$$;

-- Origem da classificação efetiva: 'validated' | 'legacy' | NULL
CREATE OR REPLACE FUNCTION public.person_classification_source(p_person_id uuid)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT CASE WHEN person_classification_validated(p_person_id) IS NOT NULL THEN 'validated'
              WHEN person_legacy_classification(p_person_id) IS NOT NULL THEN 'legacy' END
$$;

-- Funções derivadas: [{role, basis, ref_id, ref_name}]
CREATE OR REPLACE FUNCTION public.person_roles(p_person_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(jsonb_agg(r ORDER BY (r->>'role') = 'leader' DESC, r->>'ref_name'), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object('role', 'leader', 'basis', 'ministry_leader', 'ref_id', m.id, 'ref_name', m.name) r
      FROM ministries m WHERE m.leader_id = p_person_id AND m.is_active IS NOT FALSE
    UNION ALL
    SELECT jsonb_build_object('role', 'leader', 'basis', 'ministry_' || mm.role::text, 'ref_id', m.id, 'ref_name', m.name)
      FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id
     WHERE mm.person_id = p_person_id AND mm.role::text IN ('lider', 'coordenador') AND m.is_active IS NOT FALSE
    UNION ALL
    SELECT jsonb_build_object('role', 'leader', 'basis', 'cell_leader', 'ref_id', g.id, 'ref_name', g.name)
      FROM groups g WHERE g.leader_id = p_person_id AND COALESCE(g.status, 'active') NOT IN ('inactive', 'archived')
    UNION ALL
    SELECT jsonb_build_object('role', 'leader', 'basis', 'cell_co_leader', 'ref_id', g.id, 'ref_name', g.name)
      FROM groups g WHERE g.co_leader_id = p_person_id AND COALESCE(g.status, 'active') NOT IN ('inactive', 'archived')
    UNION ALL
    SELECT jsonb_build_object('role', 'volunteer', 'basis', 'volunteer_active', 'ref_id', v.id, 'ref_name', COALESCE(m.name, v.role, 'Voluntário'))
      FROM volunteers v LEFT JOIN ministries m ON m.id = v.ministry_id
     WHERE v.person_id = p_person_id AND v.is_active = true
  ) s
$$;

-- Classificação efetiva de TODAS as pessoas ativas de uma igreja, em lote (uma consulta com junções):
-- usada por contadores, filtros, dashboard, aba Visitante e CSV, para não recalcular pessoa a pessoa.
-- Mesma regra de person_classification_value / person_roles.
CREATE OR REPLACE FUNCTION public.person_classification_rows(p_church_id uuid)
RETURNS TABLE(person_id uuid, cls text, source text, roles jsonb)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH ppl AS (
    SELECT p.id, p.membership_status, p.classification_set_at
    FROM people p WHERE p.church_id = p_church_id AND p.deleted_at IS NULL AND p.left_at IS NULL
  ),
  tags_m AS (SELECT DISTINCT pt.person_id FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.church_id = p_church_id AND t.category = 'person_type' AND t.name = 'Membro'),
  tags_v AS (SELECT DISTINCT pt.person_id FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.church_id = p_church_id AND t.category = 'person_type' AND t.name = 'Visitante'),
  stg AS (SELECT pp.person_id, ps.stage_key FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.church_id = p_church_id),
  rl AS (
    SELECT s.person_id, jsonb_agg(s.r ORDER BY (s.r->>'role') = 'leader' DESC, s.r->>'ref_name') AS roles
    FROM (
      SELECT m.leader_id AS person_id, jsonb_build_object('role','leader','basis','ministry_leader','ref_id',m.id,'ref_name',m.name) AS r
        FROM ministries m WHERE m.church_id = p_church_id AND m.is_active IS NOT FALSE AND m.leader_id IS NOT NULL
      UNION ALL
      SELECT mm.person_id, jsonb_build_object('role','leader','basis','ministry_' || mm.role::text,'ref_id',m.id,'ref_name',m.name)
        FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id
       WHERE mm.church_id = p_church_id AND mm.role::text IN ('lider','coordenador') AND m.is_active IS NOT FALSE
      UNION ALL
      SELECT g.leader_id, jsonb_build_object('role','leader','basis','cell_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND g.leader_id IS NOT NULL AND COALESCE(g.status,'active') NOT IN ('inactive','archived')
      UNION ALL
      SELECT g.co_leader_id, jsonb_build_object('role','leader','basis','cell_co_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND g.co_leader_id IS NOT NULL AND COALESCE(g.status,'active') NOT IN ('inactive','archived')
      UNION ALL
      SELECT v.person_id, jsonb_build_object('role','volunteer','basis','volunteer_active','ref_id',v.id,'ref_name',COALESCE(m.name, v.role, 'Voluntário'))
        FROM volunteers v LEFT JOIN ministries m ON m.id = v.ministry_id
       WHERE v.church_id = p_church_id AND v.is_active = true
    ) s GROUP BY s.person_id
  )
  SELECT ppl.id,
    COALESCE(
      CASE WHEN ppl.classification_set_at IS NOT NULL AND ppl.membership_status IN ('visitor','member') THEN ppl.membership_status END,
      CASE WHEN tm.person_id IS NOT NULL OR stg.stage_key IN ('membro','membro_afastado','lider','voluntario') OR rl.person_id IS NOT NULL THEN 'member'
           WHEN tv.person_id IS NOT NULL OR stg.stage_key = 'visitante' THEN 'visitor' END) AS cls,
    CASE WHEN ppl.classification_set_at IS NOT NULL AND ppl.membership_status IN ('visitor','member') THEN 'validated'
         WHEN tm.person_id IS NOT NULL OR stg.stage_key IN ('membro','membro_afastado','lider','voluntario') OR rl.person_id IS NOT NULL
              OR tv.person_id IS NOT NULL OR stg.stage_key = 'visitante' THEN 'legacy' END AS source,
    COALESCE(rl.roles, '[]'::jsonb) AS roles
  FROM ppl
  LEFT JOIN tags_m tm ON tm.person_id = ppl.id
  LEFT JOIN tags_v tv ON tv.person_id = ppl.id
  LEFT JOIN stg ON stg.person_id = ppl.id
  LEFT JOIN rl ON rl.person_id = ppl.id
$$;
REVOKE ALL ON FUNCTION public.person_classification_rows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_classification_rows(uuid) TO authenticated, service_role;

-- Monta o objeto de classificação a partir dos componentes (puro; fonte única do rótulo)
CREATE OR REPLACE FUNCTION public.person_classification_build(p_cls text, p_roles jsonb, p_stage_key text, p_stage_name text, p_source text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object(
    'classification', p_cls,
    'source',         p_source,
    'is_leader',    COALESCE(p_roles, '[]'::jsonb) @> '[{"role":"leader"}]',
    'is_volunteer', COALESCE(p_roles, '[]'::jsonb) @> '[{"role":"volunteer"}]',
    'roles',        COALESCE(p_roles, '[]'::jsonb),
    'stage_key',    p_stage_key,
    'stage_name',   p_stage_name,
    'condition',    CASE WHEN p_stage_key = 'membro_afastado' THEN 'afastado' END,
    'label', CASE
      WHEN p_cls = 'member' AND COALESCE(p_roles, '[]'::jsonb) @> '[{"role":"leader"}]'    THEN 'Membro · Líder'
      WHEN p_cls = 'member' AND COALESCE(p_roles, '[]'::jsonb) @> '[{"role":"volunteer"}]' THEN 'Membro · Voluntário'
      WHEN p_cls = 'member'  THEN 'Membro'
      WHEN p_cls = 'visitor' THEN 'Visitante'
      ELSE 'Não classificado' END)
$$;
REVOKE ALL ON FUNCTION public.person_classification_build(text, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_classification_build(text, jsonb, text, text, text) TO authenticated, service_role;

-- Leitura única para todas as telas, RPCs e CSV
CREATE OR REPLACE FUNCTION public.person_classification(p_person_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT person_classification_build(
    person_classification_value(p_person_id),
    person_roles(p_person_id),
    (SELECT ps.stage_key FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p_person_id LIMIT 1),
    (SELECT ps.name      FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p_person_id LIMIT 1),
    person_classification_source(p_person_id))
$$;
REVOKE ALL ON FUNCTION public.person_classification_value(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_classification_validated(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_legacy_classification(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_classification_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_classification_validated(uuid), public.person_legacy_classification(uuid), public.person_classification_source(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.person_roles(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.person_classification(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_classification_value(uuid), public.person_roles(uuid), public.person_classification(uuid) TO authenticated, service_role;

-- ── 3. Autorização ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_lead_cell(p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM groups g
        WHERE g.id = p_group_id
          AND g.church_id = auth_church_id()
          AND (auth_user_role()::text IN ('admin', 'admin_departments', 'pastor_celulas', 'supervisor')
               OR g.leader_user_id = auth.uid()
               OR g.co_leader_user_id = auth.uid()))
$$;
REVOKE ALL ON FUNCTION public.can_lead_cell(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_lead_cell(uuid) TO authenticated, service_role;

-- Devolve a BASE da autorização (gravada na auditoria) ou NULL quando não autorizado.
-- Nunca usa people.responsible_id (sem vínculo comprovado com auth.users).
CREATE OR REPLACE FUNCTION public.can_classify_person(p_person_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_church uuid; v_uid uuid := auth.uid(); v_role text := COALESCE(auth_user_role()::text, ''); v_ref uuid;
BEGIN
  SELECT church_id INTO v_church FROM people WHERE id = p_person_id;
  IF v_church IS NULL OR v_uid IS NULL OR auth_church_id() IS NULL OR v_church <> auth_church_id() THEN
    RETURN NULL;
  END IF;
  IF v_role IN ('admin', 'admin_departments', 'pastor_celulas', 'supervisor', 'secretary') THEN
    RETURN 'global_role:' || v_role;
  END IF;
  -- responsável pela jornada aberta
  SELECT j.id INTO v_ref FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NULL AND j.owner_id = v_uid LIMIT 1;
  IF v_ref IS NOT NULL THEN RETURN 'journey_owner:' || v_ref; END IF;
  -- conta líder de ministério: pessoa encaminhada (jornada aberta) ou membro do ministério
  SELECT m.id INTO v_ref FROM ministries m
   WHERE m.church_id = v_church AND m.leader_user_id = v_uid AND m.is_active IS NOT FALSE
     AND (EXISTS (SELECT 1 FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NULL AND j.ministry_id = m.id)
          OR EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = p_person_id AND mm.ministry_id = m.id))
   LIMIT 1;
  IF v_ref IS NOT NULL THEN RETURN 'ministry_leader:' || v_ref; END IF;
  -- conta líder/vice-líder de célula: pessoa da célula (people.celula_id ou cell_members ativo)
  SELECT g.id INTO v_ref FROM groups g
   WHERE g.church_id = v_church AND (g.leader_user_id = v_uid OR g.co_leader_user_id = v_uid)
     AND (EXISTS (SELECT 1 FROM people p WHERE p.id = p_person_id AND p.celula_id = g.id)
          OR EXISTS (SELECT 1 FROM cell_members cm WHERE cm.person_id = p_person_id AND cm.group_id = g.id AND cm.left_at IS NULL))
   LIMIT 1;
  IF v_ref IS NOT NULL THEN RETURN 'cell_leader:' || v_ref; END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.can_classify_person(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_classify_person(uuid) TO authenticated, service_role;

-- ── 4. Escrita centralizada ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.person_set_classification(
  p_person_id uuid, p_value text, p_reason text DEFAULT NULL, p_confirmed boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_person people%ROWTYPE; v_old text; v_basis text; v_roles jsonb; v_new text;
BEGIN
  IF p_value NOT IN ('visitor', 'member', 'none') THEN
    RAISE EXCEPTION 'INVALID_CLASSIFICATION' USING ERRCODE = '22023', HINT = 'visitor | member | none';
  END IF;
  v_new := NULLIF(p_value, 'none');
  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_basis := can_classify_person(p_person_id);
  IF v_basis IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão para classificar esta pessoa' USING ERRCODE = '42501';
  END IF;
  v_old := person_classification_value(p_person_id);   -- efetiva (validada ou derivada do legado)
  -- no-op: nada gravado quando já está VALIDADA com o mesmo valor (validar um legado igual registra a decisão)
  IF v_old IS NOT DISTINCT FROM v_new AND person_classification_validated(p_person_id) IS NOT NULL THEN
    RETURN jsonb_build_object('person_id', p_person_id, 'changed', false) || person_classification(p_person_id);
  END IF;
  IF NOT COALESCE(p_confirmed, false) THEN
    RAISE EXCEPTION 'CONFIRMATION_REQUIRED' USING ERRCODE = 'P0001', HINT = 'a mudança de classificação exige confirmação explícita';
  END IF;
  -- rebaixamento (Membro → Visitante / Não classificado): justificativa + sem funções ativas
  IF v_old = 'member' AND v_new IS DISTINCT FROM 'member' THEN
    IF NULLIF(btrim(COALESCE(p_reason, '')), '') IS NULL THEN
      RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE = 'P0001', HINT = 'rebaixar um Membro exige justificativa';
    END IF;
    v_roles := person_roles(p_person_id);
    IF jsonb_array_length(v_roles) > 0 THEN
      RAISE EXCEPTION 'HAS_ROLES: %', v_roles::text USING ERRCODE = 'P0001',
        HINT = 'regularize as funções (liderança/voluntariado) antes de rebaixar';
    END IF;
  END IF;
  PERFORM set_config('ekthos.classification_write', 'rpc', true);
  UPDATE people SET membership_status = v_new, classification_set_at = NOW(), updated_at = NOW() WHERE id = p_person_id;
  PERFORM set_config('ekthos.classification_write', '', true);   -- a autorização vale só para esta escrita
  INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
  VALUES (v_person.church_id, 'person', p_person_id, 'person_classification_changed', 'human', auth.uid()::text,
          jsonb_build_object('old', v_old, 'new', v_new, 'reason', NULLIF(btrim(COALESCE(p_reason, '')), ''),
                             'scope_basis', v_basis, 'old_source', CASE WHEN v_person.classification_set_at IS NULL THEN 'legacy' ELSE 'validated' END,
                             'legacy_membership_status', CASE WHEN v_person.classification_set_at IS NULL THEN v_person.membership_status END));
  RETURN jsonb_build_object('person_id', p_person_id, 'changed', true, 'old', v_old, 'scope_basis', v_basis) || person_classification(p_person_id);
END $$;
REVOKE ALL ON FUNCTION public.person_set_classification(uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_set_classification(uuid, text, text, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.person_set_stage(p_person_id uuid, p_stage_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_person people%ROWTYPE; v_basis text; v_stage pipeline_stages%ROWTYPE; v_cur uuid; v_cls text;
BEGIN
  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  v_basis := can_classify_person(p_person_id);
  IF v_basis IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: sem permissão para alterar a etapa desta pessoa' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_stage FROM pipeline_stages WHERE id = p_stage_id AND church_id = v_person.church_id AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'STAGE_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  SELECT stage_id INTO v_cur FROM person_pipeline WHERE person_id = p_person_id AND church_id = v_person.church_id;
  IF v_cur = p_stage_id THEN
    RETURN jsonb_build_object('person_id', p_person_id, 'changed', false) || person_classification(p_person_id);
  END IF;
  v_cls := person_classification_value(p_person_id);
  -- Release 1 (compatibilidade): Não classificado (legado) ainda pode entrar; só VISITANTE definido é bloqueado.
  IF v_stage.requires_classification = 'member' AND v_cls = 'visitor' THEN
    RAISE EXCEPTION 'CLASSIFICATION_REQUIRED: a etapa "%" é só para Membro', v_stage.name USING ERRCODE = 'P0001';
  END IF;
  IF v_stage.requires_classification = 'visitor' AND v_cls = 'member' THEN
    RAISE EXCEPTION 'STAGE_CONFLICT: um Membro não pode ir para a etapa "%"', v_stage.name USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('ekthos.pipeline_write', 'rpc', true);
  PERFORM set_config('ekthos.pipeline_reason', COALESCE(p_reason, ''), true);
  INSERT INTO person_pipeline (id, church_id, person_id, stage_id, entered_at, last_activity_at, created_at, updated_at)
  VALUES (gen_random_uuid(), v_person.church_id, p_person_id, p_stage_id, NOW(), NOW(), NOW(), NOW())
  ON CONFLICT (church_id, person_id) DO UPDATE SET stage_id = EXCLUDED.stage_id, entered_at = NOW(), last_activity_at = NOW(), updated_at = NOW();
  UPDATE people SET pipeline_stage_id = p_stage_id, updated_at = NOW() WHERE id = p_person_id;
  PERFORM set_config('ekthos.pipeline_write', '', true);
  PERFORM set_config('ekthos.pipeline_reason', '', true);
  -- jornada aberta: evento de avanço (mesmo formato do Atendimento)
  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  SELECT j.id, j.church_id, 'stage_advance', auth.uid(), CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END,
         jsonb_build_object('from_stage_id', v_cur, 'to_stage_id', p_stage_id, 'source', 'person_set_stage', 'note', p_reason)
  FROM person_journey j WHERE j.person_id = p_person_id AND j.closed_at IS NULL;
  RETURN jsonb_build_object('person_id', p_person_id, 'changed', true, 'from_stage_id', v_cur, 'scope_basis', v_basis) || person_classification(p_person_id);
END $$;
REVOKE ALL ON FUNCTION public.person_set_stage(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_set_stage(uuid, uuid, text) TO authenticated, service_role;

-- ── 5. Proteções (triggers) ───────────────────────────────────────────────
-- people: classificação só pela RPC; entradas novas: QR/formulários = Visitante definido,
-- declaração "já sou membro" = pendente (Não classificado + auditoria), manual/importação = Não classificado.
CREATE OR REPLACE FUNCTION public.people_guard_classification()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.classification_set_at IS NOT NULL AND current_setting('ekthos.classification_write', true) IS DISTINCT FROM 'rpc' THEN
      NEW.classification_set_at := NULL;   -- ninguém define classificação por INSERT direto
    END IF;
    IF NEW.source::text IN ('qr_code', 'curso_igv', 'oracao', 'gabinete', 'igv_public', 'public_form') THEN
      IF COALESCE(NEW.needs_review, false) AND NEW.person_stage::text = 'frequentador' THEN
        -- "já sou membro" declarado no QR: fica pendente de validação, nunca Membro automático
        NEW.membership_status := NULL; NEW.classification_set_at := NULL;
        INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
        VALUES (NEW.church_id, 'person', NEW.id, 'member_declaration_pending', 'system', COALESCE(auth.jwt()->>'role', 'system'),
                jsonb_build_object('source', NEW.source, 'declared', 'member'));
      ELSE
        NEW.membership_status := 'visitor'; NEW.classification_set_at := NOW();
      END IF;
    ELSIF NEW.classification_set_at IS NULL THEN
      -- manual (a tela decide pela RPC logo após) e importações: Não classificado
      NEW.classification_set_at := NULL;
    END IF;
    RETURN NEW;
  END IF;
  -- UPDATE: a classificação só muda pela RPC
  IF (NEW.membership_status IS DISTINCT FROM OLD.membership_status OR NEW.classification_set_at IS DISTINCT FROM OLD.classification_set_at)
     AND current_setting('ekthos.classification_write', true) IS DISTINCT FROM 'rpc' THEN
    IF OLD.classification_set_at IS NULL AND NEW.classification_set_at IS NULL THEN
      -- valor legado sendo tocado por escritor antigo: ignora a mudança, mantém o legado
      NEW.membership_status := OLD.membership_status;
    ELSE
      RAISE EXCEPTION 'CLASSIFICATION_DIRECT_WRITE: use person_set_classification' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS people_guard_classification ON public.people;
CREATE TRIGGER people_guard_classification BEFORE INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_guard_classification();

-- person_pipeline: escrita só por RPC (ou service_role, para as Edge Functions blindadas);
-- etapa contraditória bloqueada em qualquer caminho; mudança sem alteração real não reinicia entered_at.
CREATE OR REPLACE FUNCTION public.person_pipeline_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_req text; v_cls text; v_name text;
BEGIN
  IF current_setting('ekthos.pipeline_write', true) IS DISTINCT FROM 'rpc' AND COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'PIPELINE_DIRECT_WRITE: use person_set_stage' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.stage_id = OLD.stage_id THEN
    NEW.entered_at := OLD.entered_at;        -- nada mudou: não reinicia o tempo na etapa
    RETURN NEW;
  END IF;
  SELECT requires_classification, name INTO v_req, v_name FROM pipeline_stages WHERE id = NEW.stage_id;
  v_cls := person_classification_value(NEW.person_id);
  IF v_req = 'member' AND v_cls = 'visitor' THEN   -- Release 1: legado (NULL) tolerado
    RAISE EXCEPTION 'CLASSIFICATION_REQUIRED: a etapa "%" é só para Membro', v_name USING ERRCODE = 'P0001';
  END IF;
  IF v_req = 'visitor' AND v_cls = 'member' THEN
    RAISE EXCEPTION 'STAGE_CONFLICT: um Membro não pode ir para a etapa "%"', v_name USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS person_pipeline_guard ON public.person_pipeline;
CREATE TRIGGER person_pipeline_guard BEFORE INSERT OR UPDATE ON public.person_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.person_pipeline_guard();

-- histórico de etapa em qualquer caminho (RPC, Atendimento, QR)
CREATE OR REPLACE FUNCTION public.person_pipeline_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN
    INSERT INTO pipeline_history (church_id, person_id, from_stage_id, to_stage_id, moved_at, moved_by, notes)
    VALUES (NEW.church_id, NEW.person_id, CASE WHEN TG_OP = 'UPDATE' THEN OLD.stage_id END, NEW.stage_id, NOW(), auth.uid(),
            NULLIF(current_setting('ekthos.pipeline_reason', true), ''));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS person_pipeline_history ON public.person_pipeline;
CREATE TRIGGER person_pipeline_history AFTER INSERT OR UPDATE OF stage_id ON public.person_pipeline
  FOR EACH ROW EXECUTE FUNCTION public.person_pipeline_history();

-- Voluntário e Líder pressupõem Membro (só em novas designações/ativações; vínculos existentes não são tocados)
CREATE OR REPLACE FUNCTION public.role_requires_member()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_person uuid; v_what text;
BEGIN
  IF TG_TABLE_NAME = 'volunteers' THEN
    IF (TG_OP = 'INSERT' AND NEW.is_active) OR (TG_OP = 'UPDATE' AND NEW.is_active AND NOT COALESCE(OLD.is_active, false)) THEN
      v_person := NEW.person_id; v_what := 'voluntário';
    END IF;
  ELSIF TG_TABLE_NAME = 'ministries' THEN
    IF NEW.leader_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.leader_id IS DISTINCT FROM OLD.leader_id) THEN
      v_person := NEW.leader_id; v_what := 'líder de ministério';
    END IF;
  ELSIF TG_TABLE_NAME = 'ministry_members' THEN
    IF NEW.role::text IN ('lider', 'coordenador') AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role) THEN
      v_person := NEW.person_id; v_what := NEW.role::text || ' de ministério';
    END IF;
  ELSIF TG_TABLE_NAME = 'groups' THEN
    IF NEW.leader_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.leader_id IS DISTINCT FROM OLD.leader_id) THEN
      v_person := NEW.leader_id; v_what := 'líder de célula';
    ELSIF NEW.co_leader_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.co_leader_id IS DISTINCT FROM OLD.co_leader_id) THEN
      v_person := NEW.co_leader_id; v_what := 'vice-líder de célula';
    END IF;
  END IF;
  -- Release 1: bloqueia só VISITANTE definido; Não classificado (legado) continua podendo ser designado até a migração
  IF v_person IS NOT NULL AND person_classification_value(v_person) = 'visitor' THEN
    RAISE EXCEPTION 'CLASSIFICATION_REQUIRED: só um Membro pode ser %', v_what USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS volunteers_requires_member ON public.volunteers;
CREATE TRIGGER volunteers_requires_member BEFORE INSERT OR UPDATE OF is_active ON public.volunteers FOR EACH ROW EXECUTE FUNCTION public.role_requires_member();
DROP TRIGGER IF EXISTS ministries_leader_requires_member ON public.ministries;
CREATE TRIGGER ministries_leader_requires_member BEFORE INSERT OR UPDATE OF leader_id ON public.ministries FOR EACH ROW EXECUTE FUNCTION public.role_requires_member();
DROP TRIGGER IF EXISTS ministry_members_leader_requires_member ON public.ministry_members;
CREATE TRIGGER ministry_members_leader_requires_member BEFORE INSERT OR UPDATE OF role ON public.ministry_members FOR EACH ROW EXECUTE FUNCTION public.role_requires_member();
DROP TRIGGER IF EXISTS groups_leader_requires_member ON public.groups;
CREATE TRIGGER groups_leader_requires_member BEFORE INSERT OR UPDATE OF leader_id, co_leader_id ON public.groups FOR EACH ROW EXECUTE FUNCTION public.role_requires_member();

-- Etiquetas de tipo (person_type) deixam de ser atribuídas (as existentes ficam só para leitura)
CREATE OR REPLACE FUNCTION public.person_tags_block_person_type()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM tags t WHERE t.id = NEW.tag_id AND t.category = 'person_type') THEN
    RAISE EXCEPTION 'PERSON_TYPE_TAG_DEPRECATED: a classificação é definida por person_set_classification' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS person_tags_block_person_type ON public.person_tags;
CREATE TRIGGER person_tags_block_person_type BEFORE INSERT ON public.person_tags FOR EACH ROW EXECUTE FUNCTION public.person_tags_block_person_type();


-- ============================================================
-- 6. Funções existentes adaptadas (definições de produção + patch mínimo)
-- ============================================================

-- journey_register_attendance: autoriza sua própria escrita de etapa (a guarda person_pipeline_guard valida a classificação)
CREATE OR REPLACE FUNCTION public.journey_register_attendance(p_person_id uuid, p_expected_version integer DEFAULT NULL::integer, p_people_updates jsonb DEFAULT '{}'::jsonb, p_contact_channel text DEFAULT 'presencial'::text, p_contact_result text DEFAULT 'realizado'::text, p_contact_notes text DEFAULT NULL::text, p_contact_date timestamp with time zone DEFAULT now(), p_new_stage_id uuid DEFAULT NULL::uuid, p_next_step text DEFAULT NULL::text, p_next_step_due_at date DEFAULT NULL::date, p_ministry_id uuid DEFAULT NULL::uuid, p_close_journey boolean DEFAULT NULL::boolean, p_register_contact boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_person          people%ROWTYPE;
  v_journey         person_journey%ROWTYPE;
  v_actor_id        uuid;
  v_prev_stage      uuid;
  v_has_stage_change boolean;
  v_should_close    boolean;
  v_leader_user_id  uuid;
  v_ministry_name   text;
  v_person_name     text;
BEGIN
  v_actor_id := auth.uid();
  PERFORM set_config('ekthos.pipeline_write', 'rpc', true);   -- Release 1: escrita de etapa autorizada por esta RPC

  -- Outcomes que encerram a jornada
  v_should_close := COALESCE(p_close_journey, FALSE)
                 OR p_contact_result IN ('nao_quer_contato', 'mudou_de_igreja');

  SELECT * INTO v_person FROM people WHERE id = p_person_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  -- ── Autorização (validada no banco; a tela não é barreira) ──────────────
  -- Permitido: service_role; ou usuário autenticado da MESMA igreja da pessoa
  -- (tenant efetivo, cobre impersonação) com perfil autorizado a atender.
  -- Negado: anon, outra igreja, perfil não listado (volunteer, ministry_leader, treasurer…).
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF v_actor_id IS NULL
       OR auth_church_id() IS NULL
       OR v_person.church_id <> auth_church_id()
       OR COALESCE(auth_user_role()::text, '') NOT IN ('admin','admin_departments','pastor_celulas','supervisor','cell_leader','secretary') THEN
      RAISE EXCEPTION 'FORBIDDEN: sem permissão para registrar este atendimento' USING ERRCODE = '42501';
    END IF;
  END IF;

  v_person_name := COALESCE(
    NULLIF(TRIM(COALESCE(v_person.first_name,'') || ' ' || COALESCE(v_person.last_name,'')), ''),
    v_person.name
  );

  -- 1. Atualiza campos da pessoa (nunca sobrescreve valor existente com vazio)
  UPDATE people SET
    neighborhood          = COALESCE(NULLIF(p_people_updates->>'neighborhood',''),          neighborhood),
    city                  = COALESCE(NULLIF(p_people_updates->>'city',''),                  city),
    como_conheceu         = COALESCE(NULLIF(p_people_updates->>'como_conheceu',''),         como_conheceu),
    phone                 = COALESCE(NULLIF(p_people_updates->>'phone',''),                 phone),
    marital_status        = COALESCE(NULLIF(p_people_updates->>'marital_status',''),        marital_status),
    observacoes_pastorais = COALESCE(NULLIF(p_people_updates->>'observacoes_pastorais',''), observacoes_pastorais),
    birth_date = CASE
      WHEN p_people_updates ? 'birth_date' AND NULLIF(p_people_updates->>'birth_date','') IS NOT NULL
        THEN (p_people_updates->>'birth_date')::date
      ELSE birth_date
    END,
    updated_at = NOW()
  WHERE id = p_person_id;

  -- 2. Localiza jornada ativa
  SELECT * INTO v_journey
  FROM person_journey
  WHERE person_id = p_person_id AND closed_at IS NULL
  ORDER BY opened_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Sem jornada aberta e sem etapa: não pode haver sucesso silencioso sem contato
    IF p_new_stage_id IS NULL THEN
      RAISE EXCEPTION 'JOURNEY_REQUIRED'
        USING ERRCODE = 'P0001',
              HINT = 'Pessoa sem jornada aberta: informe a etapa para abrir a jornada e registrar o contato';
    END IF;
    IF p_new_stage_id IS NOT NULL THEN
      INSERT INTO person_journey (person_id, church_id, stage_id, owner_id, agent_locked_at, version,
                                  next_step, next_step_due_at, ministry_id)
      VALUES (p_person_id, v_person.church_id, p_new_stage_id, v_actor_id, NOW(), 1,
              NULLIF(p_next_step,''), p_next_step_due_at, p_ministry_id)
      RETURNING * INTO v_journey;

      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'journey_opened', v_actor_id, 'human',
        jsonb_build_object('stage_id', p_new_stage_id, 'source', 'attendance_registration'));
    END IF;

  ELSE
    IF p_expected_version IS NOT NULL AND v_journey.version != p_expected_version THEN
      RAISE EXCEPTION 'JOURNEY_VERSION_CONFLICT';
    END IF;

    v_prev_stage      := v_journey.stage_id;
    v_has_stage_change := p_new_stage_id IS NOT NULL AND p_new_stage_id <> v_prev_stage;

    UPDATE person_journey SET
      stage_id         = COALESCE(p_new_stage_id, stage_id),
      owner_id         = CASE WHEN owner_id IS NULL THEN v_actor_id ELSE owner_id END,
      ministry_id      = COALESCE(p_ministry_id, ministry_id),
      next_step        = CASE WHEN NULLIF(p_next_step,'') IS NOT NULL THEN p_next_step ELSE next_step END,
      next_step_due_at = CASE
                           WHEN v_has_stage_change THEN p_next_step_due_at
                           WHEN p_next_step_due_at IS NOT NULL THEN p_next_step_due_at
                           ELSE next_step_due_at
                         END,
      closed_at        = CASE WHEN v_should_close THEN NOW() ELSE closed_at END,
      outcome          = CASE WHEN v_should_close THEN p_contact_result ELSE outcome END,
      version          = version + 1,
      updated_at       = NOW()
    WHERE id = v_journey.id
    RETURNING * INTO v_journey;

    IF v_has_stage_change THEN
      INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
      VALUES (v_journey.id, v_person.church_id, 'stage_advance', v_actor_id, 'human',
        jsonb_build_object(
          'from_stage_id', v_prev_stage,
          'to_stage_id',   p_new_stage_id,
          'source',        'attendance_registration'
        ));
    END IF;
  END IF;

  -- 3. Sincroniza Kanban (person_pipeline + people.pipeline_stage_id)
  IF p_new_stage_id IS NOT NULL AND v_journey.id IS NOT NULL THEN
    INSERT INTO person_pipeline (id, church_id, person_id, stage_id,
                                 entered_at, last_activity_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_person.church_id, p_person_id, p_new_stage_id,
            NOW(), NOW(), NOW(), NOW())
    ON CONFLICT (church_id, person_id)
    DO UPDATE SET
      stage_id         = EXCLUDED.stage_id,
      last_activity_at = NOW(),
      updated_at       = NOW();

    UPDATE people
    SET pipeline_stage_id = p_new_stage_id, updated_at = NOW()
    WHERE id = p_person_id;
  END IF;

  -- 4. Registra evento de contato pastoral — SOMENTE quando houve contato de fato
  --    (p_register_contact). Salvar correções sem contato não cria pastoral_contact
  --    nem avança a numeração. A sequência de contatos continua ilimitada.
  IF v_journey.id IS NOT NULL AND p_register_contact THEN
    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (v_journey.id, v_person.church_id, 'pastoral_contact', v_actor_id, 'human',
      jsonb_build_object(
        'channel',      p_contact_channel,
        'result',       p_contact_result,
        'notes',        p_contact_notes,
        'contact_date', p_contact_date
      ));
  END IF;

  -- 5. Encaminhamento para ministério — evento + notificação para o líder (E7)
  IF p_ministry_id IS NOT NULL AND v_journey.id IS NOT NULL THEN
    SELECT name INTO v_ministry_name FROM ministries WHERE id = p_ministry_id;

    INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
    VALUES (v_journey.id, v_person.church_id, 'ministry_referral', v_actor_id, 'human',
      jsonb_build_object(
        'ministry_id',   p_ministry_id,
        'ministry_name', v_ministry_name
      ));

    -- Notificar a conta vinculada ao ministério (ministries.leader_user_id).
    -- Sem conta vinculada = "sem conta de líder": ninguém é notificado.
    -- Não procura conta pelo e-mail da pessoa líder (leader_id).
    SELECT m.leader_user_id INTO v_leader_user_id
    FROM ministries m
    WHERE m.id = p_ministry_id
      AND m.church_id = v_person.church_id;

    IF v_leader_user_id IS NOT NULL THEN
      INSERT INTO notifications (church_id, user_id, title, body, type, read, link, person_id)
      VALUES (
        v_person.church_id,
        v_leader_user_id,
        'Novo encaminhamento para o ministério',
        COALESCE(v_person_name, 'Uma pessoa') || ' foi encaminhada para ' || COALESCE(v_ministry_name, 'o seu ministério'),
        'ministry_referral',
        false,
        '/ministerios?tab=fila',   -- abre a Fila de Encaminhamentos (a conta do líder não acessa o Atendimento)
        p_person_id
      );
    END IF;
  END IF;

  PERFORM set_config('ekthos.pipeline_write', '', true);
  RETURN jsonb_build_object(
    'person_id',      p_person_id,
    'journey_id',     v_journey.id,
    'stage_id',       v_journey.stage_id,
    'version',        v_journey.version,
    'owner_id',       v_journey.owner_id,
    'journey_closed', v_should_close AND v_journey.id IS NOT NULL
  );
END;
$function$
;

-- capture_visitor_to_pipeline (QR): etapa de entrada só para quem não tem etapa; nunca altera classificação
CREATE OR REPLACE FUNCTION public.capture_visitor_to_pipeline(p_church_id uuid, p_person_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_stage_id uuid;
BEGIN
  PERFORM set_config('ekthos.pipeline_write', 'rpc', true);
  SELECT id INTO v_stage_id
  FROM pipeline_stages
  WHERE church_id     = p_church_id
    AND is_entry_point = true
    AND is_active      = true
  ORDER BY order_index ASC
  LIMIT 1;

  IF v_stage_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO person_pipeline (church_id, person_id, stage_id)
  VALUES (p_church_id, p_person_id, v_stage_id)
  ON CONFLICT (church_id, person_id) DO NOTHING;

  PERFORM set_config('ekthos.pipeline_write', '', true);
  RETURN v_stage_id;
END;
$function$
;

DROP FUNCTION IF EXISTS public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text);
CREATE OR REPLACE FUNCTION public.people_filter_base(p_church_id uuid, p_unit_id text DEFAULT NULL::text, p_stage_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, created_at timestamp with time zone, birth_day integer, name_sort text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH cfg AS (
    SELECT (SELECT c.unit_cutoff_date FROM churches c WHERE c.id = p_church_id) AS cutoff,
           NULLIF(extensions.unaccent(lower(trim(COALESCE(p_search, '')))), '') AS q
  )
  SELECT p.id, p.created_at, p.birth_day, p.name_sort
  FROM people p
  CROSS JOIN cfg
  LEFT JOIN person_pipeline pp ON pp.person_id = p.id
  LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
  WHERE p.church_id = p_church_id
    AND p.deleted_at IS NULL
    AND p.left_at IS NULL
    AND people_unit_scope_ok(p.unit_id, p.created_at, cfg.cutoff, p_unit_id)
    AND (p_stage_key IS NULL
         OR (p_stage_key = '__none' AND pp.id IS NULL)
         OR (ps.stage_key = p_stage_key
             -- aba/etapa Visitante nunca lista um Membro identificado (classificação efetiva)
             AND NOT (p_stage_key = 'visitante' AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'member'))))
    AND (p_stage IS NULL OR p.person_stage::text = p_stage)
    AND (p_source IS NULL OR p.source::text = p_source)
    AND (p_tag_id IS NULL OR EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p.id AND pt.tag_id = p_tag_id))
    AND (p_birth_month IS NULL OR p.birth_month = p_birth_month)
    AND (p_date_from IS NULL OR p.first_visit_date >= p_date_from)
    AND (p_date_to   IS NULL OR p.first_visit_date <= p_date_to)
    AND (p_created_from IS NULL OR p.created_at::date >= p_created_from)
    AND (p_created_to   IS NULL OR p.created_at::date <= p_created_to)
    -- Classificação vigente (fonte única) e funções derivadas
    AND (p_classification IS NULL
         OR (p_classification = 'none'   AND p.id NOT IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls IS NOT NULL))
         OR (p_classification IN ('visitor', 'member') AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = p_classification)))
    AND (p_role IS NULL
         OR (p_role = 'member_only'      AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'member' AND pc.roles = '[]'::jsonb))
         OR (p_role = 'volunteer'        AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.roles @> '[{"role":"volunteer"}]'))
         OR (p_role = 'leader'           AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.roles @> '[{"role":"leader"}]'))
         OR (p_role = 'leader_volunteer' AND p.id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.roles @> '[{"role":"leader"}]' AND pc.roles @> '[{"role":"volunteer"}]')))
    AND (cfg.q IS NULL
         OR p.name_sort ILIKE '%' || cfg.q || '%'
         OR p.phone ILIKE '%' || cfg.q || '%'
         OR p.email ILIKE '%' || cfg.q || '%')
$function$
;
REVOKE ALL ON FUNCTION public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.people_filter_base(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) TO service_role;

DROP FUNCTION IF EXISTS public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer);
CREATE OR REPLACE FUNCTION public.get_people_page(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS TABLE(row_data jsonb, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM assert_church_access(p_church_id);

  RETURN QUERY
  WITH filtered AS (
    SELECT b.id, b.created_at, b.birth_day, b.name_sort
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
    WHERE p_care_status IS NULL
       -- Estado (mesma regra do contador e da etiqueta)
       OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado')
           AND person_care_state(b.id) = p_care_status)
       -- Alerta operacional (separado dos estados)
       OR (p_care_status = 'sem_contato_48h' AND person_care_alert(b.id))
  ),
  total AS (SELECT COUNT(*) AS cnt FROM filtered),
  paged_ids AS (
    SELECT id FROM filtered
    ORDER BY
      CASE WHEN p_birth_month IS NOT NULL THEN birth_day END ASC NULLS LAST,
      CASE WHEN p_birth_month IS NOT NULL THEN name_sort END ASC,
      created_at DESC, id DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT
    (to_jsonb(p) || jsonb_build_object(
      'care_state', person_care_state(p.id),
      'care_alert', person_care_alert(p.id),
      'classification', person_classification(p.id),
      'acolhimento_journey', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object('id',aj.id,'status',aj.status,'updated_at',aj.updated_at,'started_at',aj.started_at))
         FROM acolhimento_journey aj WHERE aj.person_id = p.id), '[]'::jsonb),
      'person_pipeline', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
           'stage_id',pp.stage_id,'last_activity_at',pp.last_activity_at,'entered_at',pp.entered_at,
           'pipeline_stages',(SELECT to_jsonb(ps) FROM pipeline_stages ps WHERE ps.id = pp.stage_id)))
         FROM person_pipeline pp WHERE pp.person_id = p.id), '[]'::jsonb),
      'person_tags', COALESCE(
        (SELECT jsonb_agg(jsonb_build_object(
           'tag_id',pt.tag_id,
           'tags',(SELECT to_jsonb(t) FROM tags t WHERE t.id = pt.tag_id)))
         FROM person_tags pt WHERE pt.person_id = p.id), '[]'::jsonb)
    )) AS row_data,
    (SELECT cnt FROM total) AS total_count
  FROM paged_ids pi
  JOIN people p ON p.id = pi.id
  ORDER BY
    CASE WHEN p_birth_month IS NOT NULL THEN p.birth_day END ASC NULLS LAST,
    CASE WHEN p_birth_month IS NOT NULL THEN p.name_sort END ASC,
    p.created_at DESC, p.id DESC;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_people_page(uuid, text, text, text, text, text, date, date, integer, integer, date, date, text, uuid, integer, text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text);
CREATE OR REPLACE FUNCTION public.get_care_status_counts(p_church_id uuid, p_unit_id text DEFAULT NULL::text, p_stage_key text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_search text DEFAULT NULL::text, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM assert_church_access(p_church_id);

  WITH base AS (
    SELECT b.id, person_care_state(b.id) AS st, person_care_alert(b.id) AS alert
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
  )
  SELECT jsonb_build_object(
    'nao_atendida',    (SELECT COUNT(*) FROM base WHERE st = 'nao_atendida'),
    'em_atendimento',  (SELECT COUNT(*) FROM base WHERE st = 'em_atendimento'),
    'atendida',        (SELECT COUNT(*) FROM base WHERE st = 'atendida'),
    'cancelado',       (SELECT COUNT(*) FROM base WHERE st = 'cancelado'),
    'total',           (SELECT COUNT(*) FROM base),
    'sem_contato_48h', (SELECT COUNT(*) FROM base WHERE alert),
    'alert_threshold_hours', EXTRACT(EPOCH FROM care_alert_threshold())::int / 3600
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;
REVOKE ALL ON FUNCTION public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_care_status_counts(uuid, text, text, text, text, uuid, integer, date, date, date, date, text, text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer);
CREATE OR REPLACE FUNCTION public.export_people_rows(p_church_id uuid, p_care_status text DEFAULT NULL::text, p_unit_id text DEFAULT NULL::text, p_stage text DEFAULT NULL::text, p_source text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_created_from date DEFAULT NULL::date, p_created_to date DEFAULT NULL::date, p_stage_key text DEFAULT NULL::text, p_tag_id uuid DEFAULT NULL::uuid, p_birth_month integer DEFAULT NULL::integer, p_classification text DEFAULT NULL::text, p_role text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_cutoff date;
BEGIN
  PERFORM assert_church_access(p_church_id);
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  WITH filtered AS (
    -- Exatamente o universo de get_people_page (mesmos filtros + estado/alerta)
    SELECT b.id, b.created_at, b.name_sort
    FROM people_filter_base(p_church_id, p_unit_id, p_stage_key, p_stage, p_source, p_tag_id, p_birth_month,
                            p_date_from, p_date_to, p_created_from, p_created_to, p_search, p_classification, p_role) b
    WHERE p_care_status IS NULL
       OR (p_care_status IN ('nao_atendida', 'em_atendimento', 'atendida', 'cancelado')
           AND person_care_state(b.id) = p_care_status)
       OR (p_care_status = 'sem_contato_48h' AND person_care_alert(b.id))
  ),
  contacts AS (
    -- Um item por pastoral_contact real, ordem canônica de get_person_contacts
    SELECT pj.person_id,
           je.id AS event_id,
           ROW_NUMBER() OVER (PARTITION BY pj.person_id ORDER BY je.created_at, je.payload ->> 'contact_date', je.id) AS ordinal,
           COALESCE(
             CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
                  THEN (je.payload ->> 'contact_date')::timestamptz END,
             je.created_at) AS contact_date,
           je.payload ->> 'result'  AS result,
           je.payload ->> 'channel' AS channel,
           NULLIF(je.payload ->> 'notes', '') AS notes,
           je.actor_id,
           COALESCE(
             pr.name, pr.display_name,
             au.raw_user_meta_data ->> 'full_name', au.email,
             CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
           )::text AS actor_name
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    LEFT JOIN auth.users au ON au.id      = je.actor_id
    LEFT JOIN profiles   pr ON pr.user_id = je.actor_id
    WHERE pj.church_id = p_church_id
      AND je.event_type = 'pastoral_contact'
      AND pj.person_id IN (SELECT id FROM filtered)
  ),
  contacts_agg AS (
    SELECT person_id,
           COUNT(*) AS n,
           jsonb_agg(jsonb_build_object(
             'ordinal', ordinal, 'event_id', event_id, 'contact_date', contact_date,
             'result', result, 'channel', channel, 'notes', notes,
             'actor_id', actor_id, 'actor_name', actor_name) ORDER BY ordinal) AS items
    FROM contacts GROUP BY person_id
  ),
  ministries_agg AS (
    SELECT mm.person_id, string_agg(m.name, ' | ' ORDER BY m.name, m.id) AS nomes
    FROM ministry_members mm
    JOIN ministries m ON m.id = mm.ministry_id
    WHERE mm.church_id = p_church_id AND m.church_id = p_church_id
      AND mm.person_id IN (SELECT id FROM filtered)
    GROUP BY mm.person_id
  ),
  roles_agg AS (
    SELECT s.person_id, jsonb_agg(s.r ORDER BY (s.r->>'role') = 'leader' DESC, s.r->>'ref_name') AS roles
    FROM (
      SELECT m.leader_id AS person_id, jsonb_build_object('role','leader','basis','ministry_leader','ref_id',m.id,'ref_name',m.name) AS r
        FROM ministries m WHERE m.church_id = p_church_id AND m.is_active IS NOT FALSE AND m.leader_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT mm.person_id, jsonb_build_object('role','leader','basis','ministry_' || mm.role::text,'ref_id',m.id,'ref_name',m.name)
        FROM ministry_members mm JOIN ministries m ON m.id = mm.ministry_id
       WHERE mm.church_id = p_church_id AND mm.role::text IN ('lider','coordenador') AND m.is_active IS NOT FALSE AND mm.person_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT g.leader_id, jsonb_build_object('role','leader','basis','cell_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND COALESCE(g.status,'active') NOT IN ('inactive','archived') AND g.leader_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT g.co_leader_id, jsonb_build_object('role','leader','basis','cell_co_leader','ref_id',g.id,'ref_name',g.name)
        FROM groups g WHERE g.church_id = p_church_id AND COALESCE(g.status,'active') NOT IN ('inactive','archived') AND g.co_leader_id IN (SELECT id FROM filtered)
      UNION ALL
      SELECT v.person_id, jsonb_build_object('role','volunteer','basis','volunteer_active','ref_id',v.id,'ref_name',COALESCE(m.name, v.role, 'Voluntário'))
        FROM volunteers v LEFT JOIN ministries m ON m.id = v.ministry_id
       WHERE v.church_id = p_church_id AND v.is_active = true AND v.person_id IN (SELECT id FROM filtered)
    ) s GROUP BY s.person_id
  ),
  legacy_cls AS (
    -- derivada do legado em lote (mesma regra de person_legacy_classification)
    SELECT f.id AS person_id,
      CASE
        WHEN EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = f.id AND t.category = 'person_type' AND t.name = 'Membro')
          OR EXISTS (SELECT 1 FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = f.id AND ps.stage_key IN ('membro','membro_afastado','lider','voluntario'))
          OR EXISTS (SELECT 1 FROM roles_agg ra WHERE ra.person_id = f.id)
          OR EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.person_id = f.id AND mm.role::text IN ('lider','coordenador'))
        THEN 'member'
        WHEN EXISTS (SELECT 1 FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = f.id AND t.category = 'person_type' AND t.name = 'Visitante')
          OR EXISTS (SELECT 1 FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = f.id AND ps.stage_key = 'visitante')
        THEN 'visitor'
      END AS cls
    FROM filtered f
  ),
  rows_ AS (
    SELECT jsonb_build_object(
      'id',               p.id,
      'name',             p.name,
      'phone',            p.phone,
      'email',            p.email,
      'etapa',            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id
                            WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
      'care_state',       person_care_state(p.id),
      'care_alert',       person_care_alert(p.id),
      'classification',   person_classification_build(
                            COALESCE(CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor','member') THEN p.membership_status END, lg.cls),
                            COALESCE(ra.roles, '[]'::jsonb),
                            (SELECT ps.stage_key FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
                            (SELECT ps.name FROM person_pipeline pp JOIN pipeline_stages ps ON ps.id = pp.stage_id WHERE pp.person_id = p.id AND pp.church_id = p_church_id LIMIT 1),
                            CASE WHEN p.classification_set_at IS NOT NULL AND p.membership_status IN ('visitor','member') THEN 'validated' WHEN lg.cls IS NOT NULL THEN 'legacy' END),
      -- Unidade OPERACIONAL canônica (mesma regra do filtro da tela: people_operational_unit + cutoff da igreja).
      -- unit_id cadastral é mantido só como referência; a coluna "Unidade" do CSV usa unit_name (operacional).
      'unit_id',          p.unit_id,
      'unit_operational_id', people_operational_unit(p.unit_id, p.created_at, v_cutoff),
      'unit_name',        (SELECT cu.name FROM church_units cu WHERE cu.id = people_operational_unit(p.unit_id, p.created_at, v_cutoff)),
      'first_visit_date', p.first_visit_date,
      'created_at',       p.created_at,
      'source',           p.source,
      'ministerios',      COALESCE(ma.nomes, ''),
      'contacts_count',   COALESCE(ca.n, 0),
      'contacts',         COALESCE(ca.items, '[]'::jsonb)
    ) AS row_, p.created_at, p.id
    FROM filtered f
    JOIN people p ON p.id = f.id
    LEFT JOIN contacts_agg  ca ON ca.person_id = p.id
    LEFT JOIN ministries_agg ma ON ma.person_id = p.id
    LEFT JOIN roles_agg ra ON ra.person_id = p.id
    LEFT JOIN legacy_cls lg ON lg.person_id = p.id
  )
  SELECT jsonb_build_object(
    'total',        (SELECT COUNT(*) FROM rows_),
    'max_contacts', COALESCE((SELECT MAX(n) FROM contacts_agg), 0),
    'alert_threshold_hours', EXTRACT(EPOCH FROM care_alert_threshold())::int / 3600,
    'rows',         COALESCE((SELECT jsonb_agg(row_ ORDER BY created_at DESC, id DESC) FROM rows_), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;
REVOKE ALL ON FUNCTION public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.export_people_rows(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_people_stage_counts(p_church_id uuid, p_unit_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cutoff date;
  v_month  int := EXTRACT(MONTH FROM CURRENT_DATE);
  v_result jsonb;
BEGIN
  PERFORM assert_church_access(p_church_id);
  SELECT unit_cutoff_date INTO v_cutoff FROM churches WHERE id = p_church_id;

  WITH base AS (
    SELECT p.id, p.birth_month, ps.id AS stage_id, ps.stage_key
    FROM people p
    LEFT JOIN person_pipeline pp ON pp.person_id = p.id
    LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id)
  )
  SELECT jsonb_build_object(
    'total',        (SELECT COUNT(*) FROM base),
    'aniversarios', (SELECT COUNT(*) FROM base WHERE birth_month = v_month),
    'sem_etapa',    (SELECT COUNT(*) FROM base WHERE stage_id IS NULL),
    'classificacao', (SELECT jsonb_build_object(
        'visitor',          COUNT(*) FILTER (WHERE cls = 'visitor'),
        'member',           COUNT(*) FILTER (WHERE cls = 'member'),
        'none',             COUNT(*) FILTER (WHERE cls IS NULL),
        'member_only',      COUNT(*) FILTER (WHERE cls = 'member' AND roles = '[]'::jsonb),
        'leader',           COUNT(*) FILTER (WHERE roles @> '[{"role":"leader"}]'),
        'volunteer',        COUNT(*) FILTER (WHERE roles @> '[{"role":"volunteer"}]'),
        'leader_volunteer', COUNT(*) FILTER (WHERE roles @> '[{"role":"leader"}]' AND roles @> '[{"role":"volunteer"}]'))
      FROM (SELECT pc.cls, pc.roles FROM base JOIN person_classification_rows(p_church_id) pc ON pc.person_id = base.id) b),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'stage_id', s.id, 'stage_key', s.stage_key, 'name', s.name,
               'order_index', s.order_index, 'cnt', COALESCE(c.cnt, 0))
             ORDER BY s.order_index)
      FROM pipeline_stages s
      LEFT JOIN (SELECT stage_id, COUNT(*) cnt FROM base WHERE stage_id IS NOT NULL
                   AND NOT (stage_key = 'visitante' AND id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'member'))   -- badge Visitante sem Membros identificados
                 GROUP BY stage_id) c
             ON c.stage_id = s.id
      WHERE s.church_id = p_church_id AND s.is_active
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;

-- Dashboard: "membros" e "visitantes" passam a ser a classificação canônica (etapas continuam em por_etapa)
CREATE OR REPLACE FUNCTION public.get_dashboard_people_stats(p_church_id uuid, p_unit_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_q_start date := date_trunc('quarter', CURRENT_DATE)::date;
BEGIN
  PERFORM assert_church_access(p_church_id);
  WITH base AS (
    SELECT p.id, p.created_at, p.first_visit_date, p.baptized, p.baptism_date,
           p.last_contact_at, p.name, p.first_name, p.last_name, p.celula_id,
           ps.id AS stage_id, ps.stage_key, ps.name AS stage_name, ps.order_index,
           ps.sla_hours, pp.entered_at
    FROM people p
    LEFT JOIN person_pipeline pp ON pp.person_id = p.id
    LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
    WHERE p.church_id = p_church_id
      AND p.deleted_at IS NULL
      AND p.left_at IS NULL
      AND people_unit_scope_ok(p.unit_id, p.created_at, church_unit_cutoff(p_church_id), p_unit_id)
  ),
  contacted AS (
    SELECT DISTINCT pj.person_id
    FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id
    WHERE pj.church_id = p_church_id AND je.event_type = 'pastoral_contact'
  ),
  recent90 AS (SELECT * FROM base WHERE created_at >= NOW() - INTERVAL '90 days'),
  grupos AS (
    SELECT g.id, g.name, g.status, g.created_at
    FROM groups g
    WHERE g.church_id = p_church_id
      AND (p_unit_id IS NULL OR (p_unit_id = 'none' AND g.unit_id IS NULL)
           OR (p_unit_id <> 'none' AND g.unit_id = p_unit_id::uuid))
  ),
  membros_celula AS (
    SELECT celula_id, COUNT(*) AS n FROM base WHERE celula_id IS NOT NULL GROUP BY celula_id
  )
  SELECT jsonb_build_object(
    'total',              (SELECT COUNT(*) FROM base),
    'sem_etapa',          (SELECT COUNT(*) FROM base WHERE stage_id IS NULL),
    'novos_semana',       (SELECT COUNT(*) FROM base WHERE created_at >= NOW() - INTERVAL '7 days'),
    'visitantes_30d',     (SELECT COUNT(*) FROM base WHERE id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'visitor')
                             AND (first_visit_date >= CURRENT_DATE - 30
                                  OR (first_visit_date IS NULL AND created_at >= NOW() - INTERVAL '30 days'))),
    'membros',            (SELECT COUNT(*) FROM base WHERE id IN (SELECT pc.person_id FROM person_classification_rows(p_church_id) pc WHERE pc.cls = 'member')),
    'novos_convertidos',  (SELECT COUNT(*) FROM base WHERE stage_key = 'novo_convertido'),
    'novos_convertidos_30d', (SELECT COUNT(*) FROM base WHERE stage_key = 'novo_convertido'
                             AND entered_at >= NOW() - INTERVAL '30 days'),
    'escola_da_fe',       (SELECT COUNT(*) FROM base WHERE stage_key = 'escola_da_fe'),
    'batismos_trimestre', (SELECT COUNT(*) FROM base WHERE baptized AND baptism_date >= v_q_start),
    'parados',            (SELECT COUNT(*) FROM base WHERE stage_id IS NOT NULL
                             AND entered_at <= NOW() - (COALESCE(sla_hours, 720) || ' hours')::interval),
    'consolidacao_90d',   (SELECT CASE WHEN COUNT(*) = 0 THEN 0
                             ELSE ROUND(100.0 * COUNT(*) FILTER (WHERE stage_id IS NOT NULL AND stage_key <> 'visitante') / COUNT(*)) END
                           FROM recent90),
    'por_etapa', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('stage_id', s.id, 'stage_key', s.stage_key, 'name', s.name,
                                          'order_index', s.order_index, 'cnt', COALESCE(c.cnt, 0))
                       ORDER BY s.order_index)
      FROM pipeline_stages s
      LEFT JOIN (SELECT stage_id, COUNT(*) cnt FROM base WHERE stage_id IS NOT NULL GROUP BY 1) c ON c.stage_id = s.id
      WHERE s.church_id = p_church_id AND s.is_active), '[]'::jsonb),
    'evolucao_12m', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('mes', to_char(m, 'YYYY-MM'),
               'novos', (SELECT COUNT(*) FROM base b WHERE date_trunc('month', b.created_at) = m)) ORDER BY m)
      FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '11 months',
                           date_trunc('month', CURRENT_DATE), '1 month') m), '[]'::jsonb),
    'visitantes_sem_consolidacao', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nome', COALESCE(NULLIF(trim(b.name), ''),
               trim(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')), 'Sem nome'), 'created_at', b.created_at)
               ORDER BY b.created_at)
      FROM (SELECT * FROM base WHERE stage_key = 'visitante' AND created_at < NOW() - INTERVAL '24 hours'
              AND id NOT IN (SELECT person_id FROM contacted) ORDER BY created_at LIMIT 20) b), '[]'::jsonb),
    'membros_ausentes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', b.id, 'nome', COALESCE(NULLIF(trim(b.name), ''),
               trim(COALESCE(b.first_name,'') || ' ' || COALESCE(b.last_name,'')), 'Sem nome'),
               'etapa', b.stage_name, 'last_contact_at', b.last_contact_at) ORDER BY b.last_contact_at NULLS FIRST)
      FROM (SELECT * FROM base WHERE stage_key = 'membro'
              AND (last_contact_at IS NULL OR last_contact_at < NOW() - INTERVAL '14 days')
            ORDER BY last_contact_at NULLS FIRST LIMIT 10) b), '[]'::jsonb),
    'celulas_ativas',     (SELECT COUNT(*) FROM grupos WHERE status = 'active'),
    'celulas_total',      (SELECT COUNT(*) FROM grupos),
    'celulas_por_trimestre', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('periodo', 'Q' || EXTRACT(QUARTER FROM q) || '/' || EXTRACT(YEAR FROM q),
               'celulas', (SELECT COUNT(*) FROM grupos g WHERE date_trunc('quarter', g.created_at) = q)) ORDER BY q)
      FROM generate_series(date_trunc('quarter', CURRENT_DATE) - INTERVAL '9 months',
                           date_trunc('quarter', CURRENT_DATE), '3 months') q), '[]'::jsonb),
    'top_celulas', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'membros', mc.n) ORDER BY mc.n DESC)
      FROM (SELECT * FROM membros_celula ORDER BY n DESC LIMIT 6) mc JOIN grupos g ON g.id = mc.celula_id), '[]'::jsonb),
    'celulas_em_alerta', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'membros', COALESCE(mc.n, 0)) ORDER BY COALESCE(mc.n, 0))
      FROM (SELECT g.* FROM grupos g LEFT JOIN membros_celula mc ON mc.celula_id = g.id
            WHERE COALESCE(mc.n, 0) < 3 ORDER BY COALESCE(mc.n, 0) LIMIT 5) g
      LEFT JOIN membros_celula mc ON mc.celula_id = g.id), '[]'::jsonb),
    'voluntarios_por_ministerio', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('name', m.name, 'total', v.n) ORDER BY v.n DESC)
      FROM (SELECT v.ministry_id, COUNT(*) n FROM volunteers v JOIN base b ON b.id = v.person_id
            WHERE v.church_id = p_church_id AND v.is_active GROUP BY 1 ORDER BY n DESC LIMIT 8) v
      JOIN ministries m ON m.id = v.ministry_id), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;
