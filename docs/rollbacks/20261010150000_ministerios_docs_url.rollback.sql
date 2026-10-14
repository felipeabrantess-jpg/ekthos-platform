-- Rollback da 20261010150000 (item 14, ata IGV): remove a RPC e a coluna.
-- ATENÇÃO: descarta o link configurado dentro do sistema; o botão volta a depender de VITE_IGV_MINISTERIOS_DOCS_URL.
DROP FUNCTION IF EXISTS public.set_ministerios_docs_url(text);
ALTER TABLE public.church_settings DROP COLUMN IF EXISTS ministerios_docs_url;
