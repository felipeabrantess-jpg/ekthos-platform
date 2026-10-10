-- ============================================================
-- Ata IGV — item 14: link da Documentação de Ministérios configurável DENTRO do sistema.
--
-- Requisito da IGV: "um campo de preenchimento e um botão enviar" para a própria igreja informar o
-- endereço, sem variável de ambiente nem redeploy.
--
-- Mudança ADITIVA:
--   1. church_settings.ministerios_docs_url (text, nullable) — uma configuração por igreja;
--   2. set_ministerios_docs_url(p_url): única porta de escrita. SECURITY DEFINER, só admin /
--      admin_departments da igreja do chamador (tenant efetivo), só https, até 2000 caracteres.
--      Texto vazio limpa o link. Não cria linhas: a igreja precisa já ter church_settings.
-- A leitura usa a política existente church_settings_tenant_select (nada muda em RLS).
-- ============================================================

ALTER TABLE public.church_settings
  ADD COLUMN IF NOT EXISTS ministerios_docs_url text;

COMMENT ON COLUMN public.church_settings.ministerios_docs_url IS
  'Item 14 (ata IGV): link https da pasta de documentação dos Ministérios; NULL = não configurado.';

CREATE OR REPLACE FUNCTION public.set_ministerios_docs_url(p_url text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church uuid;
  v_admin  boolean;
  v_url    text;
BEGIN
  v_church := auth_church_id();
  IF v_church IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'igreja não identificada';
  END IF;

  SELECT (ur.role IN ('admin', 'admin_departments')) INTO v_admin
  FROM user_roles ur
  WHERE ur.user_id = auth.uid() AND ur.church_id = v_church
  LIMIT 1;
  IF NOT COALESCE(v_admin, false) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501', HINT = 'somente administração pode configurar o link';
  END IF;

  v_url := NULLIF(btrim(p_url), '');
  IF v_url IS NOT NULL AND (length(v_url) > 2000 OR v_url !~* '^https://[^[:space:]]+$') THEN
    RAISE EXCEPTION 'INVALID_URL' USING ERRCODE = '22023', HINT = 'informe um endereço https:// válido';
  END IF;

  UPDATE church_settings
     SET ministerios_docs_url = v_url, updated_at = now()
   WHERE church_id = v_church;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SETTINGS_NOT_FOUND' USING ERRCODE = 'P0002', HINT = 'a igreja ainda não tem configurações';
  END IF;

  RETURN v_url;
END $function$;

REVOKE ALL ON FUNCTION public.set_ministerios_docs_url(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_ministerios_docs_url(text) TO authenticated, service_role;
