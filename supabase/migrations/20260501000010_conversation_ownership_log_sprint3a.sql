-- ============================================================
-- Sprint 3A: conversation_ownership_log table
-- Trilha de auditoria imutável de transições de ownership.
-- Uma linha por transição: unassigned→agent, agent→human, etc.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_ownership_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_ownership   text NOT NULL,
  to_ownership     text NOT NULL,
  actor_type       text NOT NULL CHECK (actor_type IN ('system', 'agent', 'human_staff')),
  actor_id         text,    -- user_id ou agent_slug
  reason           text,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Índice para consulta por conversa
CREATE INDEX IF NOT EXISTS ownership_log_conversation_idx
  ON conversation_ownership_log (conversation_id, created_at);

-- RLS: leitura via conversations (mesma church_id)
ALTER TABLE conversation_ownership_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ownership_log_church_policy ON conversation_ownership_log;
CREATE POLICY ownership_log_church_policy ON conversation_ownership_log
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id
        AND c.church_id = auth_church_id()
    )
  );
