-- Migration: Registro de Culto (Fatia 1 — banco)
-- 3 tabelas: service_report_reporters, service_reports, service_report_area_counts
-- Padrão de token idêntico ao care_responsibles (token 256-bit, acesso sem login via EF service_role)
-- Multi-tenant: church_id NOT NULL em todas as tabelas. Isolamento por sede no reporter.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. service_report_reporters — "carteirinha" do voluntário (link fixo por sede)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_report_reporters (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  sede       text        NOT NULL DEFAULT 'geral'
               CHECK (sede IN ('itaipu', 'trindade', 'geral')),
  fill_token text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_report_reporters ENABLE ROW LEVEL SECURITY;

-- service_role: bypass total (EF usa service_role)
CREATE POLICY srr_service
  ON public.service_report_reporters FOR ALL
  USING (auth.role() = 'service_role');

-- CRM autenticado: isolado por church_id do JWT
CREATE POLICY srr_tenant_select
  ON public.service_report_reporters FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY srr_tenant_insert
  ON public.service_report_reporters FOR INSERT
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY srr_tenant_update
  ON public.service_report_reporters FOR UPDATE
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY srr_tenant_delete
  ON public.service_report_reporters FOR DELETE
  USING (church_id = auth_church_id());

CREATE INDEX IF NOT EXISTS idx_srr_church
  ON public.service_report_reporters(church_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_srr_token
  ON public.service_report_reporters(fill_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. service_reports — cada culto preenchido (um por submissão)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_reports (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  reporter_id       uuid        REFERENCES public.service_report_reporters(id) ON DELETE SET NULL,
  sede              text        NOT NULL DEFAULT 'geral'
                      CHECK (sede IN ('itaipu', 'trindade', 'geral')),
  -- Info do culto
  service_date      date,
  service_type      text        NOT NULL DEFAULT 'domingo_manha'
                      CHECK (service_type IN ('domingo_manha', 'domingo_noite', 'quarta', 'especial')),
  pastor_name       text,
  is_guest_pastor   boolean     NOT NULL DEFAULT false,
  guest_pastor_name text,
  worship_leader    text,
  sermon_topic      text,
  -- Contagens gerais
  total_people      integer,
  total_visitors    integer,
  -- Misc
  notes             text,
  -- Status e acesso
  status            text        NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'submitted')),
  view_token        text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  submitted_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY sr_service
  ON public.service_reports FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY sr_tenant_select
  ON public.service_reports FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY sr_tenant_insert
  ON public.service_reports FOR INSERT
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY sr_tenant_update
  ON public.service_reports FOR UPDATE
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY sr_tenant_delete
  ON public.service_reports FOR DELETE
  USING (church_id = auth_church_id());

CREATE INDEX IF NOT EXISTS idx_sr_church
  ON public.service_reports(church_id);

CREATE INDEX IF NOT EXISTS idx_sr_reporter
  ON public.service_reports(reporter_id);

CREATE INDEX IF NOT EXISTS idx_sr_status
  ON public.service_reports(church_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sr_view_token
  ON public.service_reports(view_token);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. service_report_area_counts — voluntários por área (só as áreas que tiveram)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.service_report_area_counts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id       uuid        NOT NULL REFERENCES public.service_reports(id) ON DELETE CASCADE,
  church_id       uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  area_name       text        NOT NULL
                    CHECK (area_name IN ('kids', 'recepcao', 'portaria', 'louvor', 'intercessao')),
  volunteer_count integer     NOT NULL DEFAULT 0,
  kids_count      integer,    -- nullable: só para area_name='kids' (nº de crianças)
  UNIQUE (report_id, area_name)
);

ALTER TABLE public.service_report_area_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY srac_service
  ON public.service_report_area_counts FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY srac_tenant_select
  ON public.service_report_area_counts FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY srac_tenant_insert
  ON public.service_report_area_counts FOR INSERT
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY srac_tenant_update
  ON public.service_report_area_counts FOR UPDATE
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY srac_tenant_delete
  ON public.service_report_area_counts FOR DELETE
  USING (church_id = auth_church_id());

CREATE INDEX IF NOT EXISTS idx_srac_report
  ON public.service_report_area_counts(report_id);

CREATE INDEX IF NOT EXISTS idx_srac_church
  ON public.service_report_area_counts(church_id);
