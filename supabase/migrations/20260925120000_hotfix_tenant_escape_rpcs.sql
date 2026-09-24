-- ============================================================================
-- HOTFIX DE SEGURANÇA — tenant escape em RPCs SECURITY DEFINER com p_church_id
--
-- Problema: 16 funções SECURITY DEFINER executáveis por `authenticated` recebiam
-- p_church_id e não validavam o chamador. Qualquer usuário logado de qualquer
-- igreja lia/escrevia dados de outra igreja trocando o UUID.
--
-- Correção (ETAPA 1, sem tocar em auth_church_id()/RLS/impersonação):
--   1. assert_church_access(p_church_id): service_role passa; usuário comum só
--      na igreja do próprio JWT; Ekthos admin passa (mantém a impersonação atual
--      funcionando até a ETAPA 2).
--   2. Guard injetado no início de cada RPC de leitura/sessão.
--   3. Funções de escrita chamadas SOMENTE por Edge Functions com service_role
--      (visitor-capture, admin-*/affiliate-*/provision-channel) perdem EXECUTE
--      de `authenticated`.
--   4. church_has_access permanece: é usada dentro de políticas RLS (event_occurrences)
--      e só responde se a igreja tem plano ativo (sem dado de pessoas).
--
-- Nenhum dado de negócio é alterado. Rollback: reaplicar as definições anteriores
-- (migrations 20260925100000, 20260924120000, 20260909000001, 00013_admin_cockpit)
-- e GRANT EXECUTE ... TO authenticated nas três funções de escrita.
-- ============================================================================

-- ── 1. Guard central ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION assert_church_access(p_church_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Backend (Edge Functions / crons) com service_role: sem restrição de tenant
  IF auth.role() = 'service_role' THEN RETURN; END IF;

  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'church_id obrigatório';
  END IF;

  -- Usuário comum: somente a igreja do próprio JWT
  IF p_church_id = auth_church_id() THEN RETURN; END IF;

  -- Ekthos admin (impersonação atual, até a ETAPA 2 resolver o tenant no banco)
  IF is_ekthos_admin() THEN RETURN; END IF;

  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501',
    HINT = 'p_church_id não corresponde à igreja autorizada';
END;
$$;
REVOKE ALL ON FUNCTION assert_church_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION assert_church_access(uuid) TO authenticated, service_role;

-- ── 2. Injeta o guard nas RPCs plpgsql sem validação ─────────────────────────
DO $$
DECLARE
  r record; v_def text; v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND l.lanname = 'plpgsql'
      AND p.proname IN (
        'get_people_page', 'get_people_stage_counts', 'get_care_status_counts',
        'get_dashboard_people_stats', 'get_people_counts',
        'get_agent_reengajamento_dashboard', 'get_top_volunteers',
        'get_volunteer_attendance_stats', 'upsert_session_token'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('assert_church_access(' IN v_def) > 0 THEN CONTINUE; END IF;
    -- primeiro BEGIN do corpo
    v_new := regexp_replace(v_def, E'\\nBEGIN\\n', E'\nBEGIN\n  PERFORM assert_church_access(p_church_id);\n', '');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Guard não injetado em % (padrão BEGIN não encontrado)', r.proname;
    END IF;
    EXECUTE v_new;
  END LOOP;
END $$;

-- ── 3. Funções SQL reescritas em plpgsql com guard ───────────────────────────
CREATE OR REPLACE FUNCTION get_unit_counts(p_church_id uuid)
RETURNS TABLE (unit_id uuid, person_stage text, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
  PERFORM assert_church_access(p_church_id);
  RETURN QUERY
  SELECT people_operational_unit(p.unit_id, p.created_at, church_unit_cutoff(p_church_id)) AS unit_id,
         p.person_stage::text, COUNT(*) AS cnt
  FROM people p
  WHERE p.church_id = p_church_id AND p.deleted_at IS NULL
  GROUP BY 1, 2;
END;
$$;

CREATE OR REPLACE FUNCTION get_contact_counts(p_church_id uuid, p_person_ids uuid[])
RETURNS TABLE (person_id uuid, cnt bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
  PERFORM assert_church_access(p_church_id);
  RETURN QUERY
  SELECT pj.person_id, COUNT(*) AS cnt
  FROM journey_events je
  JOIN person_journey pj ON pj.id = je.journey_id
  WHERE pj.church_id = p_church_id
    AND je.event_type = 'pastoral_contact'
    AND pj.person_id = ANY(p_person_ids)
  GROUP BY pj.person_id;
END;
$$;

CREATE OR REPLACE FUNCTION church_unit_cutoff(p_church_id uuid)
RETURNS date
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_church_access(p_church_id);
  RETURN (SELECT unit_cutoff_date FROM churches WHERE id = p_church_id);
END;
$$;

-- ── 4. Escritas usadas só por service_role: revogar de authenticated ─────────
REVOKE EXECUTE ON FUNCTION capture_visitor_to_pipeline(uuid, uuid) FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_qr_scanned_count(uuid)      FROM authenticated, anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION record_audit_event(uuid,uuid,text,jsonb,jsonb,text,text,text[],text,uuid,text,text,uuid,uuid,text,text)
  FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION capture_visitor_to_pipeline(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION increment_qr_scanned_count(uuid)      TO service_role;
GRANT EXECUTE ON FUNCTION record_audit_event(uuid,uuid,text,jsonb,jsonb,text,text,text[],text,uuid,text,text,uuid,uuid,text,text)
  TO service_role;

-- ── 5. Verificação: nenhuma SECDEF com p_church_id ficou sem checagem ───────
DO $$
DECLARE r record; v_faltando text := '';
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_functiondef(p.oid) d
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.prosecdef
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%church_id%'
      AND p.proname <> 'church_has_access'
  LOOP
    IF r.d NOT ILIKE '%assert_church_access(%' AND r.d NOT ILIKE '%auth_church_id()%'
       AND r.d NOT ILIKE '%auth.jwt()%' AND r.d NOT ILIKE '%is_ekthos_admin%' THEN
      v_faltando := v_faltando || r.proname || ' ';
    END IF;
  END LOOP;
  IF v_faltando <> '' THEN
    RAISE EXCEPTION 'RPCs ainda sem guard: %', v_faltando;
  END IF;
END $$;
