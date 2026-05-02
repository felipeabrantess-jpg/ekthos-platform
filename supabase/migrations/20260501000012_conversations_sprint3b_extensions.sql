-- ============================================================
-- Sprint 3B: Extensões em conversations + conversation_events
-- ============================================================

-- 1. Extensões em conversations
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS archived_at      timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at        timestamptz,
  ADD COLUMN IF NOT EXISTS human_assumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS human_actor_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS human_actor_name text,
  ADD COLUMN IF NOT EXISTS tags             text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS channel_type     text NOT NULL DEFAULT 'whatsapp';

-- 2. Ampliar CHECK de status para incluir 'archived'
ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE conversations
  ADD CONSTRAINT conversations_status_check
    CHECK (status IN ('open', 'pending', 'closed', 'archived'));

-- 3. conversation_events — auditoria granular de tudo que acontece numa conversa
CREATE TABLE IF NOT EXISTS conversation_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  church_id       uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  event_type      text        NOT NULL,
  -- Valores usados:
  --   message_inbound           — mensagem recebida do contato
  --   message_outbound_agent    — mensagem enviada pelo agente
  --   message_outbound_human    — mensagem enviada por staff
  --   human_assumed             — staff assumiu a conversa
  --   returned_to_agent         — staff devolveu ao agente
  --   conversation_closed       — conversa encerrada
  --   conversation_archived     — conversa arquivada
  --   conversation_reopened     — conversa reaberta (nova inbound após fechada)
  --   agent_changed             — troca de agente responsável
  --   tag_added / tag_removed   — tags da conversa
  actor_type      text        NOT NULL
    CHECK (actor_type IN ('agent', 'human', 'system', 'contact')),
  actor_id        text,        -- user_id (uuid as text) ou agent_slug
  actor_name      text,        -- nome para exibição na UI
  message_preview text,        -- primeiros 80 chars (para eventos de mensagem)
  metadata        jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS conv_events_conv_idx
  ON conversation_events (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conv_events_church_idx
  ON conversation_events (church_id, created_at DESC);

-- RLS
ALTER TABLE conversation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conv_events_church_policy ON conversation_events;
CREATE POLICY conv_events_church_policy ON conversation_events
  FOR ALL
  TO authenticated
  USING (church_id = auth_church_id());

-- 4. Índice adicional em conversations para inbox ordenada
CREATE INDEX IF NOT EXISTS conversations_inbox_idx
  ON conversations (church_id, status, last_message_at DESC)
  WHERE status != 'archived';
