-- Migration: fix reengajamento_scan_disparar — R-PREMIUM-GUARD
-- Applied: 2026-05-30 (MEGA-ONDA F-callers.4 / F5)
-- Purpose: Substituir filtro legado church_agent_config.active=true pelo
--          R-PREMIUM-GUARD (subscription_agents UNION agent_grants).

CREATE OR REPLACE FUNCTION public.reengajamento_scan_disparar()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_church     record;
  v_person     record;
  v_dispatched int;
  v_touchpoint text;
  v_days       float;
BEGIN
  -- R-PREMIUM-GUARD v1: itera apenas churches com agent-reengajamento contratado ativo.
  -- Usa subscription_agents (activation_status='active') OU agent_grants (não revogado).
  -- NÃO usa church_agent_config.active (campo legado/incorreto).
  FOR v_church IN
    SELECT DISTINCT s.church_id
    FROM subscription_agents sa
    JOIN subscriptions s ON sa.subscription_id = s.id
    WHERE sa.agent_slug = 'agent-reengajamento'
      AND sa.activation_status = 'active'
    UNION
    SELECT DISTINCT church_id
    FROM agent_grants
    WHERE agent_slug = 'agent-reengajamento'
      AND revoked_at IS NULL
      AND (ends_at IS NULL OR ends_at > NOW())
  LOOP
    v_dispatched := 0;

    FOR v_person IN
      SELECT id, last_contact_at
      FROM people
      WHERE church_id     = v_church.church_id
        AND deleted_at    IS NULL
        AND optout        = false
        AND last_contact_at IS NOT NULL
        AND last_contact_at < NOW() - INTERVAL '14 days'
        AND (
          reengagement_last_sent_at IS NULL
          OR reengagement_last_sent_at < NOW() - INTERVAL '7 days'
        )
      ORDER BY last_contact_at ASC
      LIMIT 50
    LOOP
      v_days := EXTRACT(EPOCH FROM (NOW() - v_person.last_contact_at)) / 86400.0;

      v_touchpoint := CASE
        WHEN v_days >= 56 THEN 'semana_8'
        WHEN v_days >= 28 THEN 'semana_4'
        ELSE                   'semana_2'
      END;

      PERFORM net.http_post(
        url     := 'https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/agent-reengajamento',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body    := jsonb_build_object(
          'trigger_type', 'reengagement_scan',
          'church_id',    v_church.church_id,
          'person_id',    v_person.id,
          'touchpoint',   v_touchpoint
        )
      );

      v_dispatched := v_dispatched + 1;
    END LOOP;

    IF v_dispatched > 0 THEN
      RAISE NOTICE '[reengajamento_scan_disparar] church=% dispatched=%',
        v_church.church_id, v_dispatched;
    END IF;
  END LOOP;
END;
$function$
;
