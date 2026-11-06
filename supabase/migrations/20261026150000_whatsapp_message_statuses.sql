-- ============================================================
-- Recibos de entrega do WhatsApp (Meta Cloud) + visão de monitoramento do acolhimento
--
-- channel_dispatch_queue.status = 'sent' significa só "aceito pela API da Meta" (wamid devolvido).
-- O que acontece depois chega pelo webhook em value.statuses[]: sent → delivered → read, ou failed.
-- O webhook-receiver passa a gravar cada recibo aqui (1 linha por wamid+status; duplicatas ignoradas).
-- Rollback: docs/rollbacks/20261026150000_whatsapp_message_statuses.rollback.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.whatsapp_message_statuses (
  id           bigserial   PRIMARY KEY,
  wamid        text        NOT NULL,
  status       text        NOT NULL,          -- sent | delivered | read | failed (valores da Meta)
  status_at    timestamptz NOT NULL,          -- horário informado pela Meta
  recipient_id text,
  errors       jsonb,
  channel_id   uuid,
  raw          jsonb,
  received_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (wamid, status)
);
CREATE INDEX IF NOT EXISTS whatsapp_message_statuses_status_at_idx ON public.whatsapp_message_statuses (status_at DESC);
ALTER TABLE public.whatsapp_message_statuses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.whatsapp_message_statuses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.whatsapp_message_statuses_id_seq FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.whatsapp_message_statuses IS
  'Recibos de entrega da Meta (webhook statuses[]). Só service_role. Junta com channel_dispatch_queue por provider_response->>''message_id''.';

-- Situação de cada envio: aceito pela API × enviado × entregue × lido × falhou
CREATE OR REPLACE VIEW public.whatsapp_dispatch_delivery
WITH (security_invoker = true) AS
SELECT q.id               AS queue_id,
       q.church_id,
       q.channel_id,
       q.created_at       AS enfileirado_em,
       q.status           AS status_fila,          -- pending | processing | sent (aceito pela API) | failed
       q.processed_at,
       q.error_message    AS erro_fila,
       q.provider_response ->> 'message_id' AS wamid,
       (SELECT max(s.status_at) FROM whatsapp_message_statuses s WHERE s.wamid = q.provider_response ->> 'message_id' AND s.status = 'sent')      AS enviado_em,
       (SELECT max(s.status_at) FROM whatsapp_message_statuses s WHERE s.wamid = q.provider_response ->> 'message_id' AND s.status = 'delivered') AS entregue_em,
       (SELECT max(s.status_at) FROM whatsapp_message_statuses s WHERE s.wamid = q.provider_response ->> 'message_id' AND s.status = 'read')      AS lido_em,
       (SELECT s.errors FROM whatsapp_message_statuses s WHERE s.wamid = q.provider_response ->> 'message_id' AND s.status = 'failed' LIMIT 1)    AS falha_meta
FROM channel_dispatch_queue q;
REVOKE ALL ON public.whatsapp_dispatch_delivery FROM PUBLIC, anon, authenticated;
COMMENT ON VIEW public.whatsapp_dispatch_delivery IS
  'Monitoramento (service_role): fila → aceito pela API → enviado/entregue/lido/falhou segundo os recibos da Meta.';
