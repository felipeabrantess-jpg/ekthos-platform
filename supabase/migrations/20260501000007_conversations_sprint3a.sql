-- ============================================================
-- Sprint 3A: conversations table
-- Cada linha = 1 conversa WhatsApp entre a igreja e um contato.
-- UNIQUE(church_id, channel_id, contact_phone) garante upsert idempotente.
-- ============================================================

-- Helper: atualiza updated_at automaticamente (sem depender de moddatetime)
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS conversations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id            uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  channel_id           uuid NOT NULL REFERENCES church_whatsapp_channels(id) ON DELETE CASCADE,
  contact_phone        text NOT NULL,
  person_id            uuid REFERENCES people(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'closed', 'pending')),
  ownership            text NOT NULL DEFAULT 'agent'
                         CHECK (ownership IN ('agent', 'human', 'unassigned')),
  agent_slug           text,
  assigned_to          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_message_at      timestamptz,
  last_message_preview text,
  unread_count         integer NOT NULL DEFAULT 0,
  metadata             jsonb,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT conversations_church_channel_phone_uniq
    UNIQUE (church_id, channel_id, contact_phone)
);

-- Índices
CREATE INDEX IF NOT EXISTS conversations_church_status_idx
  ON conversations (church_id, status, last_message_at DESC);

CREATE INDEX IF NOT EXISTS conversations_person_idx
  ON conversations (person_id) WHERE person_id IS NOT NULL;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_conversations_updated_at ON conversations;
CREATE TRIGGER trg_conversations_updated_at
  BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conversations_church_policy ON conversations;
CREATE POLICY conversations_church_policy ON conversations
  FOR ALL
  TO authenticated
  USING (church_id = auth_church_id());
