-- ============================================================
-- Migration 00031: tabela leads (captação de contatos via landing)
-- Usada pelos planos Missão e Avivamento (venda consultiva)
-- ============================================================

CREATE TABLE IF NOT EXISTS leads (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR      NOT NULL,
  email             VARCHAR      NOT NULL,
  phone             VARCHAR,
  church_name       VARCHAR,
  estimated_members VARCHAR,
  plan_interest     VARCHAR      NOT NULL,
  status            VARCHAR      NOT NULL DEFAULT 'new',
  notes             TEXT,
  assigned_to       VARCHAR,
  utm_source        VARCHAR,
  utm_medium        VARCHAR,
  utm_campaign      VARCHAR,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Index para busca por status e plano no cockpit
CREATE INDEX IF NOT EXISTS leads_status_idx       ON leads(status);
CREATE INDEX IF NOT EXISTS leads_plan_interest_idx ON leads(plan_interest);
CREATE INDEX IF NOT EXISTS leads_created_at_idx    ON leads(created_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_leads_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_updated_at_trigger ON leads;
CREATE TRIGGER leads_updated_at_trigger
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_leads_updated_at();

-- RLS: apenas admins da Ekthos (via service_role na EF, ou JWT claim)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- A edge function lead-capture usa service_role (bypassa RLS).
-- O cockpit admin usa JWT com role 'super_admin' ou 'ekthos_admin'.
-- Policy de leitura/escrita para admins autenticados via cockpit:
CREATE POLICY "leads_admin_read" ON leads
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN user_roles r ON r.user_id = u.id
      WHERE u.id = auth.uid()
        AND r.role IN ('super_admin', 'admin')
        AND r.church_id IS NULL  -- admin Ekthos global (sem church_id)
    )
  );

CREATE POLICY "leads_admin_write" ON leads
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM auth.users u
      JOIN user_roles r ON r.user_id = u.id
      WHERE u.id = auth.uid()
        AND r.role IN ('super_admin', 'admin')
        AND r.church_id IS NULL
    )
  );
