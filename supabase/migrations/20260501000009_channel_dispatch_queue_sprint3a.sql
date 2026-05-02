-- ============================================================
-- Sprint 3A: channel_dispatch_queue table
-- Fila de entrega de mensagens outbound.
-- channel-dispatcher EF lê aqui e entrega via adapter correto.
-- Backoff exponencial: 2^attempt * 60s, max 3 tentativas.
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_dispatch_queue (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       uuid NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
  channel_id       uuid NOT NULL REFERENCES church_whatsapp_channels(id) ON DELETE CASCADE,
  to_phone         text NOT NULL,
  content          text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
  attempt_count    integer NOT NULL DEFAULT 0,
  max_attempts     integer NOT NULL DEFAULT 3,
  scheduled_at     timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  provider_response jsonb,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Índice para o worker (channel-dispatcher): pending + agendado para agora
CREATE INDEX IF NOT EXISTS dispatch_queue_worker_idx
  ON channel_dispatch_queue (status, scheduled_at)
  WHERE status = 'pending';
