-- ============================================================
-- Sprint 3A: pg_cron job para channel-dispatcher
-- Executa a cada 1 minuto (pg_cron não suporta < 60s).
-- EF tem verify_jwt=false, então não precisa de Authorization.
-- ============================================================

-- Remove job existente se houver (idempotência)
SELECT cron.unschedule('channel-dispatcher-cron')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'channel-dispatcher-cron'
);

SELECT cron.schedule(
  'channel-dispatcher-cron',
  '* * * * *',  -- a cada 1 minuto
  $$
    SELECT net.http_post(
      url := 'https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/channel-dispatcher',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{"trigger": "cron"}'::jsonb
    );
  $$
);
