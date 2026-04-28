-- =========================================
-- FRENTE M FASE 1 — Camada de transporte de mensagens
-- Data: 2026-04-28
-- =========================================
-- messaging_config: configuração de canal por igreja
-- message_outbox: fila + histórico + auditoria de mensagens
-- Seed: mock_internal default para todas igrejas existentes
-- RLS multi-tenant aplicada (preparada para futuro)
-- Painel admin nesta fase é restrito a is_ekthos_admin no nível de UI
-- =========================================

-- 1. messaging_config
CREATE TABLE IF NOT EXISTS messaging_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  channel         TEXT NOT NULL,
  driver          TEXT NOT NULL,
  driver_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_default      BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messaging_config_channel_valid CHECK (channel IN (
    'whatsapp', 'sms', 'email', 'in_app'
  )),
  CONSTRAINT messaging_config_driver_valid CHECK (driver IN (
    'mock_internal', 'wa_me_link', 'zapi', 'meta_cloud_api', 'twilio_sms', 'resend_email'
  )),
  CONSTRAINT messaging_config_unique_channel UNIQUE (church_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_messaging_config_church_active
  ON messaging_config(church_id, channel, is_active);

CREATE OR REPLACE TRIGGER trg_messaging_config_updated_at
  BEFORE UPDATE ON messaging_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE messaging_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY messaging_config_tenant_select ON messaging_config
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY messaging_config_admin_all ON messaging_config
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY messaging_config_ekthos_admin ON messaging_config
  FOR ALL USING (is_ekthos_admin() = true);

-- =========================================

-- 2. message_outbox
CREATE TABLE IF NOT EXISTS message_outbox (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id         UUID NULL REFERENCES people(id) ON DELETE SET NULL,

  channel           TEXT NOT NULL,
  driver            TEXT NOT NULL,
  to_address        TEXT NOT NULL,

  body_text         TEXT NOT NULL,
  body_template_id  TEXT NULL,
  variables         JSONB NOT NULL DEFAULT '{}'::jsonb,

  source            TEXT NOT NULL,
  source_event      TEXT NULL,
  source_ref_id     UUID NULL,

  status            TEXT NOT NULL DEFAULT 'queued',
  attempts          INT NOT NULL DEFAULT 0,
  max_attempts      INT NOT NULL DEFAULT 3,
  next_attempt_at   TIMESTAMPTZ NULL,
  last_attempt_at   TIMESTAMPTZ NULL,

  driver_response   JSONB NOT NULL DEFAULT '{}'::jsonb,
  driver_message_id TEXT NULL,
  sent_at           TIMESTAMPTZ NULL,
  delivered_at      TIMESTAMPTZ NULL,
  read_at           TIMESTAMPTZ NULL,
  failed_at         TIMESTAMPTZ NULL,
  error_message     TEXT NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT message_outbox_status_valid CHECK (status IN (
    'queued', 'dispatching', 'sent', 'delivered', 'read',
    'failed', 'skipped', 'pending_user_action'
  )),
  CONSTRAINT message_outbox_channel_valid CHECK (channel IN (
    'whatsapp', 'sms', 'email', 'in_app'
  )),
  CONSTRAINT message_outbox_driver_valid CHECK (driver IN (
    'mock_internal', 'wa_me_link', 'zapi', 'meta_cloud_api', 'twilio_sms', 'resend_email'
  ))
);

CREATE INDEX IF NOT EXISTS idx_outbox_church_created
  ON message_outbox(church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_outbox_person
  ON message_outbox(person_id) WHERE person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_status_pending
  ON message_outbox(status, next_attempt_at)
  WHERE status IN ('queued', 'dispatching');

CREATE OR REPLACE TRIGGER trg_message_outbox_updated_at
  BEFORE UPDATE ON message_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE message_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_outbox_tenant_select ON message_outbox
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY message_outbox_admin_all ON message_outbox
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY message_outbox_ekthos_admin ON message_outbox
  FOR ALL USING (is_ekthos_admin() = true);

-- =========================================

-- 3. SEED — mock_internal default para todas igrejas existentes
INSERT INTO messaging_config (church_id, channel, driver, is_default, is_active)
SELECT id, 'whatsapp', 'mock_internal', true, true
FROM churches
ON CONFLICT (church_id, channel) DO NOTHING;

-- =========================================

-- Comentários
COMMENT ON TABLE messaging_config IS
  'Configuracao de canal de mensageria por igreja. Driver determina como mensagens sao enviadas.';
COMMENT ON COLUMN messaging_config.driver IS
  'mock_internal=teste/auditoria, wa_me_link=botao wa.me, zapi=Z-API, meta_cloud_api=Meta Business, twilio_sms=Twilio, resend_email=Resend';

COMMENT ON TABLE message_outbox IS
  'Fila + historico + auditoria de mensagens. Toda mensagem do sistema passa aqui.';
COMMENT ON COLUMN message_outbox.status IS
  'queued->dispatching->sent->delivered->read | skipped (vetada) | failed | pending_user_action (driver wa_me_link)';
