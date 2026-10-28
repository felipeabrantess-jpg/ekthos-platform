-- Rollback de 20261026150000_whatsapp_message_statuses.sql
-- Antes: republicar a versão anterior do webhook-receiver (v45), senão ele tenta gravar numa tabela inexistente
-- (a falha é só logada e não afeta as mensagens recebidas, mas gera ruído).
DROP VIEW IF EXISTS public.whatsapp_dispatch_delivery;
DROP TABLE IF EXISTS public.whatsapp_message_statuses;
