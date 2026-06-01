-- Migration: volunteer_reengajamento_scan (V8)
-- Cria tabela volunteer_points (gamificação D8), função volunteer_reengajamento_scan
-- e pg_cron semanal (segunda 09h BRT = 12h UTC).
-- Voluntários com ≥3 cancelamentos em 30d → alerta pastoral + disparo agent-reengajamento.
-- Voluntários em ≥5 dos últimos 6 meses → alerta de sobrecarga pastoral.
-- D5: SEM debit de créditos (incluído no Volunteer Pro).

-- ── Tabela volunteer_points (gamificação D8) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.volunteer_points (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  volunteer_id UUID        NOT NULL REFERENCES public.volunteers(id) ON DELETE CASCADE,
  church_id    UUID        NOT NULL REFERENCES public.churches(id)   ON DELETE CASCADE,
  points       INTEGER     NOT NULL DEFAULT 0 CHECK (points >= 0),
  reason       TEXT        NOT NULL,
  awarded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata     JSONB       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_vpoints_volunteer ON public.volunteer_points (volunteer_id);
CREATE INDEX IF NOT EXISTS idx_vpoints_church    ON public.volunteer_points (church_id);
CREATE INDEX IF NOT EXISTS idx_vpoints_awarded   ON public.volunteer_points (awarded_at DESC);

ALTER TABLE public.volunteer_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY vpoints_service_all ON public.volunteer_points
  FOR ALL TO service_role USING (true);

CREATE POLICY vpoints_tenant_all ON public.volunteer_points
  FOR ALL TO authenticated
  USING  (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid)
  WITH CHECK (church_id = (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid);

COMMENT ON TABLE public.volunteer_points IS
  'Pontos de gamificação por serviço prestado — Volunteer Pro (D8)';

-- ── RPC: volunteer_reengajamento_scan ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.volunteer_reengajamento_scan(
  p_church_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_church            RECORD;
  v_vol               RECORD;
  v_admin             RECORD;
  v_churches_processed INT := 0;
  v_alerts_sent        INT := 0;
  v_reengajamento_sent INT := 0;
BEGIN
  -- Iterar sobre igrejas com módulo escalas/voluntários habilitado
  FOR v_church IN
    SELECT c.id, c.name, c.pastor_titular_phone
    FROM churches c
    WHERE (p_church_id IS NULL OR c.id = p_church_id)
      AND c.deleted_at IS NULL
      AND (
        (c.enabled_modules->>'escalas')::boolean = true
        OR (c.enabled_modules->>'voluntarios')::boolean = true
      )
  LOOP
    v_churches_processed := v_churches_processed + 1;

    -- -------------------------------------------------------
    -- BLOCO 1: Voluntários AFASTADOS
    -- Critério: >=3 assignments com attendance_confirmed=false
    --           nos últimos 30 dias
    -- -------------------------------------------------------
    FOR v_vol IN
      SELECT
        vol.id                AS volunteer_id,
        vol.person_id,
        p.name                AS person_name,
        COUNT(*)              AS cancel_count,
        'abandonment'::text   AS reason
      FROM service_schedule_assignments ssa
      JOIN service_schedules ss   ON ss.id  = ssa.schedule_id
      JOIN volunteers vol          ON vol.id = ssa.volunteer_id
      JOIN people p                ON p.id   = vol.person_id
      WHERE ss.church_id = v_church.id
        AND p.church_id  = v_church.id
        AND ssa.attendance_confirmed = false
        AND ssa.confirmed_at IS NOT NULL
        AND ssa.confirmed_at > NOW() - INTERVAL '30 days'
        AND p.deleted_at IS NULL
      GROUP BY vol.id, vol.person_id, p.name
      HAVING COUNT(*) >= 3
    LOOP
      -- Evitar alerta duplicado nos últimos 7 dias
      IF NOT EXISTS (
        SELECT 1 FROM audit_logs al
        WHERE al.church_id   = v_church.id
          AND al.action      = 'volunteer_abandonment_alert'
          AND al.entity_id   = v_vol.volunteer_id
          AND al.created_at  > NOW() - INTERVAL '7 days'
      ) THEN

        -- Notificação de dashboard para cada admin da igreja
        FOR v_admin IN
          SELECT ur.user_id
          FROM user_roles ur
          WHERE ur.church_id = v_church.id
            AND ur.role::text IN ('admin', 'dev')
        LOOP
          INSERT INTO notifications (id, church_id, user_id, title, body, type, read, person_id)
          VALUES (
            gen_random_uuid(),
            v_church.id,
            v_admin.user_id,
            'Alerta pastoral: voluntário afastado',
            v_vol.person_name || ' cancelou ' || v_vol.cancel_count ||
              ' escala(s) nos últimos 30 dias. Considere verificar o bem-estar desta pessoa.',
            'volunteer_abandonment',
            false,
            v_vol.person_id
          );
        END LOOP;

        -- Audit log
        INSERT INTO audit_logs (
          id, church_id, entity_type, entity_id, action,
          actor_type, actor_id, payload
        ) VALUES (
          gen_random_uuid(),
          v_church.id,
          'volunteer',
          v_vol.volunteer_id,
          'volunteer_abandonment_alert',
          'system',
          'volunteer_reengajamento_scan',
          jsonb_build_object(
            'person_name',   v_vol.person_name,
            'person_id',     v_vol.person_id,
            'cancel_count',  v_vol.cancel_count,
            'reason',        'volunteer_abandonment',
            'window_days',   30
          )
        );

        -- Se agent-reengajamento ativo para esta igreja, disparar
        IF EXISTS (
          SELECT 1 FROM subscription_agents sa
          JOIN subscriptions sub ON sa.subscription_id = sub.id
          WHERE sub.church_id = v_church.id
            AND sa.agent_slug = 'agent-reengajamento'
            AND sa.activation_status = 'active'
          UNION ALL
          SELECT 1 FROM agent_grants ag
          WHERE ag.church_id  = v_church.id
            AND ag.agent_slug = 'agent-reengajamento'
            AND ag.revoked_at IS NULL
            AND (ag.ends_at IS NULL OR ag.ends_at > NOW())
        ) THEN
          -- Verificar se não existe journey ativa recente (7d)
          IF NOT EXISTS (
            SELECT 1 FROM reengagement_journey rj
            WHERE rj.church_id  = v_church.id
              AND rj.person_id  = v_vol.person_id
              AND rj.status NOT IN ('completed', 'cancelled')
              AND rj.created_at > NOW() - INTERVAL '7 days'
          ) THEN
            PERFORM net.http_post(
              url     := 'https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/agent-reengajamento',
              headers := '{"Content-Type": "application/json"}'::jsonb,
              body    := jsonb_build_object(
                'trigger_type', 'volunteer_abandonment',
                'church_id',    v_church.id,
                'person_id',    v_vol.person_id,
                'touchpoint',   'semana_2',
                'context', jsonb_build_object(
                  'reason',        'volunteer_abandonment',
                  'volunteer_id',  v_vol.volunteer_id,
                  'cancel_count',  v_vol.cancel_count
                )
              )
            );
            v_reengajamento_sent := v_reengajamento_sent + 1;
          END IF;
        END IF;

        v_alerts_sent := v_alerts_sent + 1;
      END IF;
    END LOOP;

    -- -------------------------------------------------------
    -- BLOCO 2: Voluntários SOBRECARREGADOS
    -- Critério: escalados em >=5 dos últimos 6 meses distintos
    -- -------------------------------------------------------
    FOR v_vol IN
      SELECT
        vol.id            AS volunteer_id,
        vol.person_id,
        p.name            AS person_name,
        COUNT(DISTINCT DATE_TRUNC('month', ss.event_date)) AS active_months,
        'overload'::text  AS reason
      FROM service_schedule_assignments ssa
      JOIN service_schedules ss ON ss.id  = ssa.schedule_id
      JOIN volunteers vol        ON vol.id = ssa.volunteer_id
      JOIN people p              ON p.id   = vol.person_id
      WHERE ss.church_id = v_church.id
        AND p.church_id  = v_church.id
        AND ss.event_date >= (CURRENT_DATE - INTERVAL '6 months')
        AND p.deleted_at IS NULL
      GROUP BY vol.id, vol.person_id, p.name
      HAVING COUNT(DISTINCT DATE_TRUNC('month', ss.event_date)) >= 5
    LOOP
      -- Evitar alerta duplicado nos últimos 30 dias
      IF NOT EXISTS (
        SELECT 1 FROM audit_logs al
        WHERE al.church_id   = v_church.id
          AND al.action      = 'volunteer_overload_alert'
          AND al.entity_id   = v_vol.volunteer_id
          AND al.created_at  > NOW() - INTERVAL '30 days'
      ) THEN

        -- Notificação de dashboard para admins
        FOR v_admin IN
          SELECT ur.user_id
          FROM user_roles ur
          WHERE ur.church_id = v_church.id
            AND ur.role::text IN ('admin', 'dev')
        LOOP
          INSERT INTO notifications (id, church_id, user_id, title, body, type, read, person_id)
          VALUES (
            gen_random_uuid(),
            v_church.id,
            v_admin.user_id,
            'Alerta pastoral: voluntário sobrecarregado',
            v_vol.person_name || ' está escalado(a) em ' || v_vol.active_months ||
              ' dos últimos 6 meses. Considere redistribuir as responsabilidades.',
            'volunteer_overload',
            false,
            v_vol.person_id
          );
        END LOOP;

        -- Audit log
        INSERT INTO audit_logs (
          id, church_id, entity_type, entity_id, action,
          actor_type, actor_id, payload
        ) VALUES (
          gen_random_uuid(),
          v_church.id,
          'volunteer',
          v_vol.volunteer_id,
          'volunteer_overload_alert',
          'system',
          'volunteer_reengajamento_scan',
          jsonb_build_object(
            'person_name',   v_vol.person_name,
            'person_id',     v_vol.person_id,
            'active_months', v_vol.active_months,
            'reason',        'volunteer_overload',
            'window_months', 6
          )
        );

        v_alerts_sent := v_alerts_sent + 1;
      END IF;
    END LOOP;

  END LOOP;

  RETURN jsonb_build_object(
    'churches_processed',  v_churches_processed,
    'alerts_sent',         v_alerts_sent,
    'reengajamento_fired', v_reengajamento_sent,
    'run_at',              NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.volunteer_reengajamento_scan(UUID) TO service_role;

COMMENT ON FUNCTION public.volunteer_reengajamento_scan IS
  'Scan semanal: detecta voluntários afastados (≥3 cancelamentos/30d) e sobrecarregados (≥5 meses/6m).
   Dispara notificações dashboard + agent-reengajamento quando elegível (R-PREMIUM-GUARD D5).';

-- ── pg_cron: volunteer-reengajamento-weekly (segunda 09h BRT = 12h UTC) ──────
SELECT cron.schedule(
  'volunteer-reengajamento-weekly',
  '0 12 * * 1',
  $$ SELECT public.volunteer_reengajamento_scan() $$
);
