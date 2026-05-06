-- ============================================================
-- Sprint 3A.1 — agent_grants: grants de agente via cockpit admin
-- Separado de subscription_agents (que exige subscription_id FK).
-- Convive em paralelo. church_id direto.
-- ============================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS public.agent_grants (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id                 uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  agent_slug                varchar(100) NOT NULL REFERENCES public.agents_catalog(slug) ON DELETE CASCADE,
  grant_type                varchar(50)  NOT NULL,
  granted_by                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  starts_at                 timestamptz NOT NULL DEFAULT now(),
  ends_at                   timestamptz,
  active                    boolean     NOT NULL DEFAULT true,
  notes                     text,
  stripe_payment_intent_id  varchar(200),
  revoked_at                timestamptz,
  revoked_by                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_ag_grant_type CHECK (grant_type IN ('trial', 'courtesy', 'paid')),
  CONSTRAINT chk_ag_trial_ends_at CHECK (grant_type <> 'trial' OR ends_at IS NOT NULL),
  CONSTRAINT chk_ag_ends_after_starts CHECK (ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT chk_ag_revoked_consistent CHECK (revoked_at IS NULL OR active = false),
  UNIQUE (church_id, agent_slug)
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_agent_grants_church_active
  ON public.agent_grants (church_id, active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_agent_grants_ends_at
  ON public.agent_grants (ends_at)
  WHERE active = true AND ends_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_grants_agent_slug
  ON public.agent_grants (agent_slug);

-- 3. Trigger updated_at (reutiliza função existente set_updated_at)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_agent_grants_updated_at'
  ) THEN
    CREATE TRIGGER trg_agent_grants_updated_at
      BEFORE UPDATE ON public.agent_grants
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. RLS
ALTER TABLE public.agent_grants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'agent_grants_admin_all' AND tablename = 'agent_grants'
  ) THEN
    CREATE POLICY agent_grants_admin_all ON public.agent_grants
      FOR ALL
      TO authenticated
      USING (is_ekthos_admin())
      WITH CHECK (is_ekthos_admin());
  END IF;
END $$;

-- NOTE: Sem policy de SELECT para a própria igreja (church_id = auth_church_id()).
-- Acesso de leitura é intencional somente via:
--   1. supabaseAdmin (service_role) nas Edge Functions (admin-church-detail, admin-agent-grant)
--   2. RPCs SECURITY DEFINER (admin_grant_agent, admin_list_grantable_agents)
-- O frontend da igreja (pastor) não lê agent_grants diretamente.
-- Adicionar policy church_read somente se uso direto via client Supabase for necessário.
