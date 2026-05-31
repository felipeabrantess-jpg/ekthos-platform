-- A6: Fila de aprovação de mensagens + approval_mode em church_agent_config
-- Feature flag: approval_mode DEFAULT 'auto' → todas igrejas existentes ficam no modo automático (OFF)

CREATE TABLE IF NOT EXISTS agent_message_pending_approval (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug      text        NOT NULL,
  conversation_id uuid        REFERENCES conversations(id) ON DELETE SET NULL,
  draft_content   text        NOT NULL,
  draft_metadata  jsonb       NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,
  approved_by     uuid        REFERENCES auth.users(id),
  approved_at     timestamptz,
  rejected_reason text,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired','sent'))
);

CREATE INDEX IF NOT EXISTS idx_amp_church_status
  ON agent_message_pending_approval(church_id, status, created_at DESC);

ALTER TABLE agent_message_pending_approval ENABLE ROW LEVEL SECURITY;

-- Membros da igreja podem ler suas próprias mensagens pendentes
CREATE POLICY "church members read pending approvals"
  ON agent_message_pending_approval FOR SELECT
  TO authenticated
  USING (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid);

-- Service role tem acesso total (EFs usam service_role)
CREATE POLICY "service role full access on pending approvals"
  ON agent_message_pending_approval FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Adiciona coluna approval_mode em church_agent_config
ALTER TABLE church_agent_config
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'auto'
  CHECK (approval_mode IN ('auto','manual'));

COMMENT ON COLUMN church_agent_config.approval_mode IS
  'auto = agente envia direto; manual = mensagem vai para fila de aprovação do pastor';
