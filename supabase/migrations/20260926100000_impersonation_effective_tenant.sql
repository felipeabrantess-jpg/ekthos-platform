-- ============================================================================
-- ETAPA 2 — IMPERSONAÇÃO COM TENANT EFETIVO RESOLVIDO NO BANCO
--
-- Antes: o Ekthos admin "impersonava" apenas no frontend (localStorage) e o JWT
-- continuava apontando para a igreja original → RLS/PostgREST viam uma igreja,
-- RPCs viam outra. Agora o tenant efetivo é resolvido no banco a partir de
-- impersonate_sessions (sessão aberta, válida, do próprio auth.uid()).
--
-- Camadas:
--   current_impersonation()  → sessão válida do admin logado (ou nenhuma)
--   effective_church_id()    → church_id da sessão, senão church_id do JWT
--   auth_church_id()         → delega para effective_church_id() (RLS existente
--                              passa a enxergar o tenant impersonado)
--   auth_user_role()         → role em user_roles; durante impersonação válida
--                              o Ekthos admin opera como 'admin' da igreja
--   get_my_tenant_context()  → fonte de verdade do frontend
--   impersonation_start/end  → únicas formas de abrir/fechar sessão (auditadas)
--   assert_church_access()   → sem bypass de admin: p_church_id == tenant efetivo
--
-- Separação de conceitos:
--   is_ekthos_admin()  = IDENTIDADE de plataforma (vem do JWT; não muda).
--   auth_user_role()   = AUTORIZAÇÃO OPERACIONAL dentro da igreja efetiva.
--   Usuário comum nunca vira admin por aqui: só o Ekthos admin COM sessão válida
--   recebe 'admin' sintético, e apenas na igreja da sessão.
--
-- NÃO desabilita RLS. NÃO altera dados de pessoas. NÃO altera regra de unidades.
-- ============================================================================

-- ── 0. Sessões abertas legadas (pré-ETAPA 2) deixam de ser autoridade ────────
-- Antes desta migration elas eram apenas auditoria. Fechadas com motivo
-- explícito para que ninguém "acorde" impersonando sem ter pedido.
UPDATE impersonate_sessions
   SET ended_at = now(), ended_reason = 'etapa2_reset'
 WHERE ended_at IS NULL;

-- ── 1. Uma única sessão aberta por admin ─────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS impersonate_sessions_one_open_per_admin
  ON impersonate_sessions (admin_user_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS impersonate_sessions_open_lookup
  ON impersonate_sessions (admin_user_id, started_at DESC)
  WHERE ended_at IS NULL;

-- ── 2. impersonate_sessions: escrita só via RPC (SECURITY DEFINER) ───────────
REVOKE ALL ON impersonate_sessions FROM anon, PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON impersonate_sessions FROM authenticated;
GRANT SELECT ON impersonate_sessions TO authenticated;

DROP POLICY IF EXISTS impersonate_sessions_admin_all ON impersonate_sessions;
CREATE POLICY impersonate_sessions_admin_select ON impersonate_sessions
  FOR SELECT TO authenticated USING (is_ekthos_admin());

-- ── 3. Sessão de impersonação válida do usuário logado ───────────────────────
CREATE OR REPLACE FUNCTION current_impersonation()
RETURNS TABLE (session_id uuid, church_id uuid, started_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.id, s.church_id, s.started_at
  FROM impersonate_sessions s
  JOIN churches c ON c.id = s.church_id AND c.deleted_at IS NULL
  WHERE is_ekthos_admin()                       -- identidade de plataforma
    AND s.admin_user_id = auth.uid()            -- pertence ao usuário logado
    AND s.ended_at IS NULL                      -- aberta
    AND COALESCE(s.last_action_at, s.started_at) > now() - interval '12 hours'  -- válida
  ORDER BY s.started_at DESC
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION current_impersonation() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION current_impersonation() TO authenticated, service_role;

-- ── 4. Tenant efetivo ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION effective_church_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT ci.church_id FROM current_impersonation() ci),
    (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid
  )
$$;
REVOKE ALL ON FUNCTION effective_church_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION effective_church_id() TO authenticated, service_role;

-- ── 5. auth_church_id() delega → RLS existente passa a usar o tenant efetivo ─
CREATE OR REPLACE FUNCTION auth_church_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT effective_church_id()
$$;

-- ── 6. Role efetiva ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS app_role
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (SELECT role FROM user_roles WHERE user_id = auth.uid() AND church_id = auth_church_id() LIMIT 1),
    CASE WHEN EXISTS (SELECT 1 FROM current_impersonation()) THEN 'admin'::app_role END
  )
$$;

-- ── 7. Contexto do tenant para o frontend ────────────────────────────────────
CREATE OR REPLACE FUNCTION get_my_tenant_context()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_jwt_church uuid := (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid;
  v_imp        record;
  v_church     uuid;
  v_name       text;
  v_status     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'usuário não autenticado';
  END IF;

  SELECT * INTO v_imp FROM current_impersonation();

  -- mantém a sessão viva enquanto o admin usa o app (no máximo 1 write / 5 min)
  IF v_imp.session_id IS NOT NULL THEN
    UPDATE impersonate_sessions
       SET last_action_at = now()
     WHERE id = v_imp.session_id
       AND COALESCE(last_action_at, started_at) < now() - interval '5 minutes';
  END IF;

  v_church := effective_church_id();
  SELECT name, status INTO v_name, v_status FROM churches WHERE id = v_church;

  RETURN jsonb_build_object(
    'user_id',                  v_uid,
    'effective_church_id',      v_church,
    'church_name',              v_name,
    'church_status',            v_status,
    'jwt_church_id',            v_jwt_church,
    'is_impersonating',         v_imp.session_id IS NOT NULL,
    'impersonation_session_id', v_imp.session_id,
    'impersonation_started_at', v_imp.started_at,
    'role',                     auth_user_role(),
    'is_ekthos_admin',          is_ekthos_admin()
  );
END;
$$;
REVOKE ALL ON FUNCTION get_my_tenant_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_tenant_context() TO authenticated, service_role;

-- ── 8. Iniciar impersonação (transacional, uma sessão por admin, auditada) ───
CREATE OR REPLACE FUNCTION impersonation_start(p_church_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_email text;
  v_roles text[];
  v_prev  record;
  v_new   impersonate_sessions;
BEGIN
  IF v_uid IS NULL OR NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'apenas Ekthos admin pode impersonar';
  END IF;
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'church_id obrigatório' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM churches WHERE id = p_church_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'CHURCH_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT u.email,
         ARRAY(SELECT jsonb_array_elements_text(COALESCE(u.raw_app_meta_data -> 'ekthos_roles', '[]'::jsonb)))
    INTO v_email, v_roles
    FROM auth.users u WHERE u.id = v_uid;

  -- Sessão anterior aberta é encerrada (superseded) e auditada na mesma transação
  FOR v_prev IN
    UPDATE impersonate_sessions
       SET ended_at = now(), ended_reason = 'superseded'
     WHERE admin_user_id = v_uid AND ended_at IS NULL
     RETURNING id, church_id, started_at
  LOOP
    PERFORM record_audit_event(
      v_prev.church_id, v_uid, 'impersonation.end', NULL,
      jsonb_build_object('duration_seconds', EXTRACT(EPOCH FROM now() - v_prev.started_at)::int, 'reason', 'superseded'),
      'superseded', v_email, v_roles, 'impersonate_sessions', v_prev.id, 'success', NULL,
      v_prev.id, v_prev.church_id, 'rpc', NULL);
  END LOOP;

  INSERT INTO impersonate_sessions (admin_user_id, church_id, notes, last_action_at)
  VALUES (v_uid, p_church_id, p_notes, now())
  RETURNING * INTO v_new;

  PERFORM record_audit_event(
    p_church_id, v_uid, 'impersonation.start', NULL, NULL, NULL,
    v_email, v_roles, 'impersonate_sessions', v_new.id, 'success', NULL,
    v_new.id, p_church_id, 'rpc', NULL);

  RETURN get_my_tenant_context();
END;
$$;
REVOKE ALL ON FUNCTION impersonation_start(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION impersonation_start(uuid, text) TO authenticated, service_role;

-- ── 9. Encerrar impersonação ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION impersonation_end(p_session_id uuid, p_reason text DEFAULT 'manual_exit')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_s     impersonate_sessions;
  v_email text;
  v_roles text[];
  v_dur   int;
BEGIN
  IF v_uid IS NULL OR NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_s FROM impersonate_sessions WHERE id = p_session_id;
  -- sessão inexistente OU de outro admin: mesma resposta (não revela existência)
  IF NOT FOUND OR v_s.admin_user_id <> v_uid THEN
    RAISE EXCEPTION 'SESSION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_s.ended_at IS NOT NULL THEN
    RETURN get_my_tenant_context() || jsonb_build_object('already_ended', true, 'ended_session_id', p_session_id);
  END IF;

  v_dur := EXTRACT(EPOCH FROM now() - v_s.started_at)::int;
  UPDATE impersonate_sessions
     SET ended_at = now(), ended_reason = COALESCE(NULLIF(p_reason, ''), 'manual_exit')
   WHERE id = p_session_id;

  SELECT u.email,
         ARRAY(SELECT jsonb_array_elements_text(COALESCE(u.raw_app_meta_data -> 'ekthos_roles', '[]'::jsonb)))
    INTO v_email, v_roles
    FROM auth.users u WHERE u.id = v_uid;

  PERFORM record_audit_event(
    v_s.church_id, v_uid, 'impersonation.end', NULL,
    jsonb_build_object('duration_seconds', v_dur, 'reason', COALESCE(NULLIF(p_reason, ''), 'manual_exit')),
    COALESCE(NULLIF(p_reason, ''), 'manual_exit'), v_email, v_roles, 'impersonate_sessions', p_session_id,
    'success', NULL, p_session_id, v_s.church_id, 'rpc', NULL);

  RETURN get_my_tenant_context() || jsonb_build_object('ended_session_id', p_session_id, 'duration_seconds', v_dur);
END;
$$;
REVOKE ALL ON FUNCTION impersonation_end(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION impersonation_end(uuid, text) TO authenticated, service_role;

-- ── 10. Guard das RPCs: sem bypass de Ekthos admin ───────────────────────────
-- Ekthos admin SEM sessão válida não acessa igreja B só por passar p_church_id.
-- Ekthos admin COM sessão válida em B: auth_church_id() = B → passa.
CREATE OR REPLACE FUNCTION assert_church_access(p_church_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN RETURN; END IF;
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'church_id obrigatório';
  END IF;
  IF p_church_id = auth_church_id() THEN RETURN; END IF;
  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
    HINT = 'p_church_id não corresponde ao tenant efetivo';
END;
$$;

-- ── 11. RPCs que liam church_id direto do JWT → tenant efetivo ───────────────
DO $$
DECLARE
  r record; v_def text; v_new text;
  v_old_guard text := $q$IF (SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid) != p_church_id THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;$q$;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('get_discipulado_overview', 'get_discipulado_stage_people')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('assert_church_access(' IN v_def) > 0 THEN CONTINUE; END IF;
    v_new := replace(v_def, v_old_guard, 'PERFORM assert_church_access(p_church_id);');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Guard antigo não encontrado em %', r.proname;
    END IF;
    EXECUTE v_new;
  END LOOP;

  FOR r IN
    SELECT p.oid, p.proname FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_person_timeline'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(v_def, $q$(auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid$q$, 'auth_church_id()');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Leitura direta do JWT não encontrada em %', r.proname;
    END IF;
    EXECUTE v_new;
  END LOOP;
END $$;

-- ── 12. Políticas RLS que liam church_id/role direto do JWT ──────────────────
-- Tenant: passa a usar auth_church_id() (tenant efetivo).
-- Role: auth_user_role() = 'admin' OU role do JWT (compatibilidade com usuários
-- comuns cujo JWT já carrega role=admin).
DROP POLICY IF EXISTS agent_conversations_church_isolation ON agent_conversations;
CREATE POLICY agent_conversations_church_isolation ON agent_conversations
  FOR ALL TO public USING (church_id = auth_church_id()) WITH CHECK (church_id = auth_church_id());

DROP POLICY IF EXISTS "church members read pending approvals" ON agent_message_pending_approval;
CREATE POLICY "church members read pending approvals" ON agent_message_pending_approval
  FOR SELECT TO authenticated USING (church_id = auth_church_id());

DROP POLICY IF EXISTS ssa_tenant_all ON service_schedule_availability;
CREATE POLICY ssa_tenant_all ON service_schedule_availability
  FOR ALL TO authenticated USING (church_id = auth_church_id()) WITH CHECK (church_id = auth_church_id());

DROP POLICY IF EXISTS swap_tenant_all ON service_schedule_swap_requests;
CREATE POLICY swap_tenant_all ON service_schedule_swap_requests
  FOR ALL TO authenticated USING (church_id = auth_church_id()) WITH CHECK (church_id = auth_church_id());

DROP POLICY IF EXISTS vpoints_tenant_all ON volunteer_points;
CREATE POLICY vpoints_tenant_all ON volunteer_points
  FOR ALL TO authenticated USING (church_id = auth_church_id()) WITH CHECK (church_id = auth_church_id());

DROP POLICY IF EXISTS user_roles_church_admin_select ON user_roles;
CREATE POLICY user_roles_church_admin_select ON user_roles
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id()
         AND (auth_user_role() = 'admin'::app_role OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'));

DROP POLICY IF EXISTS cell_neighborhoods_update ON cell_neighborhoods;
CREATE POLICY cell_neighborhoods_update ON cell_neighborhoods
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id()
              AND (auth_user_role() = 'admin'::app_role OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'));

DROP POLICY IF EXISTS church_units_update ON church_units;
CREATE POLICY church_units_update ON church_units
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id()
              AND (auth_user_role() = 'admin'::app_role OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'));

-- Políticas que consultavam user_roles inline (sem passar por auth_user_role())
DROP POLICY IF EXISTS mm_delete_admins ON ministry_members;
CREATE POLICY mm_delete_admins ON ministry_members
  FOR DELETE TO authenticated
  USING (church_id = auth_church_id()
         AND auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role]));

DROP POLICY IF EXISTS mm_update_leaders ON ministry_members;
CREATE POLICY mm_update_leaders ON ministry_members
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id()
         AND (auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role])
              OR is_ministry_leader_of(ministry_id)))
  WITH CHECK (church_id = auth_church_id()
         AND (auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role])
              OR is_ministry_leader_of(ministry_id)));

DROP POLICY IF EXISTS church_pastoral_profile_admin_update ON church_pastoral_profile;
CREATE POLICY church_pastoral_profile_admin_update ON church_pastoral_profile
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id()
         AND auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role, 'treasurer'::app_role, 'secretary'::app_role]))
  WITH CHECK (church_id = auth_church_id()
         AND auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role, 'treasurer'::app_role, 'secretary'::app_role]));

DROP POLICY IF EXISTS church_pastoral_profile_member_select ON church_pastoral_profile;
CREATE POLICY church_pastoral_profile_member_select ON church_pastoral_profile
  FOR SELECT TO authenticated USING (church_id = auth_church_id());

DROP POLICY IF EXISTS contractors_church_admin_update ON contractors;
CREATE POLICY contractors_church_admin_update ON contractors
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id()
         AND auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role, 'treasurer'::app_role, 'secretary'::app_role]))
  WITH CHECK (church_id = auth_church_id()
         AND auth_user_role() = ANY (ARRAY['admin'::app_role, 'admin_departments'::app_role, 'treasurer'::app_role, 'secretary'::app_role]));

DROP POLICY IF EXISTS contractors_church_member_select ON contractors;
CREATE POLICY contractors_church_member_select ON contractors
  FOR SELECT TO authenticated USING (church_id = auth_church_id());

-- ── 13. Verificações (abortam a migration se algo ficou para trás) ───────────
DO $$
DECLARE v_bad text;
BEGIN
  -- 13a. nenhuma política lê church_id direto do JWT
  SELECT string_agg(tablename || '.' || policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) ILIKE '%''church_id''%'
    AND (COALESCE(qual, '') || COALESCE(with_check, '')) ILIKE '%app_metadata%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Políticas ainda lendo church_id do JWT: %', v_bad;
  END IF;

  -- 13b. nenhuma função de negócio lê church_id direto do JWT
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND pg_get_functiondef(p.oid) ILIKE '%''app_metadata'' ->> ''church_id''%'
    AND p.proname NOT IN ('effective_church_id', 'get_my_tenant_context');
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Funções ainda lendo church_id do JWT: %', v_bad;
  END IF;

  -- 13c. hotfix da ETAPA 1 preservado: toda SECDEF com p_church_id tem guard
  SELECT string_agg(p.proname, ', ') INTO v_bad
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND pg_get_function_identity_arguments(p.oid) ILIKE '%church_id%'
    AND p.proname <> 'church_has_access'
    AND pg_get_functiondef(p.oid) NOT ILIKE '%assert_church_access(%'
    AND pg_get_functiondef(p.oid) NOT ILIKE '%auth_church_id()%'
    AND pg_get_functiondef(p.oid) NOT ILIKE '%is_ekthos_admin%';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'RPCs SECURITY DEFINER sem guard: %', v_bad;
  END IF;

  -- 13d. índice de sessão única existe e não há mais de uma sessão aberta por admin
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'impersonate_sessions_one_open_per_admin') THEN
    RAISE EXCEPTION 'Índice impersonate_sessions_one_open_per_admin ausente';
  END IF;

  -- 13e. authenticated não escreve em impersonate_sessions diretamente
  IF has_table_privilege('authenticated', 'impersonate_sessions', 'INSERT')
     OR has_table_privilege('authenticated', 'impersonate_sessions', 'UPDATE')
     OR has_table_privilege('authenticated', 'impersonate_sessions', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated ainda escreve em impersonate_sessions';
  END IF;
END $$;
