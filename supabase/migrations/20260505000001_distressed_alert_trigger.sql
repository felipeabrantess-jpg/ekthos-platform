-- ============================================================
-- Migration: 20260505000001_distressed_alert_trigger.sql
-- Sprint 1 — Fase 4
--
-- Cria função e trigger para detectar crise emocional acumulada.
-- Quando 3+ mensagens com sentiment='distressed' chegam na mesma
-- conversa em 24 horas, insere notificação em internal_notifications
-- para alertar a liderança pastoral.
--
-- Trigger: AFTER UPDATE OF metadata ON conversation_messages
-- Dedup: Uma notificação por conversa a cada 24h.
-- ============================================================

-- ── Função do trigger ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_distressed_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sentiment        text;
  v_distressed_count int;
  v_already_notified boolean;
  v_conversation_id  uuid;
  v_church_id        uuid;
BEGIN
  -- Só processa quando metadata contém haiku_classification
  v_sentiment := NEW.metadata -> 'haiku_classification' ->> 'sentiment';

  IF v_sentiment IS DISTINCT FROM 'distressed' THEN
    RETURN NEW;
  END IF;

  v_conversation_id := NEW.conversation_id;
  v_church_id       := NEW.church_id;

  -- Conta mensagens distressed nas últimas 24h para esta conversa
  SELECT COUNT(*)
    INTO v_distressed_count
    FROM public.conversation_messages
   WHERE conversation_id = v_conversation_id
     AND metadata -> 'haiku_classification' ->> 'sentiment' = 'distressed'
     AND created_at > NOW() - INTERVAL '24 hours';

  -- Limiar: 3 ou mais mensagens distressed
  IF v_distressed_count < 3 THEN
    RETURN NEW;
  END IF;

  -- Dedup: verifica se já foi notificado nas últimas 24h para esta conversa
  SELECT EXISTS (
    SELECT 1
      FROM public.internal_notifications
     WHERE agent_slug  = 'agent-haiku-triagem'
       AND church_id   = v_church_id
       AND metadata ->> 'conversation_id' = v_conversation_id::text
       AND created_at  > NOW() - INTERVAL '24 hours'
  ) INTO v_already_notified;

  IF v_already_notified THEN
    RETURN NEW;
  END IF;

  -- Insere notificação de alerta pastoral
  INSERT INTO public.internal_notifications (
    notification_type,
    church_id,
    agent_slug,
    title,
    message,
    metadata,
    status
  ) VALUES (
    'general',
    v_church_id,
    'agent-haiku-triagem',
    '🚨 Crise emocional detectada',
    'Um membro apresentou 3 ou mais mensagens de angústia nas últimas 24h. Atenção pastoral necessária.',
    jsonb_build_object('conversation_id', v_conversation_id::text),
    'pending'
  );

  RETURN NEW;
END;
$$;

-- ── Revoke execução pública (SECURITY DEFINER — hardening obrigatório) ────────
-- Sem este REVOKE, qualquer usuário autenticado pode chamar fn_distressed_alert()
-- diretamente e, como roda como postgres (owner), tem acesso irrestrito a
-- internal_notifications ignorando RLS. Padrão do projeto: ver 00014_security_hardening.sql
REVOKE ALL ON FUNCTION public.fn_distressed_alert() FROM PUBLIC;

-- ── Trigger ──────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_distressed_alert ON public.conversation_messages;

CREATE TRIGGER trg_distressed_alert
  AFTER UPDATE OF metadata
  ON public.conversation_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_distressed_alert();

COMMENT ON TRIGGER trg_distressed_alert ON public.conversation_messages IS
  'Sprint 1 — Alerta pastoral quando 3+ msgs distressed em 24h na mesma conversa. Dedup: 1 notificação por conversa/24h.';
