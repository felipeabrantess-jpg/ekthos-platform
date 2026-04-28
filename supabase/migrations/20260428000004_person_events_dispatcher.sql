-- =============================================================
-- Migration: person_events_dispatcher
-- Data: 2026-04-28
-- Descrição: Infraestrutura para o sistema genérico de eventos de pessoa.
--   1. church_settings.welcome_automation_enabled — controle por church
--   2. people.is_bulk_import — suprime eventos em imports massivos
--   3. Atualiza people_source_check — novos valores de captação
--   4. CHECK anti-SSRF em n8n_webhooks — defesa em profundidade (SEC-008)
-- =============================================================

-- =============================================================
-- 1. church_settings: flag de automação de boas-vindas
-- =============================================================
ALTER TABLE church_settings
  ADD COLUMN IF NOT EXISTS welcome_automation_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN church_settings.welcome_automation_enabled IS
  'Quando false, dispatch-person-event não envia webhook de boas-vindas para esta igreja';

-- =============================================================
-- 2. people: flag de import em massa
-- =============================================================
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS is_bulk_import BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN people.is_bulk_import IS
  'true para imports XLSX/migration. Suprime eventos automáticos de boas-vindas.';

-- =============================================================
-- 3. people_source_check: adiciona valores de captação sem quebrar legado
--    'import' mantido por compatibilidade com dados existentes.
--    Novos: lead_form, visitor_form, agent_capture, import_xlsx, migration
-- =============================================================
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_source_check;
ALTER TABLE people ADD CONSTRAINT people_source_check CHECK (
  source = ANY (ARRAY[
    'whatsapp', 'instagram', 'manual', 'import', 'onboarding', 'qr_code',
    'lead_form', 'visitor_form', 'agent_capture', 'import_xlsx', 'migration'
  ])
);

COMMENT ON CONSTRAINT people_source_check ON people IS
  'Origens válidas de cadastro. '
  'Captação ativa (dispara boas-vindas): qr_code, lead_form, visitor_form, agent_capture. '
  'Passiva/interna (não dispara): manual, import, import_xlsx, migration, onboarding, whatsapp, instagram. '
  'import mantido por legado.';

-- =============================================================
-- 4. n8n_webhooks: CHECK anti-SSRF em pipeline_url e people_url
--    Bloqueia: localhost, 127.0.0.1, file://, 169.254.x.x (AWS metadata)
--    Resolve SEC-008 das pendências de segurança.
-- =============================================================
ALTER TABLE n8n_webhooks DROP CONSTRAINT IF EXISTS n8n_webhooks_url_safe;
ALTER TABLE n8n_webhooks ADD CONSTRAINT n8n_webhooks_url_safe CHECK (
  (pipeline_url IS NULL OR (
    pipeline_url LIKE 'https://%'
    AND pipeline_url NOT LIKE '%localhost%'
    AND pipeline_url NOT LIKE '%127.0.0.1%'
    AND pipeline_url NOT LIKE '%file://%'
    AND pipeline_url NOT LIKE '%169.254.%'
  )) AND
  (people_url IS NULL OR (
    people_url LIKE 'https://%'
    AND people_url NOT LIKE '%localhost%'
    AND people_url NOT LIKE '%127.0.0.1%'
    AND people_url NOT LIKE '%file://%'
    AND people_url NOT LIKE '%169.254.%'
  ))
);

COMMENT ON CONSTRAINT n8n_webhooks_url_safe ON n8n_webhooks IS
  'Anti-SSRF: rejeita localhost, 127.0.0.1, file://, 169.254.x.x (link-local/AWS metadata). SEC-008.';
