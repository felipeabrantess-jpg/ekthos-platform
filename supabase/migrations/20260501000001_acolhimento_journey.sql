-- =============================================================
-- SPRINT 2 — acolhimento_journey
-- Jornada 90 dias para visitantes novos
-- 01/05/2026
-- =============================================================

CREATE TABLE IF NOT EXISTS acolhimento_journey (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id           uuid        NOT NULL REFERENCES people(id)   ON DELETE CASCADE,
  started_at          timestamptz NOT NULL DEFAULT now(),
  current_touchpoint  text        NOT NULL DEFAULT 'D+0'
                        CHECK (current_touchpoint IN ('D+0','D+3','D+7','D+14','D+30','D+60','D+90')),
  next_touchpoint_at  timestamptz NOT NULL DEFAULT now(),
  touchpoints_sent    jsonb       NOT NULL DEFAULT '[]'::jsonb,
  responses_received  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pastoral_notes      text,
  status              text        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','processing','completed','cancelled')),
  completed_at        timestamptz,
  cancelled_reason    text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (church_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_aj_pending
  ON acolhimento_journey(next_touchpoint_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_aj_church_person
  ON acolhimento_journey(church_id, person_id);

ALTER TABLE acolhimento_journey ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'acolhimento_journey' AND policyname = 'aj_tenant_read') THEN
    CREATE POLICY "aj_tenant_read" ON acolhimento_journey
      FOR SELECT USING (church_id = auth_church_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'acolhimento_journey' AND policyname = 'aj_tenant_insert') THEN
    CREATE POLICY "aj_tenant_insert" ON acolhimento_journey
      FOR INSERT WITH CHECK (church_id = auth_church_id());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'acolhimento_journey' AND policyname = 'aj_tenant_update') THEN
    CREATE POLICY "aj_tenant_update" ON acolhimento_journey
      FOR UPDATE USING (church_id = auth_church_id());
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_name = 'trg_aj_updated_at'
      AND event_object_table = 'acolhimento_journey'
  ) THEN
    CREATE TRIGGER trg_aj_updated_at
      BEFORE UPDATE ON acolhimento_journey
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END;
$$;
