-- =============================================================
-- SPRINT 3 / B1 — internal_notifications
-- Tabela para notificações internas do time Ekthos
-- (compras de agentes pendentes de ativação, alertas críticos, etc.)
-- 02/05/2026
-- =============================================================

CREATE TABLE IF NOT EXISTS internal_notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type text        NOT NULL
    CHECK (notification_type IN (
      'agent_purchase_pending',   -- agente comprado, aguarda ativação assistida
      'agent_setup_completed',    -- setup concluído, agente ativo
      'agent_paused_no_credits',  -- agente pausado por falta de créditos
      'agent_failed_delivery',    -- falha de entrega recorrente
      'churn_risk_detected',      -- sinal de risco de churn
      'general'                   -- notificação genérica / crítica
    )),
  church_id         uuid        REFERENCES churches(id),
  agent_slug        text,
  subscription_id   uuid        REFERENCES subscription_agents(id) ON DELETE SET NULL,
  title             text        NOT NULL,
  message           text        NOT NULL,
  metadata          jsonb       DEFAULT '{}'::jsonb,
  status            text        NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',      -- aguardando ação do time
      'in_progress',  -- em andamento
      'resolved',     -- resolvido
      'dismissed'     -- descartado
    )),
  assigned_to       uuid,       -- UUID do membro do time Ekthos responsável
  resolved_at       timestamptz,
  resolved_by       uuid,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- Apenas service_role acessa — tabela 100% interna
ALTER TABLE internal_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "internal_notifications_service_role_all"
  ON internal_notifications
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Índices operacionais
CREATE INDEX IF NOT EXISTS idx_internal_notif_status
  ON internal_notifications (status, created_at DESC)
  WHERE status IN ('pending', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_internal_notif_church
  ON internal_notifications (church_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_notif_type
  ON internal_notifications (notification_type, status);
