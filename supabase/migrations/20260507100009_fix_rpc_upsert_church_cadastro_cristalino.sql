-- ============================================================
-- Frente 3A — Migration 9 (numerada como 100009)
-- FIX: upsert_church_cadastro_cristalino
-- Bug: usava phone/email mas colunas reais são main_phone/main_email
-- Fix: corrige nomes de colunas + adiciona pastor_titular_name e
--      pastor_titular_phone (existiam antes de M2, faltaram no M5)
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_church_cadastro_cristalino(
  p_church_id      uuid,
  p_church_data    jsonb,
  p_contractor_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_contractor_id      uuid;
  v_replaced_contractor_id uuid;
  v_doc_number             text;
  v_doc_type               text;
  v_person_type            text;
  v_role_label             text;
  v_name                   text;
BEGIN
  -- Guard: ekthos admin OU 4 roles autorizados
  IF NOT (
    is_ekthos_admin()
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = p_church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  ) THEN
    RAISE EXCEPTION 'permission_denied: not authorized to update church %', p_church_id;
  END IF;

  -- Valida existência da igreja
  IF NOT EXISTS (SELECT 1 FROM public.churches WHERE id = p_church_id) THEN
    RAISE EXCEPTION 'not_found: church % does not exist', p_church_id;
  END IF;

  -- 1. UPDATE churches com dados da Etapa 1
  -- Colunas corretas: main_phone (não phone), main_email (não email)
  -- Inclui pastor_titular_name e pastor_titular_phone (pré-existentes)
  UPDATE public.churches SET
    name                          = COALESCE(NULLIF(TRIM(p_church_data->>'name'), ''), name),
    city                          = COALESCE(NULLIF(TRIM(p_church_data->>'city'), ''), city),
    uf                            = COALESCE(NULLIF(TRIM(p_church_data->>'uf'), ''), uf),
    main_phone                    = COALESCE(NULLIF(TRIM(p_church_data->>'main_phone'), ''), main_phone),
    main_email                    = COALESCE(NULLIF(TRIM(p_church_data->>'main_email'), ''), main_email),
    pastor_titular_name           = COALESCE(NULLIF(TRIM(p_church_data->>'pastor_titular_name'), ''), pastor_titular_name),
    pastor_titular_phone          = COALESCE(NULLIF(TRIM(p_church_data->>'pastor_titular_phone'), ''), pastor_titular_phone),
    pastor_titular_email          = COALESCE(NULLIF(TRIM(p_church_data->>'pastor_titular_email'), ''), pastor_titular_email),
    pastor_titular_can_be_quoted  = COALESCE((p_church_data->>'pastor_titular_can_be_quoted')::boolean, pastor_titular_can_be_quoted),
    onboarding_step               = 'pastoral',
    updated_at                    = now()
  WHERE id = p_church_id;

  -- 2. Extrai e valida campos obrigatórios do contractor
  v_doc_number  := TRIM(p_contractor_data->>'document_number');
  v_doc_type    := LOWER(TRIM(p_contractor_data->>'document_type'));
  v_person_type := LOWER(TRIM(p_contractor_data->>'person_type'));
  v_role_label  := TRIM(p_contractor_data->>'role_label');
  v_name        := TRIM(p_contractor_data->>'name');

  IF v_doc_number IS NULL OR v_doc_number = '' THEN
    RAISE EXCEPTION 'validation_error: document_number is required';
  END IF;
  IF v_doc_type NOT IN ('cpf', 'cnpj') THEN
    RAISE EXCEPTION 'validation_error: document_type must be cpf or cnpj, got %', v_doc_type;
  END IF;
  IF v_person_type NOT IN ('pf', 'pj') THEN
    RAISE EXCEPTION 'validation_error: person_type must be pf or pj, got %', v_person_type;
  END IF;
  IF v_person_type = 'pj' AND v_doc_type = 'cpf' THEN
    RAISE EXCEPTION 'validation_error: person_type=pj cannot use document_type=cpf';
  END IF;
  IF v_doc_type = 'cpf' AND v_doc_number !~ '^\d{11}$' THEN
    RAISE EXCEPTION 'validation_error: CPF must have exactly 11 digits, got "%"', v_doc_number;
  END IF;
  IF v_doc_type = 'cnpj' AND v_doc_number !~ '^\d{14}$' THEN
    RAISE EXCEPTION 'validation_error: CNPJ must have exactly 14 digits, got "%"', v_doc_number;
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'validation_error: contractor name is required';
  END IF;
  IF v_role_label IS NULL OR v_role_label = '' THEN
    RAISE EXCEPTION 'validation_error: role_label is required';
  END IF;

  -- 3. Soft-delete do contractor ativo com o mesmo document_number na mesma igreja
  UPDATE public.contractors SET
    is_active           = false,
    deactivated_at      = now(),
    deactivation_reason = 'substituído via wizard cadastro cristalino'
  WHERE church_id       = p_church_id
    AND document_number = v_doc_number
    AND is_active       = true
  RETURNING id INTO v_replaced_contractor_id;

  -- 4. INSERT do novo contractor
  INSERT INTO public.contractors (
    church_id,
    name,
    document_type,
    document_number,
    person_type,
    role_label,
    email,
    phone,
    is_active,
    notes,
    created_by
  ) VALUES (
    p_church_id,
    v_name,
    v_doc_type,
    v_doc_number,
    v_person_type,
    v_role_label,
    NULLIF(TRIM(p_contractor_data->>'email'), ''),
    NULLIF(TRIM(p_contractor_data->>'phone'), ''),
    true,
    NULLIF(TRIM(p_contractor_data->>'notes'), ''),
    auth.uid()
  )
  RETURNING id INTO v_new_contractor_id;

  RETURN jsonb_build_object(
    'success',               true,
    'church_id',             p_church_id,
    'onboarding_step',       'pastoral',
    'contractor_id',         v_new_contractor_id,
    'replaced_contractor_id', v_replaced_contractor_id
  );
END;
$$;

COMMENT ON FUNCTION public.upsert_church_cadastro_cristalino(uuid, jsonb, jsonb)
  IS 'Etapa 1 do wizard: atualiza churches + soft-delete contractor antigo + INSERT novo. Transição onboarding_step → pastoral. Fix M9: main_phone/main_email + pastor_titular_name/phone (Frente 3A)';
