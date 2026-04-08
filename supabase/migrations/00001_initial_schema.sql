-- ============================================================
-- Migration: 00001_initial_schema.sql
-- Descrição: Schema inicial completo do Ekthos Platform
--            Inclui todas as tabelas principais com multi-tenancy,
--            índices de performance e triggers de updated_at.
-- Criado em: 2026-04-07
-- Reversível: Ver seção ROLLBACK ao final
-- ============================================================

-- ============================================================
-- EXTENSÕES NECESSÁRIAS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FUNÇÃO AUXILIAR: Atualizar updated_at automaticamente
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELA: churches
-- Tenants da plataforma. Cada registro representa uma igreja.
-- Esta é a tabela raiz — todas as outras dependem dela.
-- ============================================================

CREATE TABLE churches (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  slug              VARCHAR(100) NOT NULL UNIQUE,
  legal_name        VARCHAR(255),              -- Nome jurídico (CNPJ)
  cnpj              VARCHAR(18),               -- CNPJ formatado: XX.XXX.XXX/0001-XX
  city              VARCHAR(100) NOT NULL,
  state             CHAR(2) NOT NULL,          -- UF: SP, RJ, MG...
  timezone          VARCHAR(50) NOT NULL DEFAULT 'America/Sao_Paulo',
  pastor_name       VARCHAR(255),
  website_url       VARCHAR(500),
  instagram_handle  VARCHAR(100),
  plan              VARCHAR(50) NOT NULL DEFAULT 'starter', -- starter, growth, enterprise
  is_active         BOOLEAN NOT NULL DEFAULT true,
  disabled_at       TIMESTAMPTZ,
  disabled_reason   TEXT,
  trial_ends_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE churches IS 'Tenants da plataforma Ekthos. Cada linha = uma igreja cliente.';
COMMENT ON COLUMN churches.slug IS 'Identificador único em lowercase sem espaços. Ex: igreja-da-graca';
COMMENT ON COLUMN churches.plan IS 'Plano de assinatura: starter | growth | enterprise';

-- Índices
CREATE INDEX idx_churches_slug ON churches(slug);
CREATE INDEX idx_churches_is_active ON churches(is_active);

-- Trigger de updated_at
CREATE TRIGGER set_churches_updated_at
  BEFORE UPDATE ON churches
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: church_settings
-- Configurações personalizadas de cada tenant.
-- Uma linha por church_id.
-- ============================================================

CREATE TABLE church_settings (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id               UUID NOT NULL UNIQUE REFERENCES churches(id) ON DELETE CASCADE,
  tone                    VARCHAR(50) NOT NULL DEFAULT 'informal',
  -- Terminologia própria da igreja (JSON)
  terminology             JSONB NOT NULL DEFAULT '{
    "groups": "grupos",
    "members": "membros",
    "leader": "pastor",
    "meeting": "culto",
    "youth": "jovens"
  }',
  -- Módulos habilitados para o tenant
  enabled_modules         TEXT[] NOT NULL DEFAULT '{}',
  -- Horário de atendimento (JSON por dia da semana)
  business_hours          JSONB NOT NULL DEFAULT '{
    "weekdays": {"start": "09:00", "end": "18:00"},
    "saturday": {"start": "09:00", "end": "13:00"},
    "sunday": null
  }',
  -- Configurações de comunicação
  escalation_contact      VARCHAR(20),           -- Número WhatsApp para escaladas
  escalation_email        VARCHAR(255),
  use_emojis              BOOLEAN NOT NULL DEFAULT true,
  away_message            TEXT,                  -- Mensagem fora do horário
  welcome_message         TEXT,                  -- Mensagem de primeiro contato
  -- Configurações financeiras
  auto_approval_limit     DECIMAL(10,2) DEFAULT 0.00, -- Valor máximo sem aprovação humana
  default_currency        CHAR(3) NOT NULL DEFAULT 'BRL',
  -- Feature flags extras
  settings_json           JSONB DEFAULT '{}',
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE church_settings IS 'Configurações específicas de cada tenant. Inclui terminologia, tom, horários e módulos.';
COMMENT ON COLUMN church_settings.terminology IS 'JSON com termos próprios da igreja: groups, members, leader, meeting, youth.';
COMMENT ON COLUMN church_settings.enabled_modules IS 'Array de módulos ativos: whatsapp, instagram, marketing, donations, pipeline.';

-- Trigger de updated_at
CREATE TRIGGER set_church_settings_updated_at
  BEFORE UPDATE ON church_settings
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: profiles
-- Usuários da plataforma (admins, gerentes, staff das igrejas).
-- Extende auth.users do Supabase com dados de tenant.
-- ============================================================

CREATE TABLE profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  church_id     UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  display_name  VARCHAR(255),
  email         VARCHAR(255) NOT NULL,
  phone         VARCHAR(20),
  avatar_url    TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE profiles IS 'Usuários administrativos da plataforma. Vinculados ao Supabase Auth via user_id.';

-- Índices
CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_church_id ON profiles(church_id);
CREATE INDEX idx_profiles_email ON profiles(email);

-- Trigger de updated_at
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: user_roles
-- Papéis dos usuários dentro de cada tenant.
-- Um usuário pode ter diferentes papéis em diferentes tenants (futuro).
-- ============================================================

CREATE TABLE user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  role        VARCHAR(50) NOT NULL,
  -- Papéis válidos: church_admin, church_manager, church_staff, readonly
  granted_by  UUID REFERENCES auth.users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, church_id, role)
);

COMMENT ON TABLE user_roles IS 'Papéis RBAC dos usuários. Papéis válidos: church_admin, church_manager, church_staff, readonly.';

-- Índices
CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_church_id ON user_roles(church_id);

-- ============================================================
-- TABELA: people
-- Membros, visitantes e leads de cada igreja.
-- Tabela central do CRM ministerial.
-- ============================================================

CREATE TABLE people (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  -- Dados básicos
  name                VARCHAR(255) NOT NULL,
  email               VARCHAR(255),
  phone               VARCHAR(20),              -- Formato internacional: +5511999990000
  phone_secondary     VARCHAR(20),
  cpf                 VARCHAR(14),              -- Armazenado criptografado
  birth_date          DATE,
  gender              VARCHAR(20),              -- male, female, other, not_informed
  -- Status e jornada
  status              VARCHAR(50) NOT NULL DEFAULT 'lead',
  -- Status válidos: lead, visitor, attendee, member_candidate, member, inactive, former_member
  member_since        DATE,
  -- Dados de endereço
  city                VARCHAR(100),
  state               CHAR(2),
  neighborhood        VARCHAR(100),
  -- Relacionamentos internos
  spouse_id           UUID REFERENCES people(id),
  family_group_id     UUID,                     -- FK para grupos (futuro)
  -- Metadados de origem
  source              VARCHAR(100),             -- whatsapp, instagram, form, manual, referral
  referred_by_id      UUID REFERENCES people(id),
  -- Preferências e tags
  tags                TEXT[] DEFAULT '{}',
  marketing_opt_out   BOOLEAN NOT NULL DEFAULT false,
  notes               TEXT,
  -- Dados de auditoria
  assigned_to         UUID REFERENCES profiles(id), -- Líder responsável
  last_contact_at     TIMESTAMPTZ,
  anonymized_at       TIMESTAMPTZ,              -- Se LGPD solicitou anonimização
  deleted_at          TIMESTAMPTZ,              -- Soft delete
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE people IS 'CRM ministerial. Todos os contatos da igreja: leads, visitantes, membros.';
COMMENT ON COLUMN people.status IS 'Jornada: lead → visitor → attendee → member_candidate → member';
COMMENT ON COLUMN people.tags IS 'Tags livres para segmentação. Ex: {diezmista, gc_ativo, jovem}';
COMMENT ON COLUMN people.cpf IS 'CPF deve ser armazenado criptografado via pgcrypto.';

-- Índices
CREATE INDEX idx_people_church_id ON people(church_id);
CREATE INDEX idx_people_email ON people(email);
CREATE INDEX idx_people_phone ON people(phone);
CREATE INDEX idx_people_status ON people(church_id, status);
CREATE INDEX idx_people_tags ON people USING GIN(tags);
CREATE INDEX idx_people_deleted_at ON people(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_people_last_contact ON people(church_id, last_contact_at);

-- Trigger de updated_at
CREATE TRIGGER set_people_updated_at
  BEFORE UPDATE ON people
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: interactions
-- Registro de todas as interações dos agentes com pessoas.
-- Histórico completo de conversas e atendimentos.
-- ============================================================

CREATE TABLE interactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id           UUID REFERENCES people(id) ON DELETE SET NULL,
  -- Canal e identificação externa
  channel             VARCHAR(50) NOT NULL,     -- whatsapp, instagram, email, internal
  external_id         VARCHAR(255),             -- ID da conversa no canal externo
  conversation_id     UUID,                     -- Agrupa mensagens da mesma conversa
  -- Conteúdo
  inbound_message     TEXT,                     -- Mensagem recebida do usuário
  outbound_message    TEXT,                     -- Resposta enviada pelo sistema
  media_url           TEXT,                     -- URL de mídia recebida
  -- Classificação de IA
  intent              VARCHAR(100),             -- Intent classificado
  confidence_score    DECIMAL(3,2),             -- Confiança 0.00 a 1.00
  -- Status do atendimento
  type                VARCHAR(50) DEFAULT 'message', -- message, escalation, error, system
  was_escalated       BOOLEAN NOT NULL DEFAULT false,
  escalation_reason   TEXT,
  was_resolved        BOOLEAN,
  -- Performance
  processing_time_ms  INTEGER,
  -- Referências externas
  agent_name          VARCHAR(100),             -- Nome do agente que processou
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE interactions IS 'Log completo de todas as interações processadas pelos agentes. Não deletar — histórico permanente.';
COMMENT ON COLUMN interactions.conversation_id IS 'UUID que agrupa múltiplas mensagens da mesma sessão de conversa.';

-- Índices
CREATE INDEX idx_interactions_church_id ON interactions(church_id);
CREATE INDEX idx_interactions_person_id ON interactions(person_id);
CREATE INDEX idx_interactions_channel ON interactions(church_id, channel);
CREATE INDEX idx_interactions_created_at ON interactions(church_id, created_at DESC);
CREATE INDEX idx_interactions_conversation_id ON interactions(conversation_id);
CREATE INDEX idx_interactions_was_escalated ON interactions(church_id, was_escalated) WHERE was_escalated = true;

-- ============================================================
-- TABELA: pipeline_stages
-- Estágios do pipeline de acompanhamento de pessoas.
-- Configurável por tenant.
-- ============================================================

CREATE TABLE pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  color       VARCHAR(7),                       -- Hex color: #FF5733
  position    INTEGER NOT NULL DEFAULT 0,       -- Ordem de exibição
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(church_id, position)
);

COMMENT ON TABLE pipeline_stages IS 'Estágios configuráveis do funil de acompanhamento pastoral.';

-- Trigger de updated_at
CREATE TRIGGER set_pipeline_stages_updated_at
  BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Índices
CREATE INDEX idx_pipeline_stages_church_id ON pipeline_stages(church_id, position);

-- ============================================================
-- TABELA: person_pipeline
-- Relacionamento entre pessoas e estágios do pipeline.
-- Histórico de movimento pelo funil.
-- ============================================================

CREATE TABLE person_pipeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  stage_id    UUID NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exited_at   TIMESTAMPTZ,
  notes       TEXT,
  moved_by    UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE person_pipeline IS 'Histórico de movimento de pessoas pelo pipeline pastoral.';

-- Índices
CREATE INDEX idx_person_pipeline_church_id ON person_pipeline(church_id);
CREATE INDEX idx_person_pipeline_person_id ON person_pipeline(person_id);
CREATE INDEX idx_person_pipeline_stage_id ON person_pipeline(stage_id);
CREATE INDEX idx_person_pipeline_active ON person_pipeline(person_id, stage_id) WHERE exited_at IS NULL;

-- ============================================================
-- TABELA: donations
-- Registro de todas as doações e contribuições financeiras.
-- ============================================================

CREATE TABLE donations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id             UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  donor_id              UUID REFERENCES people(id) ON DELETE SET NULL,
  -- Dados financeiros
  amount                DECIMAL(12,2) NOT NULL CHECK (amount > 0),
  currency              CHAR(3) NOT NULL DEFAULT 'BRL',
  category              VARCHAR(50) NOT NULL DEFAULT 'offering',
  -- Categorias válidas: tithe, offering, missions, building_fund, campaign, social_action, other
  campaign_id           UUID,                   -- FK para campaigns (quando category = campaign)
  notes                 TEXT,
  -- Gateway de pagamento
  gateway               VARCHAR(50),            -- stripe, pagseguro, mercadopago, asaas, cash
  gateway_transaction_id VARCHAR(255) UNIQUE,   -- ID único na plataforma do gateway
  gateway_status        VARCHAR(100),           -- Status retornado pelo gateway
  payment_method        VARCHAR(50),            -- pix, credit_card, debit_card, cash, transfer
  -- Status interno
  status                VARCHAR(50) NOT NULL DEFAULT 'pending',
  -- Status válidos: pending, confirmed, failed, refunded, cancelled
  confirmed_at          TIMESTAMPTZ,
  refunded_at           TIMESTAMPTZ,
  refund_reason         TEXT,
  -- Comprovante
  receipt_url           TEXT,                   -- URL do PDF no Supabase Storage
  receipt_generated_at  TIMESTAMPTZ,
  -- Auditoria
  processed_by          VARCHAR(100),           -- 'system' ou user_id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE donations IS 'Todas as contribuições financeiras por tenant. Nunca deletar — histórico permanente.';
COMMENT ON COLUMN donations.gateway_transaction_id IS 'ID único do gateway. Usado para garantir idempotência no processamento de webhooks.';
COMMENT ON COLUMN donations.category IS 'Tipo de contribuição: tithe, offering, missions, building_fund, campaign, social_action, other';

-- Índices
CREATE INDEX idx_donations_church_id ON donations(church_id);
CREATE INDEX idx_donations_donor_id ON donations(donor_id);
CREATE INDEX idx_donations_status ON donations(church_id, status);
CREATE INDEX idx_donations_created_at ON donations(church_id, created_at DESC);
CREATE INDEX idx_donations_category ON donations(church_id, category);
CREATE INDEX idx_donations_gateway_tx ON donations(gateway_transaction_id);

-- Trigger de updated_at
CREATE TRIGGER set_donations_updated_at
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: integrations
-- Configurações de integrações externas por tenant.
-- Tokens e segredos referenciados por nome no Supabase Vault.
-- ============================================================

CREATE TABLE integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  type            VARCHAR(50) NOT NULL,
  -- Tipos válidos: whatsapp, instagram, stripe, pagseguro, mercadopago, asaas, n8n, email
  name            VARCHAR(100),                 -- Nome amigável (ex: "WhatsApp Principal")
  -- Webhook
  webhook_token   UUID NOT NULL DEFAULT gen_random_uuid(), -- Token único para identificar tenant em webhooks
  -- Configurações não sensíveis (IDs públicos, URLs)
  config          JSONB NOT NULL DEFAULT '{}',
  -- Referências ao Vault (não os secrets em si)
  vault_keys      TEXT[] DEFAULT '{}',          -- Nomes dos secrets no Supabase Vault
  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT false,
  last_ping_at    TIMESTAMPTZ,
  status_message  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(church_id, type, name)
);

COMMENT ON TABLE integrations IS 'Integrações externas por tenant. Secrets ficam no Supabase Vault — não aqui.';
COMMENT ON COLUMN integrations.webhook_token IS 'UUID único para identificar o tenant em webhooks recebidos. Rotacionar periodicamente.';
COMMENT ON COLUMN integrations.vault_keys IS 'Nomes dos secrets no Vault. Ex: ["whatsapp_token_igreja-graca", "whatsapp_secret_igreja-graca"]';

-- Índices
CREATE INDEX idx_integrations_church_id ON integrations(church_id);
CREATE INDEX idx_integrations_webhook_token ON integrations(webhook_token);
CREATE INDEX idx_integrations_type ON integrations(church_id, type);

-- Trigger de updated_at
CREATE TRIGGER set_integrations_updated_at
  BEFORE UPDATE ON integrations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: campaigns
-- Campanhas de marketing criadas por cada tenant.
-- ============================================================

CREATE TABLE campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  type            VARCHAR(50) NOT NULL,
  -- Tipos: announcement, seasonal, evangelism, fundraising, follow_up, welcome_series, birthday_wish, event_reminder, devotional
  description     TEXT,
  channels        TEXT[] DEFAULT '{}',          -- whatsapp, instagram, email
  status          VARCHAR(50) NOT NULL DEFAULT 'draft',
  -- Status: draft, scheduled, active, paused, completed, cancelled
  -- Segmentação
  audience_filters JSONB DEFAULT '{}',          -- Filtros de segmentação usados
  audience_size   INTEGER,                      -- Tamanho do público no momento do disparo
  -- Conteúdo
  content         JSONB DEFAULT '{}',           -- Copy por canal: {whatsapp: "...", instagram: "..."}
  -- Agendamento
  scheduled_for   TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  -- Métricas
  sent_count      INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  response_count  INTEGER DEFAULT 0,
  -- Referências
  n8n_workflow_id VARCHAR(255),                 -- ID do workflow no n8n
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE campaigns IS 'Campanhas de marketing por tenant. Vinculadas a workflows n8n para execução.';

-- Índices
CREATE INDEX idx_campaigns_church_id ON campaigns(church_id);
CREATE INDEX idx_campaigns_status ON campaigns(church_id, status);
CREATE INDEX idx_campaigns_scheduled_for ON campaigns(church_id, scheduled_for);

-- Trigger de updated_at
CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: audit_logs
-- Log de auditoria de todas as ações significativas.
-- NUNCA deletar registros desta tabela.
-- ============================================================

CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id),
  action      VARCHAR(150) NOT NULL,
  -- Formato sugerido: 'entity.action' — ex: 'member.created', 'donation.refunded'
  table_name  VARCHAR(100),
  record_id   UUID,
  old_values  JSONB,                            -- Estado anterior (para auditar mudanças)
  new_values  JSONB,                            -- Estado novo
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB DEFAULT '{}',               -- Dados adicionais contextuais
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE audit_logs IS 'Log de auditoria imutável. Nunca deletar, nunca atualizar. Apenas INSERT.';
COMMENT ON COLUMN audit_logs.action IS 'Formato: entity.action. Ex: member.created, donation.refunded, settings.updated';

-- Índices
CREATE INDEX idx_audit_logs_church_id ON audit_logs(church_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(church_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_record_id ON audit_logs(record_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);

-- ============================================================
-- TABELA: platform_admins
-- Super admins da plataforma Ekthos (não de igrejas específicas).
-- ============================================================

CREATE TABLE platform_admins (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_admins IS 'Equipe interna do Ekthos com acesso global à plataforma.';

-- ============================================================
-- FUNÇÕES AUXILIARES DE MULTI-TENANCY
-- ============================================================

-- Função: obtém church_id do usuário autenticado
CREATE OR REPLACE FUNCTION get_current_church_id()
RETURNS UUID AS $$
  SELECT church_id
  FROM profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION get_current_church_id() IS 'Retorna o church_id do usuário autenticado via JWT. Usado em políticas RLS.';

-- Função: verifica se é super admin da plataforma
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_platform_admin() IS 'Retorna true se o usuário é admin da plataforma Ekthos (acesso total).';

-- Função: verifica papel do usuário no tenant atual
CREATE OR REPLACE FUNCTION has_church_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = required_role
      AND church_id = get_current_church_id()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

COMMENT ON FUNCTION has_church_role(TEXT) IS 'Verifica se o usuário tem o papel especificado no seu tenant. Roles: church_admin, church_manager, church_staff, readonly.';

-- ============================================================
-- DADOS INICIAIS: Pipeline padrão de estágios
-- (Inseridos via função que respeita isolamento — não hardcoded)
-- ============================================================

-- Função para criar pipeline padrão ao criar uma nova igreja
CREATE OR REPLACE FUNCTION create_default_pipeline(p_church_id UUID)
RETURNS void AS $$
  INSERT INTO pipeline_stages (church_id, name, description, color, position) VALUES
    (p_church_id, 'Novo Contato', 'Primeiro contato com a igreja', '#6B7280', 1),
    (p_church_id, 'Visitante', 'Visitou pelo menos uma vez', '#3B82F6', 2),
    (p_church_id, 'Frequentador', 'Retornou mais de uma vez', '#8B5CF6', 3),
    (p_church_id, 'Curso de Membresia', 'Em processo de membresia', '#F59E0B', 4),
    (p_church_id, 'Membro Ativo', 'Membro formal e engajado', '#10B981', 5),
    (p_church_id, 'Membro Afastado', 'Membro sem presença recente', '#EF4444', 6);
$$ LANGUAGE SQL SECURITY DEFINER;

COMMENT ON FUNCTION create_default_pipeline(UUID) IS 'Cria os estágios de pipeline padrão para um novo tenant. Chamada durante o onboarding.';

-- ============================================================
-- ROLLBACK (para reverter esta migration — use apenas em desenvolvimento)
-- ============================================================
-- DROP FUNCTION IF EXISTS create_default_pipeline(UUID);
-- DROP FUNCTION IF EXISTS has_church_role(TEXT);
-- DROP FUNCTION IF EXISTS is_platform_admin();
-- DROP FUNCTION IF EXISTS get_current_church_id();
-- DROP FUNCTION IF EXISTS trigger_set_updated_at();
-- DROP TABLE IF EXISTS audit_logs CASCADE;
-- DROP TABLE IF EXISTS campaigns CASCADE;
-- DROP TABLE IF EXISTS integrations CASCADE;
-- DROP TABLE IF EXISTS donations CASCADE;
-- DROP TABLE IF EXISTS person_pipeline CASCADE;
-- DROP TABLE IF EXISTS pipeline_stages CASCADE;
-- DROP TABLE IF EXISTS interactions CASCADE;
-- DROP TABLE IF EXISTS people CASCADE;
-- DROP TABLE IF EXISTS user_roles CASCADE;
-- DROP TABLE IF EXISTS profiles CASCADE;
-- DROP TABLE IF EXISTS church_settings CASCADE;
-- DROP TABLE IF EXISTS platform_admins CASCADE;
-- DROP TABLE IF EXISTS churches CASCADE;
