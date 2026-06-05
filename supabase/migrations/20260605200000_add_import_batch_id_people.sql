-- Migration: add import_batch_id to people table
-- Purpose: enables reversible batch imports — soft-delete an entire import in one click
-- Companion feature: ImportacaoMembros v2 auto-detection (feat/importacao-auto-detect)

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS import_batch_id uuid;

CREATE INDEX IF NOT EXISTS idx_people_import_batch_id
  ON public.people (import_batch_id)
  WHERE import_batch_id IS NOT NULL;

COMMENT ON COLUMN public.people.import_batch_id IS
  'UUID único por lote de importação xlsx/csv. Permite desfazer lote inteiro via soft-delete.';
