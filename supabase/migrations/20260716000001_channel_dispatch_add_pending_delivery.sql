-- Add 'pending_delivery' to channel_dispatch_queue.status
-- Used by channel-dispatcher when Z-API returns only zaapId (internal queue)
-- instead of messageId (3EB* = WhatsApp-native confirmed delivery).
-- Idempotente: DROP + ADD é seguro pois não muda nenhum valor existente.

ALTER TABLE channel_dispatch_queue
  DROP CONSTRAINT IF EXISTS channel_dispatch_queue_status_check;

ALTER TABLE channel_dispatch_queue
  ADD CONSTRAINT channel_dispatch_queue_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'sent'::text,
    'failed'::text,
    'pending_delivery'::text
  ]));
