-- ============================================================================
-- SEQUÊNCIA DE CONTATOS PASTORAIS (1º, 2º, 3º, … Nº) na página de Atendimento
--
-- 1. get_person_contacts(p_person_id): lista os eventos pastoral_contact da
--    pessoa com ordinal derivado da ordem real de registro (created_at, id).
--    Cada linha corresponde a UM journey_events real (auditável pelo event_id).
--    Nenhuma tabela nova, nenhum contador manual.
--
-- 2. Hardening de journey_register_attendance: sem jornada aberta e sem etapa
--    informada → JOURNEY_REQUIRED (antes: atualizava a pessoa e retornava
--    sucesso sem gravar pastoral_contact, quebrando a sequência/contador).
--    Com etapa válida o fluxo canônico continua: abre jornada → registra contato.
--
-- Não altera: get_contact_counts, get_care_status_counts, get_people_page,
-- regra de unidades, acolhimento_journey, care_contacts, dados de pessoas.
-- ============================================================================

-- ── 1. Contatos pastorais da pessoa, em ordem, com ordinal ───────────────────
CREATE OR REPLACE FUNCTION get_person_contacts(p_person_id uuid)
RETURNS TABLE (
  event_id          uuid,
  ordinal           integer,
  event_at          timestamptz,
  contact_date      timestamptz,
  actor_id          uuid,
  actor_name        text,
  channel           text,
  result            text,
  notes             text,
  journey_id        uuid,
  journey_closed_at timestamptz,
  journey_outcome   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_church uuid := auth_church_id();   -- tenant efetivo (JWT ou impersonação válida)
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    IF v_church IS NULL OR NOT EXISTS (
      SELECT 1 FROM people p WHERE p.id = p_person_id AND p.church_id = v_church
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    je.id,
    ROW_NUMBER() OVER (ORDER BY je.created_at, je.payload ->> 'contact_date', je.id)::integer,
    je.created_at,
    COALESCE(
      CASE WHEN je.payload ->> 'contact_date' ~ '^\d{4}-\d{2}-\d{2}'
           THEN (je.payload ->> 'contact_date')::timestamptz END,
      je.created_at),
    je.actor_id,
    COALESCE(
      pr.name, pr.display_name,
      au.raw_user_meta_data ->> 'full_name', au.email,
      CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
    )::text,
    je.payload ->> 'channel',
    je.payload ->> 'result',
    NULLIF(je.payload ->> 'notes', ''),
    pj.id,
    pj.closed_at,
    pj.outcome
  FROM journey_events je
  JOIN person_journey pj ON pj.id = je.journey_id
  LEFT JOIN auth.users au ON au.id      = je.actor_id
  LEFT JOIN profiles   pr ON pr.user_id = je.actor_id
  WHERE pj.person_id  = p_person_id
    AND je.event_type = 'pastoral_contact'
    AND (auth.role() = 'service_role' OR pj.church_id = v_church)
  ORDER BY je.created_at, je.payload ->> 'contact_date', je.id;
END;
$$;
REVOKE ALL ON FUNCTION get_person_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_person_contacts(uuid) TO authenticated, service_role;

-- ── 2. Hardening: atendimento sem jornada e sem etapa → JOURNEY_REQUIRED ─────
DO $$
DECLARE
  v_oid oid; v_def text; v_new text;
  v_old text := $q$  IF NOT FOUND THEN
    IF p_new_stage_id IS NOT NULL THEN
      INSERT INTO person_journey$q$;
  v_rep text := $q$  IF NOT FOUND THEN
    -- Sem jornada aberta e sem etapa: não pode haver sucesso silencioso sem contato
    IF p_new_stage_id IS NULL THEN
      RAISE EXCEPTION 'JOURNEY_REQUIRED'
        USING ERRCODE = 'P0001',
              HINT = 'Pessoa sem jornada aberta: informe a etapa para abrir a jornada e registrar o contato';
    END IF;
    IF p_new_stage_id IS NOT NULL THEN
      INSERT INTO person_journey$q$;
BEGIN
  SELECT p.oid INTO v_oid FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'journey_register_attendance';
  IF v_oid IS NULL THEN RAISE EXCEPTION 'journey_register_attendance não encontrada'; END IF;
  v_def := pg_get_functiondef(v_oid);
  IF position('JOURNEY_REQUIRED' IN v_def) > 0 THEN RETURN; END IF;
  v_new := replace(v_def, v_old, v_rep);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'Trecho "IF NOT FOUND / IF p_new_stage_id IS NOT NULL" não encontrado em journey_register_attendance';
  END IF;
  EXECUTE v_new;
END $$;

-- ── 3. Verificações ──────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'get_person_contacts') THEN
    RAISE EXCEPTION 'get_person_contacts ausente';
  END IF;
  IF (SELECT pg_get_functiondef(oid) FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'journey_register_attendance')
     NOT ILIKE '%JOURNEY_REQUIRED%' THEN
    RAISE EXCEPTION 'hardening JOURNEY_REQUIRED não aplicado';
  END IF;
  -- Funções que NÃO podem ter mudado nesta migration (assinatura preservada)
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_contact_counts' AND pg_get_function_identity_arguments(oid) = 'p_church_id uuid, p_person_ids uuid[]') THEN
    RAISE EXCEPTION 'get_contact_counts alterada';
  END IF;
END $$;
