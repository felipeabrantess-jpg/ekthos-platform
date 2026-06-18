-- Migration: care_responsibles
-- Responsáveis de cuidado pastoral (NÃO são usuários do sistema)
-- token: 256-bit aleatório para link privado sem login

CREATE TABLE IF NOT EXISTS public.care_responsibles (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  phone      text,
  type       text        NOT NULL DEFAULT 'voluntario'
               CHECK (type IN ('pastor','lider','voluntario')),
  region     text,
  token      text        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.care_responsibles ENABLE ROW LEVEL SECURITY;

-- service_role: bypass total (EF usa service_role)
CREATE POLICY care_resp_service
  ON public.care_responsibles FOR ALL
  USING (auth.role() = 'service_role');

-- CRM autenticado: isolado por church_id do JWT
CREATE POLICY care_resp_tenant_select
  ON public.care_responsibles FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY care_resp_tenant_insert
  ON public.care_responsibles FOR INSERT
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY care_resp_tenant_update
  ON public.care_responsibles FOR UPDATE
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE POLICY care_resp_tenant_delete
  ON public.care_responsibles FOR DELETE
  USING (church_id = auth_church_id());

-- Índices
CREATE INDEX IF NOT EXISTS idx_care_responsibles_church
  ON public.care_responsibles(church_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_care_responsibles_token
  ON public.care_responsibles(token);
