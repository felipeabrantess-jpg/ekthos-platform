-- =============================================================
-- SPRINT 2.5 — church_agent_channel_routing
-- Override de roteamento por-igreja (multi-tenant real)
-- Resolve bloqueador: agent_channel_routing era global (sem church_id)
-- 01/05/2026
-- =============================================================

-- Tabela de override por-igreja: prevalece sobre agent_channel_routing global
CREATE TABLE IF NOT EXISTS church_agent_channel_routing (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug   text NOT NULL,
  context_type text NOT NULL
    CHECK (context_type IN ('pastoral', 'operacional')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (church_id, agent_slug)
);

-- Índice para lookup em dispatch-message
CREATE INDEX IF NOT EXISTS idx_cacr_church_agent
  ON church_agent_channel_routing(church_id, agent_slug);

-- Updated_at automático
CREATE OR REPLACE TRIGGER trg_cacr_updated_at
  BEFORE UPDATE ON church_agent_channel_routing
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- RLS: time Ekthos (service_role) acessa tudo; pastor só vê da própria igreja
ALTER TABLE church_agent_channel_routing ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_agent_channel_routing'
      AND policyname = 'church_agent_channel_routing_church_read'
  ) THEN
    CREATE POLICY church_agent_channel_routing_church_read
      ON church_agent_channel_routing FOR SELECT
      USING (church_id = auth_church_id());
  END IF;
END $$;

-- Atualiza context_type na tabela global (referência semântica)
-- agent_channel_routing continua com channel_type = 'meta_cloud'|'zapi' para fallback
-- context_type é campo novo adicionado para legibilidade
ALTER TABLE agent_channel_routing
  ADD COLUMN IF NOT EXISTS context_type text
    CHECK (context_type IN ('pastoral', 'operacional'));

UPDATE agent_channel_routing
  SET context_type = 'pastoral'
  WHERE agent_slug IN ('agent-acolhimento', 'agent-reengajamento')
    AND context_type IS NULL;

UPDATE agent_channel_routing
  SET context_type = 'operacional'
  WHERE agent_slug = 'agent-operacao'
    AND context_type IS NULL;
