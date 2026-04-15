-- ============================================================
-- Migration: 00017_agents_ai.sql
-- Descrição: Infraestrutura para os agentes de IA do Ekthos.
--   1. ALTER agents_catalog — coluna model (haiku/sonnet)
--   2. agent_conversations  — histórico de chats por user/agente
--   3. agent_executions     — log de execuções com tokens e custo
-- Criado em: 2026-04-15
-- ============================================================

-- ── 1. ALTER agents_catalog: adiciona modelo de IA ───────────

ALTER TABLE agents_catalog
  ADD COLUMN IF NOT EXISTS model text NOT NULL DEFAULT 'haiku'
  CHECK (model IN ('haiku', 'sonnet'));

-- Atualiza modelos baseado na complexidade de cada agente
UPDATE agents_catalog SET model = 'sonnet'
WHERE slug IN (
  'agent-funil',
  'agent-metricas',
  'agent-relatorios',
  'agent-financeiro',
  'agent-proposta',
  'agent-formacao',
  'agent-missoes',
  'agent-cuidado'
);

UPDATE agents_catalog SET model = 'haiku'
WHERE slug IN (
  'agent-suporte',
  'agent-onboarding',
  'agent-conteudo',
  'agent-escalas',
  'agent-cadastro',
  'agent-agenda',
  'agent-whatsapp'
);

-- ── 2. agent_conversations — histórico de chats ───────────────

CREATE TABLE IF NOT EXISTS agent_conversations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL,
  agent_slug   text        NOT NULL,
  role         text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content      text        NOT NULL,
  tokens_used  integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_conversations_lookup_idx
  ON agent_conversations(church_id, user_id, agent_slug, created_at DESC);

ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;

-- Membros veem apenas o histórico da própria igreja
CREATE POLICY "agent_conversations_church_isolation"
  ON agent_conversations
  FOR ALL
  USING (
    church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid
  );

-- ── 3. agent_executions — log de execuções ────────────────────

CREATE TABLE IF NOT EXISTS agent_executions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id      uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug     text        NOT NULL,
  user_id        uuid,
  model          text        NOT NULL,
  input_tokens   integer     NOT NULL DEFAULT 0,
  output_tokens  integer     NOT NULL DEFAULT 0,
  duration_ms    integer,
  success        boolean     NOT NULL DEFAULT true,
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_executions_church_idx
  ON agent_executions(church_id, agent_slug, created_at DESC);

ALTER TABLE agent_executions ENABLE ROW LEVEL SECURITY;
-- Sem policy: acesso apenas via service_role nas Edge Functions

COMMENT ON TABLE agent_conversations IS 'Histórico de mensagens dos agentes conversacionais por usuário.';
COMMENT ON TABLE agent_executions    IS 'Log de cada chamada à API Anthropic com tokens e duração.';
