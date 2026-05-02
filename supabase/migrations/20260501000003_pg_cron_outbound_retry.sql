-- =============================================================
-- SPRINT 2 — pg_cron: agent-outbound-retry a cada 5 min
-- Worker de retry para mensagens awaiting_retry no n8n
-- 01/05/2026
--
-- NOTA: verify_jwt=false na EF — sem Authorization header necessário.
-- URL hardcoded pois app.supabase_url não existe como GUC no projeto.
-- =============================================================

-- Remove job anterior se existir (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'agent-outbound-retry') THEN
    PERFORM cron.unschedule('agent-outbound-retry');
  END IF;
END;
$$;

-- Cria job: a cada 5 min, chama EF agent-outbound-retry
SELECT cron.schedule(
  'agent-outbound-retry',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/agent-outbound-retry',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body    := '{"trigger": "cron"}'::jsonb
  );
  $$
);
