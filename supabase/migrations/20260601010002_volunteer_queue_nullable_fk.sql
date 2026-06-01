-- Migration: volunteer_queue_nullable_fk
-- Torna conversation_id e message_id nullable em channel_dispatch_queue
-- para suportar notificações outbound proativas sem conversa existente
-- Ex: notify-escala, volunteer-reminders, escala-confirm-handler replies
-- channel-dispatcher: ao marcar sent/failed usa .eq('id', null) = no-op silencioso

ALTER TABLE public.channel_dispatch_queue
  ALTER COLUMN conversation_id DROP NOT NULL,
  ALTER COLUMN message_id DROP NOT NULL;

COMMENT ON COLUMN public.channel_dispatch_queue.conversation_id IS
  'NULL permitido para mensagens proativas sem conversa existente (ex: notify-escala, volunteer-reminders)';
COMMENT ON COLUMN public.channel_dispatch_queue.message_id IS
  'NULL permitido para mensagens proativas sem conversa existente. channel-dispatcher faz no-op silencioso no update de conversation_messages quando NULL.';
