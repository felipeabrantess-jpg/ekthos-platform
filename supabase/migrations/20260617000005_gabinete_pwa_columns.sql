-- ============================================================
-- Migration: 20260617000005_gabinete_pwa_columns
-- Feature: PWA IGV — Gabinete (agendamento pastoral público)
-- LGPD: theme/notes NUNCA em log. Zero acesso anon a pedidos.
-- Non-destructive: ADD COLUMN IF NOT EXISTS. Registro existente intacto.
-- ============================================================

-- 1. Adiciona 5 colunas novas em pastoral_appointments (não-destrutivo)
ALTER TABLE public.pastoral_appointments
  ADD COLUMN IF NOT EXISTS theme                  text,
  ADD COLUMN IF NOT EXISTS cabinet_pastor_id      uuid
      REFERENCES public.pastoral_cabinet(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_datetime_text text,
  ADD COLUMN IF NOT EXISTS is_test                boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source                 text    NOT NULL DEFAULT 'crm';

-- 2. Expande CHECK constraint de people.source para incluir 'gabinete_igv'
--    (people_source_check foi expandida na migration anterior para oracao_igv)
ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_source_check;
ALTER TABLE public.people ADD CONSTRAINT people_source_check CHECK (
  source IN (
    'whatsapp', 'instagram', 'manual', 'import', 'onboarding',
    'qr_code', 'lead_form', 'visitor_form', 'agent_capture',
    'import_xlsx', 'migration', 'curso_igv', 'oracao_igv', 'gabinete_igv'
  )
);
