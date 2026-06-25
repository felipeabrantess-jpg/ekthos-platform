-- F1: Auto-cadastro de empresários IGV
-- Adiciona colunas nome_contato e lgpd_consent para self-registration flow
ALTER TABLE public.church_empresarios
  ADD COLUMN IF NOT EXISTS nome_contato text,
  ADD COLUMN IF NOT EXISTS lgpd_consent boolean NOT NULL DEFAULT false;

-- Policy anon INSERT: restrita à IGV, somente como pendente, com LGPD aceito
-- A EF igv-public-empresarios-create usa service_role (bypassa RLS),
-- mas esta policy protege acesso direto anon à tabela
CREATE POLICY "empresarios_anon_insert_igv_pending"
  ON public.church_empresarios
  FOR INSERT
  TO anon
  WITH CHECK (
    church_id = '6c127559-874a-4748-8fce-55d4079613a5'::uuid
    AND authorized_public = false
    AND active = true
    AND lgpd_consent = true
  );
