-- ============================================================================
-- EDITAR PESSOA → MINISTÉRIOS: leitura e sincronização baseada em ministry_members
--
-- Única verdade de pertencimento: ministry_members (mesma relação vista pelos
-- dois lados — Ministérios → Pessoas e Editar Pessoa → Ministérios).
--
-- get_person_ministries(p_person_id)
--   → TODOS os vínculos reais da pessoa + can_manage (can_manage_ministry) para o
--     chamador. Guard: pessoa da igreja efetiva.
--
-- sync_person_ministries(p_person_id, p_ministry_ids uuid[])
--   → diff atômico por IDs, SOMENTE sobre ministérios em que can_manage_ministry
--     = true para o chamador. Vínculos que o chamador não gere são IMUTÁVEIS
--     aqui: ausência de permissão NUNCA vira remoção. Reutiliza
--     ministry_member_add / ministry_member_remove (PR #440).
--
-- Não toca: volunteers, people.ministry_interest (legado permanece), RPCs do #440.
-- ============================================================================

-- ── 1. Vínculos da pessoa (todos) + permissão do chamador em cada um ────────
CREATE OR REPLACE FUNCTION get_person_ministries(p_person_id uuid)
RETURNS TABLE (ministry_id uuid, ministry_name text, can_manage boolean, since timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT EXISTS (
    SELECT 1 FROM people p WHERE p.id = p_person_id AND p.church_id = auth_church_id()
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT m.id, m.name::text, can_manage_ministry(m.id), mm.created_at
  FROM ministry_members mm
  JOIN ministries m ON m.id = mm.ministry_id
  WHERE mm.person_id = p_person_id
    AND m.is_active IS NOT FALSE
  ORDER BY m.name;
END $$;
REVOKE ALL ON FUNCTION get_person_ministries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_person_ministries(uuid) TO authenticated, service_role;

-- ── 2. Sincronização por IDs, só nos ministérios que o chamador gere ────────
CREATE OR REPLACE FUNCTION sync_person_ministries(p_person_id uuid, p_ministry_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_church  uuid;
  v_desired uuid[] := COALESCE(p_ministry_ids, ARRAY[]::uuid[]);
  v_added   uuid[] := ARRAY[]::uuid[];
  v_removed uuid[] := ARRAY[]::uuid[];
  v_kept    uuid[] := ARRAY[]::uuid[];
  v_skipped uuid[] := ARRAY[]::uuid[];
  r record;
BEGIN
  SELECT p.church_id INTO v_church FROM people p WHERE p.id = p_person_id AND p.deleted_at IS NULL;
  IF v_church IS NULL OR (auth.role() IS DISTINCT FROM 'service_role' AND v_church <> auth_church_id()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Ids desconhecidos / de outra igreja / inativos são ignorados (nunca gravados)
  SELECT COALESCE(array_agg(m.id), ARRAY[]::uuid[]) INTO v_desired
  FROM ministries m WHERE m.id = ANY(v_desired) AND m.church_id = v_church AND m.is_active IS NOT FALSE;

  -- Percorre a UNIÃO (atual ∪ desejado) dos ministérios da igreja
  FOR r IN
    SELECT m.id,
           EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.ministry_id = m.id AND mm.person_id = p_person_id) AS is_current,
           (m.id = ANY(v_desired)) AS is_desired,
           can_manage_ministry(m.id) AS manageable
    FROM ministries m
    WHERE m.church_id = v_church AND m.is_active IS NOT FALSE
      AND (m.id = ANY(v_desired) OR EXISTS (SELECT 1 FROM ministry_members mm WHERE mm.ministry_id = m.id AND mm.person_id = p_person_id))
  LOOP
    IF NOT r.manageable THEN
      -- Imutável nesta operação: ausência de permissão NÃO é pedido de remoção
      v_skipped := v_skipped || r.id;
    ELSIF r.is_desired AND NOT r.is_current THEN
      PERFORM ministry_member_add(r.id, p_person_id);
      v_added := v_added || r.id;
    ELSIF r.is_current AND NOT r.is_desired THEN
      PERFORM ministry_member_remove(r.id, p_person_id);
      v_removed := v_removed || r.id;
    ELSE
      v_kept := v_kept || r.id;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'person_id', p_person_id,
    'added',   to_jsonb(v_added),
    'removed', to_jsonb(v_removed),
    'kept',    to_jsonb(v_kept),
    'skipped', to_jsonb(v_skipped)
  );
END $$;
REVOKE ALL ON FUNCTION sync_person_ministries(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_person_ministries(uuid, uuid[]) TO authenticated, service_role;

-- ── 3. Verificações ──────────────────────────────────────────────────────────
DO $$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(proname, ', ') INTO v_bad FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('get_person_ministries', 'sync_person_ministries')
    AND (pg_get_functiondef(oid) ILIKE '%volunteers%' OR pg_get_functiondef(oid) ILIKE '%ministry_interest%');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'função toca volunteers/ministry_interest: %', v_bad; END IF;
  IF (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'volunteers') <> 2 THEN
    RAISE EXCEPTION 'políticas de volunteers alteradas';
  END IF;
  IF has_table_privilege('authenticated', 'ministry_members', 'INSERT')
     OR has_table_privilege('authenticated', 'ministry_members', 'DELETE') THEN
    RAISE EXCEPTION 'ministry_members voltou a aceitar escrita direta';
  END IF;
END $$;
