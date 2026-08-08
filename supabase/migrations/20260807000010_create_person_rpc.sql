-- Migration: 20260807000010_create_person_rpc
-- Porta oficial de criação de pessoas via RPC.
--
-- Regras de tenant:
--   authenticated  → church_id SEMPRE do JWT (p_church_id ignorado)
--   service_role   → usa p_church_id (para agentes)
--
-- Detecção: session_user = 'service_role'
-- NOTA: dentro de SECURITY DEFINER, current_user = owner da função (postgres).
-- session_user preserva o role original do caller — correto para detectar service_role.

-- ── DROP de versão anterior (idempotência) ─────────────────────────────
DROP FUNCTION IF EXISTS public.create_person(
  text, text, text, date, text, text, text, integer, text,
  text, text, text, text, text, text, text, text, boolean, uuid
);

-- ── Função principal ────────────────────────────────────────────────────
CREATE FUNCTION public.create_person(
  p_name               text,
  p_phone              text        DEFAULT NULL,
  p_email              text        DEFAULT NULL,
  p_birth_date         date        DEFAULT NULL,
  p_source             text        DEFAULT 'manual',
  p_como_conheceu      text        DEFAULT NULL,
  p_marital_status     text        DEFAULT NULL,
  p_children_count     integer     DEFAULT NULL,
  p_children_info      text        DEFAULT NULL,
  p_zip_code           text        DEFAULT NULL,
  p_street             text        DEFAULT NULL,
  p_street_number      text        DEFAULT NULL,
  p_address_complement text        DEFAULT NULL,
  p_neighborhood       text        DEFAULT NULL,
  p_city               text        DEFAULT NULL,
  p_state              text        DEFAULT NULL,
  p_notes              text        DEFAULT NULL,
  p_allow_duplicate    boolean     DEFAULT FALSE,
  p_church_id          uuid        DEFAULT NULL   -- ignorado para authenticated; obrigatório para service_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  v_is_service := (session_user = 'service_role');

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

  -- ── 3. Normalizar telefone (últimos 11 dígitos = DDD + número BR) ──────
  -- Exemplos normalizados para '21996339391':
  --   '+5521996339391' → '5521996339391' → últimos 11 → '21996339391'
  --   '5521996339391'  → '5521996339391' → últimos 11 → '21996339391'
  --   '(21) 99633-9391' → '21996339391' → últimos 11 → '21996339391'
  v_phone_norm := CASE
    WHEN p_phone IS NOT NULL AND regexp_replace(p_phone, '\D', '', 'g') <> ''
      THEN RIGHT(regexp_replace(p_phone, '\D', '', 'g'), 11)
    ELSE NULL
  END;

  -- ── 4. Verificar duplicidade ───────────────────────────────────────────
  IF NOT p_allow_duplicate AND (v_phone_norm IS NOT NULL OR NULLIF(TRIM(COALESCE(p_email,'')), '') IS NOT NULL) THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',         id,
        'name',       name,
        'phone',      phone,
        'email',      email,
        'created_at', created_at
      ) ORDER BY created_at
    )
    INTO v_candidates
    FROM people
    WHERE church_id = v_church_id
      AND deleted_at IS NULL
      AND (
        (v_phone_norm IS NOT NULL
          AND RIGHT(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 11) = v_phone_norm
          AND COALESCE(phone,'') <> '')
        OR
        (NULLIF(TRIM(COALESCE(p_email,'')), '') IS NOT NULL
          AND LOWER(TRIM(COALESCE(email,''))) = LOWER(TRIM(p_email))
          AND COALESCE(email,'') <> '')
      );

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
$$;

-- ── Grants ─────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_person(
  text, text, text, date, text, text, text, integer, text,
  text, text, text, text, text, text, text, text, boolean, uuid
) FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.create_person(
  text, text, text, date, text, text, text, integer, text,
  text, text, text, text, text, text, text, text, boolean, uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.create_person(
  text, text, text, date, text, text, text, integer, text,
  text, text, text, text, text, text, text, text, boolean, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_person(
  text, text, text, date, text, text, text, integer, text,
  text, text, text, text, text, text, text, text, boolean, uuid
) TO service_role;
