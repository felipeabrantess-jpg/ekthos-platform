-- ============================================================
-- Migration: 00003_mvp_schema.sql
-- Descrição: Schema MVP focado no fluxo WhatsApp ponta a ponta
-- Tenant: multi-tenant obrigatório via church_id em toda tabela
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FUNÇÃO AUXILIAR: atualiza updated_at automaticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELA: churches
-- Representa cada tenant (igreja) na plataforma
-- ============================================================
CREATE TABLE IF NOT EXISTS churches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ,
  CONSTRAINT churches_slug_unique UNIQUE (slug)
);

CREATE TRIGGER churches_updated_at
  BEFORE UPDATE ON churches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE churches IS 'Tenants da plataforma. Cada registro é uma igreja isolada.';
COMMENT ON COLUMN churches.slug IS 'Identificador textual único. Ex: igreja-graca';
COMMENT ON COLUMN churches.deleted_at IS 'Soft delete. NULL = ativo.';

-- ============================================================
-- TABELA: church_settings
-- Configurações por tenant: módulos, labels, horários, escalada
-- ============================================================
CREATE TABLE IF NOT EXISTS church_settings (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id             UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  modules_enabled       JSONB NOT NULL DEFAULT '{"whatsapp": false, "instagram": false, "crm": false, "donations": false, "agenda": false}',
  labels                JSONB NOT NULL DEFAULT '{"group": "célula", "member": "membro", "visitor": "visitante", "leader": "líder"}',
  support_hours         JSONB NOT NULL DEFAULT '{"timezone": "America/Sao_Paulo", "weekday": {"start": "08:00", "end": "22:00"}, "weekend": {"start": "07:00", "end": "23:00"}}',
  escalation_contacts   JSONB NOT NULL DEFAULT '[]',
  out_of_hours_message  TEXT NOT NULL DEFAULT 'Olá! Estamos fora do horário agora, mas já anotamos sua mensagem. Retornamos em breve. 🙏',
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  onboarding_completed_at TIMESTAMPTZ,
  max_msg_per_hour      INTEGER NOT NULL DEFAULT 100,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT church_settings_church_id_unique UNIQUE (church_id)
);

CREATE TRIGGER church_settings_updated_at
  BEFORE UPDATE ON church_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE church_settings IS 'Configurações por tenant. Um registro por church_id.';
COMMENT ON COLUMN church_settings.modules_enabled IS 'Módulos habilitados no plano do tenant.';
COMMENT ON COLUMN church_settings.labels IS 'Terminologia personalizada do tenant.';
COMMENT ON COLUMN church_settings.escalation_contacts IS 'Array de {name, whatsapp, role} para escalada.';

-- ============================================================
-- TABELA: integrations
-- Tokens e configurações de integrações externas por tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS integrations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  type             TEXT NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}',
  is_active        BOOLEAN NOT NULL DEFAULT true,
  last_verified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT integrations_church_type_unique UNIQUE (church_id, type),
  CONSTRAINT integrations_type_check CHECK (type IN ('whatsapp', 'instagram', 'stripe', 'pagseguro', 'mercadopago', 'n8n', 'google'))
);

CREATE TRIGGER integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE integrations IS 'Configurações de integrações externas por tenant. Tokens ficam no Vault — apenas vault_key aqui.';
COMMENT ON COLUMN integrations.config IS 'Ex: {"phone_number_id": "...", "vault_key": "wa_token_slug"}. NUNCA armazenar tokens aqui.';

-- ============================================================
-- TABELA: people
-- Membros e contatos de cada tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS people (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name            TEXT,
  phone           TEXT,
  email           TEXT,
  instagram_handle TEXT,
  tags            JSONB NOT NULL DEFAULT '[]',
  last_contact_at TIMESTAMPTZ,
  optout          BOOLEAN NOT NULL DEFAULT false,
  optout_at       TIMESTAMPTZ,
  source          TEXT NOT NULL DEFAULT 'manual',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  CONSTRAINT people_church_phone_unique UNIQUE (church_id, phone),
  CONSTRAINT people_source_check CHECK (source IN ('whatsapp', 'instagram', 'manual', 'import', 'onboarding'))
);

CREATE INDEX IF NOT EXISTS people_church_id_idx ON people(church_id);
CREATE INDEX IF NOT EXISTS people_church_phone_idx ON people(church_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_tags_idx ON people USING gin(tags);

CREATE TRIGGER people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE people IS 'Contatos e membros por tenant. Nunca misturar church_ids.';
COMMENT ON COLUMN people.phone IS 'Formato E.164. Ex: +5511999999999';
COMMENT ON COLUMN people.tags IS 'Array de strings. Ex: ["visitante", "interesse:grupo", "doador:confirmado"]';
COMMENT ON COLUMN people.optout IS 'true = não enviar mensagens automáticas.';

-- ============================================================
-- TABELA: interactions
-- Histórico de todas as interações por tenant e pessoa
-- ============================================================
CREATE TABLE IF NOT EXISTS interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id   UUID REFERENCES people(id) ON DELETE SET NULL,
  type        TEXT NOT NULL,
  direction   TEXT NOT NULL,
  content     JSONB NOT NULL DEFAULT '{}',
  external_id TEXT,
  agent       TEXT,
  model_used  TEXT NOT NULL DEFAULT 'none',
  tokens_used INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interactions_church_external_unique UNIQUE (church_id, external_id),
  CONSTRAINT interactions_type_check CHECK (type IN ('whatsapp', 'instagram', 'system', 'manual', 'n8n')),
  CONSTRAINT interactions_direction_check CHECK (direction IN ('inbound', 'outbound')),
  CONSTRAINT interactions_model_check CHECK (model_used IN ('haiku', 'sonnet', 'template', 'rule', 'human', 'none'))
);

CREATE INDEX IF NOT EXISTS interactions_church_id_idx ON interactions(church_id);
CREATE INDEX IF NOT EXISTS interactions_person_id_idx ON interactions(person_id);
CREATE INDEX IF NOT EXISTS interactions_church_created_idx ON interactions(church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS interactions_type_direction_idx ON interactions(church_id, type, direction);

COMMENT ON TABLE interactions IS 'Histórico de interações. Imutável — nunca deletar, apenas inserir.';
COMMENT ON COLUMN interactions.external_id IS 'ID da mensagem no sistema externo (WhatsApp message_id). Para deduplicação.';
COMMENT ON COLUMN interactions.content IS 'Estrutura: {text, intent, media_url, template_name, escalation_reason}';

-- ============================================================
-- TABELA: pipeline_stages
-- Etapas do funil de acompanhamento por tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  slug                TEXT NOT NULL,
  order_index         INTEGER NOT NULL,
  days_until_followup INTEGER NOT NULL DEFAULT 3,
  auto_followup       BOOLEAN NOT NULL DEFAULT true,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_stages_church_slug_unique UNIQUE (church_id, slug)
);

CREATE INDEX IF NOT EXISTS pipeline_stages_church_id_idx ON pipeline_stages(church_id, order_index);

COMMENT ON TABLE pipeline_stages IS 'Etapas configuráveis do funil por tenant. Stages padrão criados no onboarding.';

-- ============================================================
-- TABELA: person_pipeline
-- Posição atual de cada pessoa no funil do tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS person_pipeline (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id        UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  stage_id         UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  entered_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT person_pipeline_church_person_unique UNIQUE (church_id, person_id)
);

CREATE INDEX IF NOT EXISTS person_pipeline_church_stage_idx ON person_pipeline(church_id, stage_id);
CREATE INDEX IF NOT EXISTS person_pipeline_last_activity_idx ON person_pipeline(church_id, last_activity_at);

CREATE TRIGGER person_pipeline_updated_at
  BEFORE UPDATE ON person_pipeline
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE person_pipeline IS 'Uma linha por pessoa por tenant. Representa o stage atual.';

-- ============================================================
-- TABELA: onboarding_sessions
-- Sessões de onboarding de novos tenants
-- ============================================================
CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'in_progress',
  current_step     TEXT,
  collected_data   JSONB NOT NULL DEFAULT '{}',
  completed_steps  TEXT[] NOT NULL DEFAULT '{}',
  model_used       TEXT NOT NULL DEFAULT 'sonnet',
  tokens_used      INTEGER NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT onboarding_status_check CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);

CREATE TRIGGER onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE onboarding_sessions IS 'Rastreia o progresso do onboarding por tenant.';

-- ============================================================
-- TABELA: audit_logs
-- Log de auditoria imutável de todas as operações críticas
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID REFERENCES churches(id) ON DELETE SET NULL,
  entity_type  TEXT,
  entity_id    UUID,
  action       TEXT NOT NULL,
  actor_type   TEXT NOT NULL,
  actor_id     TEXT,
  payload      JSONB NOT NULL DEFAULT '{}',
  model_used   TEXT,
  tokens_used  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_actor_type_check CHECK (actor_type IN ('agent', 'human', 'system', 'webhook'))
);

CREATE INDEX IF NOT EXISTS audit_logs_church_id_idx ON audit_logs(church_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action, created_at DESC);

COMMENT ON TABLE audit_logs IS 'Imutável. Nunca deletar. Retenção mínima 5 anos (LGPD compliance).';
