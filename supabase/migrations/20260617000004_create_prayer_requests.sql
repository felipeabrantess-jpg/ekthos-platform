-- ============================================================
-- Migration: 20260617000004_create_prayer_requests
-- Feature: PWA IGV — Pedidos de Oração
-- LGPD R8: request_text NUNCA exposto a anon (zero política anon)
-- ============================================================

-- 1. Expande CHECK constraint de people.source para incluir 'oracao_igv'
ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_source_check;
ALTER TABLE public.people ADD CONSTRAINT people_source_check CHECK (
  source IN (
    'whatsapp', 'instagram', 'manual', 'import', 'onboarding',
    'qr_code', 'lead_form', 'visitor_form', 'agent_capture',
    'import_xlsx', 'migration', 'curso_igv', 'oracao_igv'
  )
);

-- 2. Cria tabela prayer_requests
CREATE TABLE IF NOT EXISTS public.prayer_requests (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    uuid         NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  person_id    uuid         REFERENCES public.people(id) ON DELETE SET NULL,
  name         text         NOT NULL,
  phone        text         NOT NULL,
  request_text text         NOT NULL,
  status       text         NOT NULL DEFAULT 'novo'
                            CHECK (status IN ('novo', 'orado', 'atendido')),
  is_test      boolean      NOT NULL DEFAULT false,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- 3. RLS: SOMENTE authenticated vê pedidos da própria church (zero acesso anon)
ALTER TABLE public.prayer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY prayer_requests_tenant_all ON public.prayer_requests
  FOR ALL
  TO authenticated
  USING      (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- 4. Trigger updated_at
CREATE OR REPLACE FUNCTION public.update_prayer_requests_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prayer_requests_updated_at
  BEFORE UPDATE ON public.prayer_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_prayer_requests_updated_at();

-- 5. Revoga acesso REST à função de trigger (security advisor)
REVOKE EXECUTE ON FUNCTION public.update_prayer_requests_updated_at() FROM anon, authenticated;
