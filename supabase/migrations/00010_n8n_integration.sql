-- ============================================================================
-- Migration 00010: Integração n8n — notifications, automation_logs, webhooks
-- ============================================================================

-- ── 1. Habilita pg_net para HTTP requests assíncronos ──────────────────────
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 2. Tabela: notifications (in-app) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT        NOT NULL,
  body            TEXT,
  type            TEXT        NOT NULL DEFAULT 'info'
    CONSTRAINT notifications_type_check
    CHECK (type IN ('alert', 'info', 'warning', 'success')),
  read            BOOLEAN     NOT NULL DEFAULT false,
  link            TEXT,
  automation_name TEXT,
  person_id       UUID        REFERENCES people(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_feed
  ON notifications (user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_church
  ON notifications (church_id, created_at DESC);

COMMENT ON TABLE notifications IS
  'Notificações in-app enviadas pelo n8n ou pelo sistema. Usuário vê apenas as suas.';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_own_select" ON notifications
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "notifications_own_update" ON notifications
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_service_all" ON notifications
  FOR ALL USING (auth.role() = 'service_role');

-- ── 3. Tabela: automation_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automation_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  automation_name TEXT        NOT NULL,
  trigger_type    TEXT        NOT NULL,
  person_id       UUID        REFERENCES people(id) ON DELETE SET NULL,
  action_taken    TEXT,
  result          TEXT        NOT NULL DEFAULT 'success'
    CONSTRAINT automation_logs_result_check
    CHECK (result IN ('success', 'failed')),
  payload         JSONB       NOT NULL DEFAULT '{}',
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_logs_church
  ON automation_logs (church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_automation_logs_person
  ON automation_logs (person_id, created_at DESC);

COMMENT ON TABLE automation_logs IS
  'Log imutável de execuções de automações do n8n. Apenas admin lê.';

ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "automation_logs_admin_select" ON automation_logs
  FOR SELECT USING (auth_user_role() = 'admin');

CREATE POLICY "automation_logs_service_all" ON automation_logs
  FOR ALL USING (auth.role() = 'service_role');

-- ── 4. Tabela: n8n_webhooks ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS n8n_webhooks (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  pipeline_url     TEXT,
  people_url       TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT false,
  secret_token     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id)
);

COMMENT ON TABLE n8n_webhooks IS
  'URLs dos webhooks do n8n por tenant. is_active controla se os triggers disparam.';

ALTER TABLE n8n_webhooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "n8n_webhooks_admin_all" ON n8n_webhooks
  FOR ALL USING (auth_user_role() = 'admin');

CREATE POLICY "n8n_webhooks_service_all" ON n8n_webhooks
  FOR ALL USING (auth.role() = 'service_role');

-- ── 5. Funções trigger → n8n ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION trigger_n8n_pipeline()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
BEGIN
  SELECT pipeline_url INTO v_url
  FROM n8n_webhooks
  WHERE church_id = NEW.church_id AND is_active = true;

  IF v_url IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := convert_to(
      jsonb_build_object(
        'event',       'pipeline_' || lower(TG_OP),
        'church_id',   NEW.church_id,
        'person_id',   NEW.person_id,
        'stage_id',    NEW.stage_id,
        'entered_at',  NEW.entered_at,
        'loss_reason', NEW.loss_reason,
        'ts',          now()
      )::text, 'UTF8'),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION trigger_n8n_people()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_url TEXT;
BEGIN
  SELECT people_url INTO v_url
  FROM n8n_webhooks
  WHERE church_id = NEW.church_id AND is_active = true;

  IF v_url IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := convert_to(
      jsonb_build_object(
        'event',     'people_' || lower(TG_OP),
        'church_id', NEW.church_id,
        'person_id', NEW.id,
        'name',      NEW.name,
        'phone',     NEW.phone,
        'email',     NEW.email,
        'celula_id', NEW.celula_id,
        'ts',        now()
      )::text, 'UTF8'),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

-- ── 6. Triggers ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_n8n_pipeline_insert ON person_pipeline;
CREATE TRIGGER trg_n8n_pipeline_insert
  AFTER INSERT ON person_pipeline
  FOR EACH ROW EXECUTE FUNCTION trigger_n8n_pipeline();

DROP TRIGGER IF EXISTS trg_n8n_pipeline_update ON person_pipeline;
CREATE TRIGGER trg_n8n_pipeline_update
  AFTER UPDATE ON person_pipeline
  FOR EACH ROW EXECUTE FUNCTION trigger_n8n_pipeline();

DROP TRIGGER IF EXISTS trg_n8n_people_insert ON people;
CREATE TRIGGER trg_n8n_people_insert
  AFTER INSERT ON people
  FOR EACH ROW EXECUTE FUNCTION trigger_n8n_people();

DROP TRIGGER IF EXISTS trg_n8n_people_update ON people;
CREATE TRIGGER trg_n8n_people_update
  AFTER UPDATE ON people
  FOR EACH ROW
  WHEN (NEW.deleted_at IS NULL)
  EXECUTE FUNCTION trigger_n8n_people();
