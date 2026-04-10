-- ============================================================
-- Migration: 00012_onboarding.sql
-- Descrição: Sistema de onboarding self-service.
--            Estende churches com status e branding.
--            Cria onboarding_sessions (conversa com Agente 10)
--            e onboarding_steps (execução do Agente 11).
-- Criado em: 2026-04-10
-- ============================================================

-- ============================================================
-- EXTENSÃO: churches — colunas de onboarding e branding
-- ============================================================

ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS status        TEXT        NOT NULL DEFAULT 'onboarding'
    CHECK (status IN ('onboarding', 'configured', 'suspended')),
  ADD COLUMN IF NOT EXISTS city          TEXT,
  ADD COLUMN IF NOT EXISTS state         TEXT,
  ADD COLUMN IF NOT EXISTS timezone      TEXT        NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS logo_url      TEXT,
  ADD COLUMN IF NOT EXISTS branding      JSONB,
  ADD COLUMN IF NOT EXISTS onboarding_config JSONB;

COMMENT ON COLUMN churches.status IS 'onboarding = configuração pendente; configured = CRM pronto; suspended = acesso bloqueado.';
COMMENT ON COLUMN churches.branding IS 'JSON com primary_color, secondary_color, logo_url da marca da igreja.';
COMMENT ON COLUMN churches.onboarding_config IS 'JSON completo gerado pelo Agente Consultor e consumido pelo Agente Engenheiro.';

-- ============================================================
-- TABELA: onboarding_sessions
-- Sessão de conversa entre o pastor e o Agente Consultor (Agente 10).
-- Armazena histórico de mensagens e o JSON final de configuração.
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_sessions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        REFERENCES churches(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL,
  plan_slug    VARCHAR(50) REFERENCES plans(slug),
  status       TEXT        NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'abandoned')),
  block_index  INTEGER     NOT NULL DEFAULT 1 CHECK (block_index BETWEEN 1 AND 6),
  messages     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  config_json  JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER onboarding_sessions_updated_at
  BEFORE UPDATE ON onboarding_sessions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_id   ON onboarding_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_church_id ON onboarding_sessions (church_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_status    ON onboarding_sessions (status);

COMMENT ON TABLE onboarding_sessions IS 'Sessão de onboarding conversacional. Uma por processo de configuração de tenant.';
COMMENT ON COLUMN onboarding_sessions.messages IS 'Array de {role, content, timestamp} — histórico completo da conversa.';
COMMENT ON COLUMN onboarding_sessions.config_json IS 'JSON gerado via tool_use quando Agente 10 conclui a coleta.';
COMMENT ON COLUMN onboarding_sessions.block_index IS 'Bloco atual da conversa (1-6). Usado para barra de progresso no frontend.';

-- RLS: usuário vê apenas a própria sessão
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_sessions_owner"
  ON onboarding_sessions FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "onboarding_sessions_service_all"
  ON onboarding_sessions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TABELA: onboarding_steps
-- Steps de execução do Agente Engenheiro (Agente 11).
-- Atualizada em tempo real — frontend faz Realtime subscription.
-- ============================================================

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES onboarding_sessions(id) ON DELETE CASCADE,
  church_id    UUID        REFERENCES churches(id) ON DELETE CASCADE,
  step_number  INTEGER     NOT NULL CHECK (step_number BETWEEN 1 AND 20),
  label        TEXT        NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'done', 'failed', 'skipped')),
  error_msg    TEXT,
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, step_number)
);

CREATE TRIGGER onboarding_steps_updated_at
  BEFORE UPDATE ON onboarding_steps
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE INDEX IF NOT EXISTS idx_onboarding_steps_session_id ON onboarding_steps (session_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_steps_church_id  ON onboarding_steps (church_id);

COMMENT ON TABLE onboarding_steps IS 'Cada linha é um step de configuração do Agente Engenheiro. Atualizado em tempo real.';

-- RLS: usuário vê steps da própria sessão
ALTER TABLE onboarding_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_steps_owner"
  ON onboarding_steps FOR SELECT
  USING (
    session_id IN (
      SELECT id FROM onboarding_sessions WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "onboarding_steps_service_all"
  ON onboarding_steps FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TABELA: church_sites
-- Sedes e congregações de igrejas multi-site.
-- ============================================================

CREATE TABLE IF NOT EXISTS church_sites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  city       TEXT,
  state      TEXT,
  address    TEXT,
  is_main    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_church_sites_church_id ON church_sites (church_id);

ALTER TABLE church_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "church_sites_tenant_select"
  ON church_sites FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY "church_sites_service_all"
  ON church_sites FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TABELA: pastoral_goals
-- Metas pastorais configuradas durante o onboarding.
-- ============================================================

CREATE TABLE IF NOT EXISTS pastoral_goals (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  metric     TEXT        NOT NULL,
  target     NUMERIC     NOT NULL,
  baseline   NUMERIC,
  period     TEXT        NOT NULL DEFAULT 'monthly'
    CHECK (period IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pastoral_goals_church_id ON pastoral_goals (church_id);

ALTER TABLE pastoral_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pastoral_goals_tenant_select"
  ON pastoral_goals FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY "pastoral_goals_service_all"
  ON pastoral_goals FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TABELA: message_templates
-- Templates de mensagem pastoral gerados durante onboarding.
-- ============================================================

CREATE TABLE IF NOT EXISTS message_templates (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  category     TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_message_templates_church_id ON message_templates (church_id);

ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "message_templates_tenant_select"
  ON message_templates FOR SELECT
  USING (church_id = auth_church_id());

CREATE POLICY "message_templates_service_all"
  ON message_templates FOR ALL
  USING (auth.role() = 'service_role');
