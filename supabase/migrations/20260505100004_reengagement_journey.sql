-- ============================================================
-- Sprint 2A — Onda A — Migration 4
-- CREATE TABLE reengagement_journey
-- Rastreamento das jornadas de reengajamento pastoral.
-- NÃO é reuso de acolhimento_journey — touchpoints diferentes.
-- Implementação do agente fica para Onda E.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.reengagement_journey (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id          uuid        NOT NULL REFERENCES public.churches(id)  ON DELETE CASCADE,
  person_id          uuid        NOT NULL REFERENCES public.people(id)     ON DELETE CASCADE,

  started_at         timestamptz NOT NULL DEFAULT now(),
  current_touchpoint text        NOT NULL, -- RE+15, RE+30, RE+60, RE+90
  next_touchpoint_at timestamptz NOT NULL,

  -- iteration: suporta múltiplos ciclos de reengajamento (pessoa sumiu, voltou, sumiu de novo)
  iteration          integer     NOT NULL DEFAULT 1,

  touchpoints_sent   jsonb NOT NULL DEFAULT '[]'::jsonb,
  responses_received jsonb NOT NULL DEFAULT '[]'::jsonb,

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'cancelled', 'paused')),

  is_sensitive_case  boolean NOT NULL DEFAULT false, -- se true: não enviar automático, escalar
  pastoral_notes     text,
  stop_reason        text,                            -- returned, opted_out, escalated, manual
  completed_at       timestamptz,
  cancelled_reason   text,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Índices ───────────────────────────────────────────────────
-- Índice para cron processar pendentes eficientemente
CREATE INDEX IF NOT EXISTS rj_next_touchpoint_pending_idx
  ON public.reengagement_journey (next_touchpoint_at)
  WHERE status = 'pending';

-- Índice para buscar journeys por pessoa/igreja
CREATE INDEX IF NOT EXISTS rj_church_person_idx
  ON public.reengagement_journey (church_id, person_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.reengagement_journey ENABLE ROW LEVEL SECURITY;

-- Tenant: leitura e escrita da própria igreja
CREATE POLICY rj_tenant_all ON public.reengagement_journey
  FOR ALL
  USING    (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- Admin Ekthos: acesso cross-tenant
CREATE POLICY rj_admin_all ON public.reengagement_journey
  FOR ALL
  USING    (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- Service role: acesso total para cron e EFs
CREATE POLICY rj_service_all ON public.reengagement_journey
  FOR ALL
  USING    (current_setting('role', true) = 'service_role')
  WITH CHECK (current_setting('role', true) = 'service_role');

-- ── Grants ───────────────────────────────────────────────────
REVOKE ALL ON TABLE public.reengagement_journey FROM PUBLIC;
GRANT ALL ON TABLE public.reengagement_journey TO authenticated;
GRANT ALL ON TABLE public.reengagement_journey TO service_role;
