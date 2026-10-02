-- ============================================================
-- FRENTE 1 — Integridade cadastral: 1 pessoa = 1 telefone por igreja
-- (itens 8 + 12 da ata IGV)
--
-- O que esta migration faz:
--   1. normalize_phone_br(text): forma canônica do telefone (DDD + número, sem DDI 55).
--   2. people.phone_normalized: coluna GERADA (people.phone continua intacto).
--   3. Trigger people_enforce_unique_phone: última barreira no banco — bloqueia
--      INSERT / troca de telefone / reativação quando outra pessoa ativa da MESMA
--      igreja já tem o mesmo telefone canônico. Serializa concorrência com advisory lock.
--   4. Trigger people_audit_identity: registra alteração de nome/telefone em audit_logs.
--   5. find_person_by_phone(): localizar o cadastro existente (respeita RLS/tenant).
--   6. create_person(): passa a usar a mesma normalização; telefone duplicado nunca passa.
--
-- O que esta migration NÃO faz:
--   - não altera, mescla nem apaga nenhum registro existente (os 22 grupos legados ficam como estão);
--   - não cria UNIQUE global entre igrejas;
--   - não torna phone NOT NULL;
--   - não remove o índice people_church_phone_unique (texto cru) — ele continua sendo o
--     árbitro de ON CONFLICT (church_id, phone).
--
-- Por que trigger e não índice único agora: existem 22 grupos legados duplicados na IGV
-- (pessoa real "+55…" × "Contato NNNN" "55…"); um índice único falharia na criação.
-- Depois do saneamento (frente própria), criar o índice definitivo:
--   CREATE UNIQUE INDEX people_church_phone_normalized_unique
--     ON people (church_id, phone_normalized)
--     WHERE deleted_at IS NULL AND phone_normalized IS NOT NULL;
-- ============================================================

-- ── 1. Normalização canônica ─────────────────────────────────
-- Só dígitos; remove zeros à esquerda (prefixo de tronco); remove o DDI 55 apenas
-- quando o total é 12 ou 13 dígitos (55 + DDD + 8/9 dígitos). Um número de 10/11
-- dígitos que começa com 55 é DDD 55 (RS) e fica como está.
-- Não trata 9º dígito: números diferentes não são igualados.
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
           WHEN d = '' THEN NULL
           WHEN length(d) IN (12, 13) AND left(d, 2) = '55' THEN substr(d, 3)
           ELSE d
         END
  FROM (SELECT ltrim(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '0') AS d) s
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone_br(text) TO authenticated, service_role, anon;

-- ── 2. Coluna gerada + índice de busca ───────────────────────
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS phone_normalized text
  GENERATED ALWAYS AS (public.normalize_phone_br(phone)) STORED;

CREATE INDEX IF NOT EXISTS people_church_phone_normalized_idx
  ON public.people (church_id, phone_normalized)
  WHERE deleted_at IS NULL AND phone_normalized IS NOT NULL;

-- ── 3. Última barreira: telefone único por igreja ────────────
CREATE OR REPLACE FUNCTION public.people_enforce_unique_phone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_norm text := normalize_phone_br(NEW.phone);
BEGIN
  -- Sem telefone ou registro excluído: nada a proteger
  IF v_norm IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- UPDATE que não muda o telefone canônico, nem reativa, nem troca de igreja:
  -- não revalida (permite continuar editando os registros legados duplicados).
  IF TG_OP = 'UPDATE' THEN
    IF normalize_phone_br(OLD.phone) IS NOT DISTINCT FROM v_norm
       AND OLD.deleted_at IS NULL
       AND OLD.church_id = NEW.church_id THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Serializa cadastros simultâneos do mesmo telefone na mesma igreja
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.church_id::text || ':' || v_norm, 8012));

  -- Telefone cru idêntico fica com o índice people_church_phone_unique
  -- (preserva ON CONFLICT (church_id, phone)); aqui pegamos os outros formatos.
  IF EXISTS (
    SELECT 1
      FROM people p
     WHERE p.church_id = NEW.church_id
       AND p.phone_normalized = v_norm
       AND p.deleted_at IS NULL
       AND p.id <> NEW.id
       AND p.phone IS DISTINCT FROM NEW.phone
  ) THEN
    RAISE EXCEPTION 'PHONE_ALREADY_LINKED: Este telefone já está vinculado a uma pessoa cadastrada.'
      USING ERRCODE = '23505',
            CONSTRAINT = 'people_church_phone_normalized_unique';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS people_enforce_unique_phone ON public.people;
CREATE TRIGGER people_enforce_unique_phone
  BEFORE INSERT OR UPDATE OF phone, deleted_at, church_id ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_enforce_unique_phone();

-- ── 4. Auditoria mínima de nome/telefone (reutiliza audit_logs) ──
CREATE OR REPLACE FUNCTION public.people_audit_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_actor text := COALESCE(v_uid::text, auth.jwt()->>'role', current_user);
BEGIN
  IF NEW.name IS DISTINCT FROM OLD.name
     OR NEW.first_name IS DISTINCT FROM OLD.first_name
     OR NEW.last_name  IS DISTINCT FROM OLD.last_name THEN
    INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
    VALUES (NEW.church_id, 'person', NEW.id, 'person_name_changed',
            CASE WHEN v_uid IS NULL THEN 'system' ELSE 'human' END, v_actor,
            jsonb_build_object(
              'old', jsonb_build_object('name', OLD.name, 'first_name', OLD.first_name, 'last_name', OLD.last_name),
              'new', jsonb_build_object('name', NEW.name, 'first_name', NEW.first_name, 'last_name', NEW.last_name)));
  END IF;

  IF NEW.phone IS DISTINCT FROM OLD.phone THEN
    INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
    VALUES (NEW.church_id, 'person', NEW.id, 'person_phone_changed',
            CASE WHEN v_uid IS NULL THEN 'system' ELSE 'human' END, v_actor,
            jsonb_build_object('old', OLD.phone, 'new', NEW.phone));
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS people_audit_identity ON public.people;
CREATE TRIGGER people_audit_identity
  AFTER UPDATE OF name, first_name, last_name, phone ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_audit_identity();

-- ── 5. Localizar cadastro existente pelo telefone ────────────
-- SECURITY INVOKER: vale a RLS de people (só a igreja do usuário).
CREATE OR REPLACE FUNCTION public.find_person_by_phone(p_phone text, p_exclude_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT p.id,
         COALESCE(NULLIF(btrim(p.name), ''), NULLIF(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Sem nome')
    FROM people p
   WHERE p.church_id = auth_church_id()
     AND p.deleted_at IS NULL
     AND normalize_phone_br(p_phone) IS NOT NULL
     AND p.phone_normalized = normalize_phone_br(p_phone)
     AND (p_exclude_id IS NULL OR p.id <> p_exclude_id)
   ORDER BY p.created_at
   LIMIT 5
$$;

REVOKE ALL ON FUNCTION public.find_person_by_phone(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_person_by_phone(text, uuid) TO authenticated, service_role;

-- ── 6. create_person: entrada canônica segura ────────────────
-- Função que existia só no banco (sem migration, sem consumidores). Mesma assinatura e
-- mesmo contrato de retorno. Mudanças: normalização única e telefone duplicado sempre
-- bloqueado com reason = 'phone_already_linked'.
CREATE OR REPLACE FUNCTION public.create_person(p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_birth_date date DEFAULT NULL::date, p_source text DEFAULT 'manual'::text, p_como_conheceu text DEFAULT NULL::text, p_marital_status text DEFAULT NULL::text, p_children_count integer DEFAULT NULL::integer, p_children_info text DEFAULT NULL::text, p_zip_code text DEFAULT NULL::text, p_street text DEFAULT NULL::text, p_street_number text DEFAULT NULL::text, p_address_complement text DEFAULT NULL::text, p_neighborhood text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_allow_duplicate boolean DEFAULT false, p_church_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church_id     uuid;
  v_actor_id      text;
  v_actor_type    text;
  v_is_service    boolean;
  v_phone_norm    text;
  v_new_id        uuid;
  v_candidates    jsonb;
BEGIN
  -- ── 1. Identificar caller e resolver tenant ────────────────────────────
  -- current_user = 'service_role' → chamada de agente/backend
  -- current_user = 'authenticated' → chamada de usuário logado
  -- Qualquer outro role → não deveria chegar aqui por causa dos GRANTs
  v_is_service := coalesce(auth.jwt()->>'role', '') = 'service_role';

  IF v_is_service THEN
    v_church_id  := p_church_id;
    v_actor_id   := 'agent';
    v_actor_type := 'agent';
  ELSE
    -- authenticated: church_id SEMPRE do JWT, p_church_id é silenciosamente ignorado
    v_church_id  := auth_church_id();
    v_actor_id   := COALESCE(auth.uid()::text, 'unknown');
    v_actor_type := 'human';
  END IF;

  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: church_id não identificado — JWT inválido ou p_church_id ausente';
  END IF;

  -- ── 2. Validar nome ────────────────────────────────────────────────────
  IF NULLIF(TRIM(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: p_name não pode ser vazio';
  END IF;

  -- ── 3. Normalizar telefone (mesma forma canônica de people.phone_normalized) ──
  v_phone_norm := normalize_phone_br(p_phone);

  -- ── 4. Verificar duplicidade ───────────────────────────────────────────
  -- 4a. Telefone: 1 pessoa = 1 telefone por igreja. NUNCA cria, nem com p_allow_duplicate.
  IF v_phone_norm IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'email', email, 'created_at', created_at) ORDER BY created_at)
      INTO v_candidates
      FROM people
     WHERE church_id = v_church_id
       AND deleted_at IS NULL
       AND phone_normalized = v_phone_norm;

    IF v_candidates IS NOT NULL THEN
      RETURN jsonb_build_object(
        'created',    false,
        'person_id',  NULL::uuid,
        'duplicates', v_candidates,
        'reason',     'phone_already_linked'
      );
    END IF;
  END IF;

  -- 4b. E-mail: alerta de possível duplicidade (pode ser liberado com p_allow_duplicate)
  IF NOT p_allow_duplicate AND NULLIF(TRIM(COALESCE(p_email,'')), '') IS NOT NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'email', email, 'created_at', created_at) ORDER BY created_at)
      INTO v_candidates
      FROM people
     WHERE church_id = v_church_id
       AND deleted_at IS NULL
       AND COALESCE(email,'') <> ''
       AND LOWER(TRIM(email)) = LOWER(TRIM(p_email));

    IF v_candidates IS NOT NULL THEN
      RETURN jsonb_build_object(
        'created',    false,
        'person_id',  NULL::uuid,
        'duplicates', v_candidates,
        'reason',     'duplicate_found'
      );
    END IF;
  END IF;

  -- ── 5. Inserir pessoa ────────────────────────────────────────────────────
  -- A trigger people_enforce_unique_phone é a última barreira (corrida entre 4a e o INSERT).
  BEGIN
  INSERT INTO people (
    church_id, name, phone, email, birth_date, source,
    como_conheceu, marital_status, children_count, children_info,
    zip_code, street, street_number, address_complement,
    neighborhood, city, state,
    observacoes_pastorais
  )
  VALUES (
    v_church_id,
    TRIM(p_name),
    NULLIF(TRIM(COALESCE(p_phone,'')), ''),
    NULLIF(LOWER(TRIM(COALESCE(p_email,''))), ''),
    p_birth_date,
    COALESCE(NULLIF(TRIM(COALESCE(p_source,'')),''), 'manual'),
    NULLIF(TRIM(COALESCE(p_como_conheceu,'')), ''),
    NULLIF(TRIM(COALESCE(p_marital_status,'')), ''),
    p_children_count,
    NULLIF(TRIM(COALESCE(p_children_info,'')), ''),
    NULLIF(regexp_replace(COALESCE(p_zip_code,''), '\D','','g'), ''),
    NULLIF(TRIM(COALESCE(p_street,'')), ''),
    NULLIF(TRIM(COALESCE(p_street_number,'')), ''),
    NULLIF(TRIM(COALESCE(p_address_complement,'')), ''),
    NULLIF(TRIM(COALESCE(p_neighborhood,'')), ''),
    NULLIF(TRIM(COALESCE(p_city,'')), ''),
    NULLIF(UPPER(TRIM(COALESCE(p_state,''))), ''),
    NULLIF(TRIM(COALESCE(p_notes,'')), '')
  )
  RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM NOT LIKE 'PHONE_ALREADY_LINKED%' AND SQLERRM NOT LIKE '%people_church_phone%' THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object(
      'created',    false,
      'person_id',  NULL::uuid,
      'duplicates', '[]'::jsonb,
      'reason',     'phone_already_linked'
    );
  END;

  -- ── 6. Registrar na auditoria ────────────────────────────────────────────
  INSERT INTO audit_logs (
    church_id, entity_type, entity_id, action,
    actor_type, actor_id, payload
  )
  VALUES (
    v_church_id,
    'person',
    v_new_id,
    'person_created',
    v_actor_type,
    v_actor_id,
    jsonb_build_object(
      'name',            TRIM(p_name),
      'source',          COALESCE(NULLIF(TRIM(COALESCE(p_source,'')),''), 'manual'),
      'allow_duplicate', p_allow_duplicate,
      'via',             'create_person_rpc'
    )
  );

  -- ── 7. Retornar ────────────────────────────────────────────────────────
  RETURN jsonb_build_object(
    'created',    true,
    'person_id',  v_new_id,
    'duplicates', '[]'::jsonb,
    'reason',     'ok'
  );
END;
$function$;
