-- ============================================================
-- Sprint 2A — Onda A — Migration 3
-- CREATE TABLE church_followup_config
-- Configura régua de follow-up por igreja e por agente.
-- Touchpoints são lista fechada — admin escolhe quais ativar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.church_followup_config (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  agent_slug      text        NOT NULL,

  -- Touchpoints ativos (subset da lista fechada do agente)
  -- Para agent-acolhimento: ['D+0','D+3','D+7','D+14','D+30','D+60','D+90']
  -- Para agent-reengajamento: ['RE+15','RE+30','RE+60','RE+90']
  enabled_touchpoints text[]   NOT NULL DEFAULT '{}',
  followup_enabled    boolean  NOT NULL DEFAULT true,
  duration_days       integer,             -- dias máximos da jornada antes de encerrar

  -- Janela de envio (horário local da igreja)
  send_window_start   time,               -- ex: '08:00'
  send_window_end     time,               -- ex: '20:00'

  -- Condições de parada e escalonamento
  stop_conditions       jsonb NOT NULL DEFAULT '{"on_response": true, "on_attendance": true}'::jsonb,
  escalation_conditions jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- O que fazer ao concluir a jornada
  next_action_after_completion text,     -- ex: 'move_pipeline', 'notify_pastor', 'none'

  updated_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (church_id, agent_slug)
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS cfc_church_idx ON public.church_followup_config (church_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.church_followup_config ENABLE ROW LEVEL SECURITY;

-- Tenant (pastor/liderança): apenas leitura da própria igreja
-- Sprint 2A: cockpit Ekthos escreve; pastor só vê status
CREATE POLICY cfc_tenant_read ON public.church_followup_config
  FOR SELECT
  USING (church_id = auth_church_id());

-- Admin Ekthos: leitura e escrita em qualquer igreja
CREATE POLICY cfc_admin_all ON public.church_followup_config
  FOR ALL
  USING    (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- Service role: acesso total para EFs (crons, agentes)
CREATE POLICY cfc_service_all ON public.church_followup_config
  FOR ALL
  USING    (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');

-- ── Grants ───────────────────────────────────────────────────
REVOKE ALL ON TABLE public.church_followup_config FROM PUBLIC;
GRANT SELECT            ON TABLE public.church_followup_config TO authenticated;
GRANT ALL               ON TABLE public.church_followup_config TO service_role;
