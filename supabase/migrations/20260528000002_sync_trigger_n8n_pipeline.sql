-- Sync: captura estado corrigido do trigger trigger_n8n_pipeline (jsonb+guard+search_path).
-- ATENÇÃO: NÃO aplicar ao banco — o banco já está correto (fix aplicado diretamente em sessão anterior).
-- Este arquivo existe apenas para manter o repo em sync com o estado real do banco.
-- Aplicar APENAS em ambientes novos / branch reset.

DROP TRIGGER IF EXISTS trg_n8n_pipeline_insert ON person_pipeline;
DROP TRIGGER IF EXISTS trg_n8n_pipeline_update ON person_pipeline;

CREATE OR REPLACE FUNCTION public.trigger_n8n_pipeline()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'net'
AS $function$
DECLARE v_url TEXT;
BEGIN
  SELECT pipeline_url INTO v_url
  FROM n8n_webhooks
  WHERE church_id = NEW.church_id AND is_active = true;

  IF v_url IS NULL THEN RETURN NEW; END IF;

  BEGIN
    PERFORM net.http_post(
      url     := v_url,
      body    := jsonb_build_object(
        'event',       'pipeline_' || lower(TG_OP),
        'church_id',   NEW.church_id,
        'person_id',   NEW.person_id,
        'stage_id',    NEW.stage_id,
        'entered_at',  NEW.entered_at,
        'loss_reason', NEW.loss_reason,
        'ts',          now()
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- n8n indisponível/lento NÃO reverte mudança de etapa. Efeito colateral.
    NULL;
  END;

  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_n8n_pipeline_insert
  AFTER INSERT ON person_pipeline
  FOR EACH ROW EXECUTE FUNCTION trigger_n8n_pipeline();

CREATE TRIGGER trg_n8n_pipeline_update
  AFTER UPDATE ON person_pipeline
  FOR EACH ROW EXECUTE FUNCTION trigger_n8n_pipeline();
