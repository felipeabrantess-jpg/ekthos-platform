-- Migration: fix_expire_grants_cron
-- Bug: expire-agent-grants cron setava active=false mas não revoked_at
-- Fix: atualiza cron para setar revoked_at=now() quando grant expira
-- Guards dos EFs usam ends_at diretamente (segurança não afetada), mas
-- o estado DB fica consistente: revoked_at NULL = ativo, NOT NULL = expirado/revogado

SELECT cron.unschedule('expire-agent-grants');

SELECT cron.schedule(
  'expire-agent-grants',
  '0 * * * *',
  $$
    UPDATE public.agent_grants
    SET    active     = false,
           revoked_at = now(),
           updated_at = now()
    WHERE  revoked_at IS NULL
      AND  ends_at    IS NOT NULL
      AND  ends_at    <= now();
  $$
);

-- Corrigir grants já expirados que têm revoked_at=NULL (estado inconsistente existente)
UPDATE public.agent_grants
SET    active     = false,
       revoked_at = ends_at,  -- backfill: revoked_at = quando expirou
       updated_at = now()
WHERE  revoked_at IS NULL
  AND  ends_at    IS NOT NULL
  AND  ends_at    < now();
