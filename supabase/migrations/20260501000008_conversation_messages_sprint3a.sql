-- ============================================================
-- Sprint 3A: conversation_messages table
-- Histórico bidirecional de mensagens (inbound + outbound).
-- provider_message_id garante deduplicação de retentativas Z-API.
-- ============================================================

CREATE TABLE IF NOT EXISTS conversation_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id      uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  church_id            uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  direction            text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  sender_type          text NOT NULL
                         CHECK (sender_type IN ('contact', 'agent', 'human_staff', 'system')),
  sender_id            text,                 -- phone ou user_id (texto livre)
  content              text NOT NULL,
  content_type         text NOT NULL DEFAULT 'text'
                         CHECK (content_type IN ('text', 'image', 'audio', 'video', 'document', 'template')),
  status               text NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'queued', 'sent', 'delivered', 'read', 'failed')),
  provider_message_id  text,
  error_detail         text,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS conv_messages_conversation_idx
  ON conversation_messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS conv_messages_church_idx
  ON conversation_messages (church_id, created_at DESC);

-- Deduplicação: provider_message_id único quando preenchido
CREATE UNIQUE INDEX IF NOT EXISTS conv_messages_provider_id_uniq
  ON conversation_messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- RLS
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_messages_church_policy ON conversation_messages;
CREATE POLICY conv_messages_church_policy ON conversation_messages
  FOR ALL
  TO authenticated
  USING (church_id = auth_church_id());
