-- Migration: church_empresarios — Rede de Negócios IGV
-- Fatia 1: tabela + RLS + indexes
-- LGPD: authorized_public=false por padrão; admin decide quem aparece publicamente.

CREATE TABLE IF NOT EXISTS public.church_empresarios (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  nome             text        NOT NULL,
  categoria        text        NOT NULL,
  descricao        text,
  telefone         text,
  instagram        text,
  site             text,
  email            text,
  foto_url         text,
  active           boolean     NOT NULL DEFAULT true,
  authorized_public boolean    NOT NULL DEFAULT false,
  authorized_at    timestamptz,
  authorized_by    uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.church_empresarios ENABLE ROW LEVEL SECURITY;

-- Autenticados: CRUD apenas da própria igreja
CREATE POLICY "empresarios_auth_select" ON public.church_empresarios
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id());

CREATE POLICY "empresarios_auth_insert" ON public.church_empresarios
  FOR INSERT TO authenticated
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY "empresarios_auth_update" ON public.church_empresarios
  FOR UPDATE TO authenticated
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY "empresarios_auth_delete" ON public.church_empresarios
  FOR DELETE TO authenticated
  USING (church_id = auth_church_id());

-- Anônimos (PWA público): somente authorized_public=true AND active=true
CREATE POLICY "empresarios_anon_select_authorized" ON public.church_empresarios
  FOR SELECT TO anon
  USING (authorized_public = true AND active = true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_church_empresarios_church_id
  ON public.church_empresarios(church_id);

CREATE INDEX IF NOT EXISTS idx_church_empresarios_public
  ON public.church_empresarios(church_id, authorized_public, active);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.set_church_empresarios_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_church_empresarios_updated_at
  BEFORE UPDATE ON public.church_empresarios
  FOR EACH ROW EXECUTE FUNCTION public.set_church_empresarios_updated_at();
