-- Central de Cuidado Fase 1: registros de acompanhamento pastoral por pessoa
CREATE TABLE IF NOT EXISTS care_contacts (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         uuid        NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  church_id         uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  contacted         boolean     NOT NULL DEFAULT false,
  notes             text,
  contacted_by      uuid        REFERENCES auth.users(id),
  contacted_by_name text        NOT NULL DEFAULT '',
  contacted_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, church_id)
);

ALTER TABLE care_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY cc_select ON care_contacts
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY cc_insert ON care_contacts
  FOR INSERT WITH CHECK (church_id = auth_church_id());

CREATE POLICY cc_update ON care_contacts
  FOR UPDATE USING (church_id = auth_church_id());

CREATE POLICY cc_delete ON care_contacts
  FOR DELETE USING (church_id = auth_church_id());
