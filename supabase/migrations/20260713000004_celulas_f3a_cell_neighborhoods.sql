-- F3-A: Tabela de bairros/regiões de células
-- Hierarquia: church_units (Unidade) → cell_neighborhoods (Bairro) → groups (Célula)
--
-- Isola 100% o Financeiro: não toca em donations, expenses, receivables nem em
-- church_units. Esta é uma tabela NOVA, puramente aditiva.
-- church_units.id é referenciada só como FK (ON DELETE RESTRICT — não permite
-- deletar uma unidade enquanto houver bairros vinculados a ela).

CREATE TABLE IF NOT EXISTS cell_neighborhoods (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  unit_id    UUID        NOT NULL REFERENCES church_units(id) ON DELETE RESTRICT,
  name       TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (church_id, name)
);

CREATE INDEX IF NOT EXISTS idx_cell_neighborhoods_church ON cell_neighborhoods (church_id);
CREATE INDEX IF NOT EXISTS idx_cell_neighborhoods_unit   ON cell_neighborhoods (unit_id);

ALTER TABLE cell_neighborhoods ENABLE ROW LEVEL SECURITY;

-- Membros autenticados lêem bairros da própria church
CREATE POLICY cell_neighborhoods_select ON cell_neighborhoods
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id());

-- Admin pode criar bairros da própria church
CREATE POLICY cell_neighborhoods_insert ON cell_neighborhoods
  FOR INSERT TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'
    AND church_id = auth_church_id()
  );

-- Admin pode editar bairros da própria church
CREATE POLICY cell_neighborhoods_update ON cell_neighborhoods
  FOR UPDATE TO authenticated
  USING (church_id = auth_church_id())
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role')::text = 'admin'
    AND church_id = auth_church_id()
  );

-- Service role tem acesso total (Edge Functions, crons)
CREATE POLICY cell_neighborhoods_service ON cell_neighborhoods
  FOR ALL USING (auth.role() = 'service_role');
