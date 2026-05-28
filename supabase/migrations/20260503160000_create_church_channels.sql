-- Migration: create_church_channels
-- Tabela genérica de canais de comunicação por igreja.
-- Suporta múltiplos providers: Z-API, Meta Cloud, Instagram, Telegram, WhatsApp Cloud.
-- church_whatsapp_channels permanece INTACTA (8 consumers existentes).
-- Esta tabela é a fonte de verdade do cockpit admin (PASSO 7+).
--
-- agent_slugs TEXT[]: quais agentes este canal atende.
-- Permite comercialização futura de agentes sem alterar schema.
-- GIN index permite busca eficiente por agent_slug específico.
--
-- UNIQUE (church_id, provider, provider_instance_id):
-- permite múltiplos chips do mesmo provider por igreja
-- (ex: 2 instâncias Z-API distintas, 2 phone numbers Meta).

CREATE TABLE IF NOT EXISTS public.church_channels (
  id                    UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id             UUID          NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  provider              TEXT          NOT NULL,
  provider_instance_id  TEXT,
  phone_number          TEXT,
  display_name          TEXT,
  status                TEXT          NOT NULL DEFAULT 'pending',
  agent_slugs           TEXT[]        NOT NULL DEFAULT '{}',
  error_message         TEXT,
  last_provisioned_at   TIMESTAMPTZ,
  last_health_check     TIMESTAMPTZ,
  metadata              JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_by            UUID          REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Permite múltiplos canais do mesmo provider por igreja (instâncias diferentes)
  CONSTRAINT uq_church_channel_provider_instance
    UNIQUE (church_id, provider, provider_instance_id),

  -- Providers iniciais + futuros preparados
  CONSTRAINT chk_channel_provider
    CHECK (provider IN ('zapi','meta_cloud','instagram','telegram','whatsapp_cloud')),

  -- Status operacional
  CONSTRAINT chk_channel_status
    CHECK (status IN ('pending','provisioning','connected','error','disabled'))
);

-- Index para queries por church_id (hot path: list de canais no cockpit)
CREATE INDEX IF NOT EXISTS idx_church_channels_church_id
  ON public.church_channels (church_id);

-- Index para queries por status (health checks, polling, filtros)
CREATE INDEX IF NOT EXISTS idx_church_channels_status
  ON public.church_channels (status);

-- GIN index para busca por agent_slug em arrays
-- (ex: WHERE 'agent-reengajamento' = ANY(agent_slugs))
CREATE INDEX IF NOT EXISTS idx_church_channels_agent_slugs
  ON public.church_channels USING GIN (agent_slugs);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_church_channels()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_church_channels ON public.church_channels;
CREATE TRIGGER trg_updated_at_church_channels
  BEFORE UPDATE ON public.church_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_church_channels();

-- RLS
ALTER TABLE public.church_channels ENABLE ROW LEVEL SECURITY;

-- Admin Ekthos full access (Decisão 57: auth.uid() + query auth.users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_channels' AND policyname = 'ekthos_admin_full_access'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY ekthos_admin_full_access
        ON public.church_channels
        FOR ALL
        TO authenticated
        USING (
          (SELECT (raw_app_meta_data ->> 'is_ekthos_admin')::boolean
           FROM auth.users WHERE id = auth.uid()) = true
        )
        WITH CHECK (
          (SELECT (raw_app_meta_data ->> 'is_ekthos_admin')::boolean
           FROM auth.users WHERE id = auth.uid()) = true
        )
    $policy$;
  END IF;
END$$;

-- Pastor SELECT only da própria igreja (preparada para PASSO 7.5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_channels' AND policyname = 'pastor_select_own_church'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY pastor_select_own_church
        ON public.church_channels
        FOR SELECT
        TO authenticated
        USING (
          church_id IN (
            SELECT church_id FROM public.profiles WHERE id = auth.uid()
          )
        )
    $policy$;
  END IF;
END$$;

-- Grants
GRANT SELECT, INSERT, UPDATE ON public.church_channels TO authenticated;
GRANT ALL ON public.church_channels TO service_role;
