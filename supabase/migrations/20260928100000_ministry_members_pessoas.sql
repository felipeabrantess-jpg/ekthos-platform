-- ============================================================================
-- PESSOAS DO MINISTÉRIO — pertencimento canônico em ministry_members
--
-- Requisito: dentro de cada Ministério, o líder (conta vinculada) ou o admin
-- pesquisa uma pessoa JÁ cadastrada na igreja, inclui e depois remove.
-- Estrutura: people ⟷ ministry_members ⟷ ministries. NUNCA toca em volunteers
-- (voluntariado é estrutura independente).
--
-- Autorização (no BANCO, não só no frontend):
--   ministries.leader_id      = PESSOA líder do ministério (já existia)
--   ministries.leader_user_id = CONTA DE ACESSO com permissão de gestão (novo;
--                               preenchida pelo admin, nunca por suposição)
--   can_manage_ministry(id)   = admin/admin_departments da igreja efetiva
--                               OU leader_user_id = auth.uid()
--                               (SEM ponte por e-mail: leader_user_id é a única autoridade)
--   Leitura das pessoas de um ministério (get_ministry_members, contagens e SELECT
--   direto) segue a MESMA regra: líder não consulta ministério que não gere.
--   Escrita em ministry_members SOMENTE via RPC; PostgREST perde INSERT/UPDATE/DELETE.
--
-- Não altera: volunteers (dados, grants, políticas), people, unidades, contatos.
-- ============================================================================

-- ── 1. Conta de acesso do líder ──────────────────────────────────────────────
ALTER TABLE ministries
  ADD COLUMN IF NOT EXISTS leader_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
COMMENT ON COLUMN ministries.leader_id IS 'PESSOA (people.id) que lidera o ministério';
COMMENT ON COLUMN ministries.leader_user_id IS 'CONTA (auth.users.id) autorizada a gerir pessoas do ministério — vinculada pelo admin';
CREATE INDEX IF NOT EXISTS idx_ministries_leader_user ON ministries (leader_user_id) WHERE leader_user_id IS NOT NULL;

-- Só admin/admin_departments (ou service_role) pode definir/alterar leader_user_id.
-- ministries tem política tenant_all, então protegemos a coluna por trigger.
CREATE OR REPLACE FUNCTION ministries_guard_leader_user_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.leader_user_id IS DISTINCT FROM OLD.leader_user_id THEN
    IF auth.role() = 'service_role' THEN RETURN NEW; END IF;
    IF auth_user_role() NOT IN ('admin', 'admin_departments') THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'só admin vincula a conta do líder';
    END IF;
    IF NEW.leader_user_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM user_roles ur WHERE ur.user_id = NEW.leader_user_id AND ur.church_id = NEW.church_id
    ) THEN
      RAISE EXCEPTION 'ACCOUNT_NOT_IN_CHURCH' USING ERRCODE = '23503', HINT = 'a conta precisa pertencer à igreja';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ministries_guard_leader_user_id ON ministries;
CREATE TRIGGER ministries_guard_leader_user_id
  BEFORE UPDATE OF leader_user_id ON ministries
  FOR EACH ROW EXECUTE FUNCTION ministries_guard_leader_user_id();
-- INSERT com leader_user_id também passa pelo guard (OLD é NULL → sempre "mudou")
CREATE OR REPLACE FUNCTION ministries_guard_leader_user_id_ins()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.leader_user_id IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role'
     AND auth_user_role() NOT IN ('admin', 'admin_departments') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'só admin vincula a conta do líder';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ministries_guard_leader_user_id_ins ON ministries;
CREATE TRIGGER ministries_guard_leader_user_id_ins
  BEFORE INSERT ON ministries
  FOR EACH ROW EXECUTE FUNCTION ministries_guard_leader_user_id_ins();

-- ── 2. Autorização de gestão de um ministério ────────────────────────────────
CREATE OR REPLACE FUNCTION can_manage_ministry(p_ministry_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.role() = 'service_role'
      OR EXISTS (
        SELECT 1 FROM ministries m
        WHERE m.id = p_ministry_id
          AND m.church_id = auth_church_id()
          AND m.is_active IS NOT FALSE
          AND (
            auth_user_role() IN ('admin', 'admin_departments')   -- admin da igreja efetiva
            OR m.leader_user_id = auth.uid()                     -- conta vinculada (única autoridade)
          )
      )
$$;
REVOKE ALL ON FUNCTION can_manage_ministry(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage_ministry(uuid) TO authenticated, service_role;

-- ── 3. Leitura ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_ministry_members(p_ministry_id uuid)
RETURNS TABLE (person_id uuid, name text, phone text, email text, role text, since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Só quem gere o ministério (admin/admin_departments ou leader_user_id) vê suas pessoas
  IF NOT can_manage_ministry(p_ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'sem permissão para ver as pessoas deste ministério';
  END IF;
  RETURN QUERY
  SELECT p.id, p.name::text, p.phone::text, p.email::text, mm.role::text, mm.created_at
  FROM ministry_members mm
  JOIN people p ON p.id = mm.person_id
  WHERE mm.ministry_id = p_ministry_id
    AND p.deleted_at IS NULL
  ORDER BY p.name_sort, p.name;
END $$;
REVOKE ALL ON FUNCTION get_ministry_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_ministry_members(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION get_ministry_member_counts(p_church_id uuid)
RETURNS TABLE (ministry_id uuid, cnt bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM assert_church_access(p_church_id);
  RETURN QUERY
  SELECT mm.ministry_id, COUNT(*)
  FROM ministry_members mm JOIN people p ON p.id = mm.person_id
  WHERE mm.church_id = p_church_id AND p.deleted_at IS NULL
    AND can_manage_ministry(mm.ministry_id)   -- líder: só contagens dos ministérios que gere
  GROUP BY mm.ministry_id;
END $$;
REVOKE ALL ON FUNCTION get_ministry_member_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_ministry_member_counts(uuid) TO authenticated, service_role;

-- Ministérios que o usuário logado pode gerir (admin → todos; líder → os seus)
CREATE OR REPLACE FUNCTION get_my_managed_ministries()
RETURNS TABLE (ministry_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM ministries m
  WHERE m.church_id = auth_church_id() AND m.is_active IS NOT FALSE
    AND can_manage_ministry(m.id)
$$;
REVOKE ALL ON FUNCTION get_my_managed_ministries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_my_managed_ministries() TO authenticated, service_role;

-- Contas da igreja (para o admin vincular leader_user_id). Só admin/admin_departments.
CREATE OR REPLACE FUNCTION get_church_accounts()
RETURNS TABLE (user_id uuid, email text, name text, role text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND auth_user_role() NOT IN ('admin', 'admin_departments') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT ur.user_id, au.email::text,
         COALESCE(pr.name, pr.display_name, au.raw_user_meta_data ->> 'full_name', au.email)::text,
         ur.role::text
  FROM user_roles ur
  JOIN auth.users au ON au.id = ur.user_id
  LEFT JOIN profiles pr ON pr.user_id = ur.user_id
  WHERE ur.church_id = auth_church_id()
  ORDER BY 3;
END $$;
REVOKE ALL ON FUNCTION get_church_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_church_accounts() TO authenticated, service_role;

-- ── 4. Escrita (únicas portas de entrada) ────────────────────────────────────
CREATE OR REPLACE FUNCTION ministry_member_add(p_ministry_id uuid, p_person_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_church uuid; v_inserted boolean;
BEGIN
  IF NOT can_manage_ministry(p_ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'sem permissão para gerir este ministério';
  END IF;
  SELECT m.church_id INTO v_church FROM ministries m WHERE m.id = p_ministry_id AND m.is_active IS NOT FALSE;
  IF v_church IS NULL THEN RAISE EXCEPTION 'MINISTRY_NOT_FOUND' USING ERRCODE = 'P0002'; END IF;
  IF NOT EXISTS (SELECT 1 FROM people p WHERE p.id = p_person_id AND p.church_id = v_church AND p.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'PERSON_NOT_FOUND' USING ERRCODE = 'P0002', HINT = 'pessoa não pertence à igreja ou foi excluída';
  END IF;
  INSERT INTO ministry_members (church_id, ministry_id, person_id, role)
  VALUES (v_church, p_ministry_id, p_person_id, 'membro')
  ON CONFLICT (ministry_id, person_id) DO NOTHING;
  v_inserted := FOUND;
  RETURN jsonb_build_object('ministry_id', p_ministry_id, 'person_id', p_person_id, 'inserted', v_inserted);
END $$;
REVOKE ALL ON FUNCTION ministry_member_add(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ministry_member_add(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION ministry_member_remove(p_ministry_id uuid, p_person_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF NOT can_manage_ministry(p_ministry_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'sem permissão para gerir este ministério';
  END IF;
  DELETE FROM ministry_members WHERE ministry_id = p_ministry_id AND person_id = p_person_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ministry_id', p_ministry_id, 'person_id', p_person_id, 'removed', v_n > 0);
END $$;
REVOKE ALL ON FUNCTION ministry_member_remove(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION ministry_member_remove(uuid, uuid) TO authenticated, service_role;

-- ── 5. ministry_members: leitura por tenant; escrita só via RPC ──────────────
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON ministry_members FROM authenticated, anon, PUBLIC;
GRANT SELECT ON ministry_members TO authenticated;
DROP POLICY IF EXISTS mm_insert_leaders ON ministry_members;
DROP POLICY IF EXISTS mm_update_leaders ON ministry_members;
DROP POLICY IF EXISTS mm_delete_admins  ON ministry_members;
DROP POLICY IF EXISTS mm_select_tenant  ON ministry_members;
-- SELECT direto (PostgREST) segue a mesma regra de gestão: admin vê todos; líder só o(s) seu(s)
CREATE POLICY mm_select_tenant ON ministry_members FOR SELECT TO authenticated
  USING (church_id = auth_church_id() AND can_manage_ministry(ministry_id));
-- (service_role continua com acesso total via política existente ou bypass; garantimos:)
DROP POLICY IF EXISTS mm_service_all ON ministry_members;
CREATE POLICY mm_service_all ON ministry_members FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 6. Verificações ──────────────────────────────────────────────────────────
DO $$
DECLARE v_bad text;
BEGIN
  IF has_table_privilege('authenticated', 'ministry_members', 'INSERT')
     OR has_table_privilege('authenticated', 'ministry_members', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated ainda escreve direto em ministry_members';
  END IF;
  -- nenhuma função nova toca volunteers
  SELECT string_agg(proname, ', ') INTO v_bad FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('can_manage_ministry','get_ministry_members','get_ministry_member_counts','get_my_managed_ministries','ministry_member_add','ministry_member_remove','get_church_accounts')
    AND pg_get_functiondef(oid) ILIKE '%volunteers%';
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'função toca volunteers: %', v_bad; END IF;
  -- volunteers: políticas e grants intocados (2 políticas: tenant_all + service_all)
  IF (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'volunteers') <> 2 THEN
    RAISE EXCEPTION 'políticas de volunteers alteradas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ministries' AND column_name = 'leader_user_id') THEN
    RAISE EXCEPTION 'leader_user_id ausente';
  END IF;
END $$;
