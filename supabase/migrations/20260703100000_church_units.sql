-- Migration: church_units — sedes/unidades por church (multi-sede)
-- Contexto IGV: Itaipu (Niterói) e Trindade (São Gonçalo)
-- Abordagem Opção C: tabela de primeira classe, escala pra white-label

CREATE TABLE IF NOT EXISTS church_units (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (church_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_church_units_church ON church_units (church_id);

ALTER TABLE church_units ENABLE ROW LEVEL SECURITY;

-- Membros autenticados lêem unidades da própria church
CREATE POLICY church_units_select ON church_units
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id());

-- Admin pode criar/editar unidades da própria church
CREATE POLICY church_units_insert ON church_units
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'
    AND church_id = auth_church_id()
  );

CREATE POLICY church_units_update ON church_units
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id())
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'
    AND church_id = auth_church_id()
  );

-- Service role (Edge Functions, crons)
CREATE POLICY church_units_service ON church_units
  FOR ALL USING (auth.role() = 'service_role');

-- Adiciona unit_id em people (nullable — sem quebra dos 5.729 existentes)
ALTER TABLE people ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES church_units(id);
CREATE INDEX IF NOT EXISTS idx_people_unit_id ON people (unit_id);

-- Adiciona unit_id em groups (células)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES church_units(id);
CREATE INDEX IF NOT EXISTS idx_groups_unit_id ON groups (unit_id);
