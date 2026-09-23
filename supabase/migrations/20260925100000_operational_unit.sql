-- ============================================================================
-- UNIDADE OPERACIONAL — regra canônica única (aprovada 25/09/2026)
--
--   people.unit_id            = dado ARMAZENADO / histórico. Nunca é apagado nem
--                               sobrescrito por esta regra.
--   unidade operacional       = unidade considerada CONFIÁVEL para filtros,
--                               contadores e operação. Definida SOMENTE por
--                               people_operational_unit().
--   churches.unit_cutoff_date = "data a partir da qual a unidade do cadastro é
--                               considerada confiável operacionalmente".
--
--   Igreja SEM unit_cutoff_date : unidade operacional = people.unit_id.
--   Igreja COM unit_cutoff_date : created_at::date <  corte → SEM UNIDADE (NULL)
--                                 created_at::date >= corte → people.unit_id
--
-- Não existe mais parâmetro p_apply_cutoff em nenhuma RPC: a regra não é opcional.
-- Escopo das RPCs (p_unit_id): NULL = todas | 'none' = sem unidade operacional |
-- uuid = unidade operacional igual ao uuid. "Todas" nunca exclui ninguém pelo corte.
--
-- Rollback: reaplicar 20260924110000 (scope com p_apply_cutoff DEFAULT FALSE) e
--           20260924120000 (discipulado/dashboard com cutoff NULL).
-- ============================================================================

-- ── 1. Definição central ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION church_unit_cutoff(p_church_id uuid)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT unit_cutoff_date FROM churches WHERE id = p_church_id
$$;

CREATE OR REPLACE FUNCTION people_operational_unit(p_unit uuid, p_created timestamptz, p_cutoff date)
RETURNS uuid LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_cutoff IS NOT NULL AND p_created::date < p_cutoff THEN NULL
    ELSE p_unit
  END
$$;
COMMENT ON FUNCTION people_operational_unit(uuid, timestamptz, date) IS
  'Unidade operacional: NULL para cadastros anteriores a churches.unit_cutoff_date; senão people.unit_id. Única fonte da regra.';

DROP FUNCTION IF EXISTS people_unit_scope_ok(uuid, timestamptz, date, text, boolean);
CREATE OR REPLACE FUNCTION people_unit_scope_ok(p_unit uuid, p_created timestamptz, p_cutoff date, p_scope text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_scope IS NULL   THEN TRUE
    WHEN p_scope = 'none'  THEN people_operational_unit(p_unit, p_created, p_cutoff) IS NULL
    -- IS NOT DISTINCT FROM: unidade operacional NULL nunca "casa" com uma unidade (evita NULL lógico)
    ELSE people_operational_unit(p_unit, p_created, p_cutoff) IS NOT DISTINCT FROM p_scope::uuid
  END
$$;
COMMENT ON FUNCTION people_unit_scope_ok(uuid, timestamptz, date, text) IS
  'Predicado único de escopo de unidade (NULL=todas | none | uuid) sobre a unidade operacional.';

-- ── 2. Regressão: a regra em si (sem dados) ──────────────────────────────────
DO $$
DECLARE u1 uuid := '11111111-1111-4111-8111-111111111111'; c date := DATE '2026-06-28';
BEGIN
  ASSERT people_operational_unit(u1,  '2026-06-27', c) IS NULL,  'A/B: pré-corte com unit_id → sem unidade';
  ASSERT people_operational_unit(NULL,'2026-06-27', c) IS NULL,  'C: pré-corte NULL → sem unidade';
  ASSERT people_operational_unit(u1,  '2026-06-28', c) = u1,     'D/E: pós-corte → unit_id';
  ASSERT people_operational_unit(NULL,'2026-06-28', c) IS NULL,  'F: pós-corte NULL → sem unidade';
  ASSERT people_operational_unit(u1,  '2026-06-27', NULL) = u1,  'igreja sem corte → unit_id';
  ASSERT people_unit_scope_ok(u1, '2026-06-27', c, NULL),        'G: todas inclui pré-corte';
  ASSERT people_unit_scope_ok(u1, '2026-06-27', c, 'none'),      'pré-corte cai em none';
  ASSERT NOT people_unit_scope_ok(u1, '2026-06-27', c, u1::text),'pré-corte NÃO cai na unidade';
  ASSERT people_unit_scope_ok(u1, '2026-06-28', c, u1::text),    'pós-corte cai na unidade';
END $$;

-- ── 3. RPCs: remover p_apply_cutoff e usar o corte da igreja em todas ────────
-- Recriadas a partir da definição vigente com substituição textual controlada,
-- para que TODAS passem a chamar exatamente a mesma regra.
DO $$
DECLARE
  r record; v_def text; v_new text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.proname IN ('get_people_page','get_people_stage_counts','get_care_status_counts',
                        'get_dashboard_people_stats','get_discipulado_overview','get_discipulado_stage_people')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := v_def;
    v_new := replace(v_new, ', p_apply_cutoff boolean DEFAULT false', '');
    v_new := replace(v_new, ', p_apply_cutoff boolean DEFAULT true',  '');
    v_new := replace(v_new, 'people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id, p_apply_cutoff)',
                            'people_unit_scope_ok(p.unit_id, p.created_at, v_cutoff, p_unit_id)');
    v_new := replace(v_new, 'people_unit_scope_ok(p.unit_id, p.created_at, NULL, p_unit_id)',
                            'people_unit_scope_ok(p.unit_id, p.created_at, church_unit_cutoff(p_church_id), p_unit_id)');
    v_new := replace(v_new, 'people_unit_scope_ok(pe.unit_id, pe.created_at, NULL, p_unit_id)',
                            'people_unit_scope_ok(pe.unit_id, pe.created_at, church_unit_cutoff(p_church_id), p_unit_id)');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Função % não foi ajustada — substituição não encontrou o padrão esperado', r.proname;
    END IF;
    IF position('p_apply_cutoff' IN v_new) > 0 OR position(', NULL, p_unit_id)' IN v_new) > 0 THEN
      RAISE EXCEPTION 'Função % ainda contém regra opcional/NULL de corte', r.proname;
    END IF;
    EXECUTE format('DROP FUNCTION %I(%s)', r.proname, r.args);
    EXECUTE v_new;
  END LOOP;
END $$;

-- ── 4. get_unit_counts (legado) — mesma regra ────────────────────────────────
CREATE OR REPLACE FUNCTION get_unit_counts(p_church_id uuid)
RETURNS TABLE (unit_id uuid, person_stage text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT people_operational_unit(p.unit_id, p.created_at, church_unit_cutoff(p_church_id)) AS unit_id,
         p.person_stage, COUNT(*) AS cnt
  FROM people p
  WHERE p.church_id = p_church_id AND p.deleted_at IS NULL
  GROUP BY 1, 2;
$$;

-- ── 5. Grants (assinaturas novas) ────────────────────────────────────────────
REVOKE ALL ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date,text,uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_people_page(uuid,text,text,text,text,text,date,date,int,int,date,date,text,uuid,int) TO authenticated;
REVOKE ALL ON FUNCTION get_people_stage_counts(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_people_stage_counts(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION get_care_status_counts(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_care_status_counts(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION get_dashboard_people_stats(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_dashboard_people_stats(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION get_discipulado_overview(uuid,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_discipulado_overview(uuid,integer,text) TO authenticated;
REVOKE ALL ON FUNCTION get_discipulado_stage_people(uuid,uuid,integer,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_discipulado_stage_people(uuid,uuid,integer,integer,text,text) TO authenticated;
REVOKE ALL ON FUNCTION get_unit_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_unit_counts(uuid) TO authenticated;
REVOKE ALL ON FUNCTION church_unit_cutoff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION church_unit_cutoff(uuid) TO authenticated;
