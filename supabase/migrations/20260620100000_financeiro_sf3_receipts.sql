-- SF3 Financeiro: bucket privado financial-receipts + RLS Storage + receipt_path em expenses
-- Isolamento multi-tenant via path: {church_id}/{uuid}.ext
-- Signed URL 1h para visualização. NUNCA URL pública.

-- ── 1. Bucket privado financial-receipts ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'financial-receipts',
  'financial-receipts',
  false,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. RLS de Storage (storage.objects) ─────────────────────────────────────
-- Isolamento: split_part(name, '/', 1) = church_id (1º segmento do path)
-- Restrição de role: auth_can_financial() = admin ou tesoureiro

-- SELECT (visualizar / signed URL)
CREATE POLICY receipts_tenant_select ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'financial-receipts'
    AND split_part(name, '/', 1) = auth_church_id()::text
    AND auth_can_financial()
  );

-- INSERT (upload)
CREATE POLICY receipts_tenant_insert ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'financial-receipts'
    AND split_part(name, '/', 1) = auth_church_id()::text
    AND auth_can_financial()
  );

-- UPDATE (upsert em re-upload)
CREATE POLICY receipts_tenant_update ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'financial-receipts'
    AND split_part(name, '/', 1) = auth_church_id()::text
    AND auth_can_financial()
  )
  WITH CHECK (
    bucket_id = 'financial-receipts'
    AND split_part(name, '/', 1) = auth_church_id()::text
    AND auth_can_financial()
  );

-- DELETE (remover comprovante)
CREATE POLICY receipts_tenant_delete ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'financial-receipts'
    AND split_part(name, '/', 1) = auth_church_id()::text
    AND auth_can_financial()
  );

-- ── 3. Campo receipt_path em expenses ──────────────────────────────────────
-- Armazena path no Storage (ex: "6c127559-.../abc-123.pdf"), NÃO URL pública
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_path text NULL;
