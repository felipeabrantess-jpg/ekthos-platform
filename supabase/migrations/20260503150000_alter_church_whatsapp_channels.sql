-- Migration: alter_church_whatsapp_channels
-- Adiciona colunas operacionais para PASSO 7.
-- NÃO remove nem renomeia colunas existentes (ALTER aditivo).
-- Tabela já tem: channel_type, zapi_token, meta_access_token, session_status, etc.
-- Adiciona: provider, instance_id, display_name, status, error_message,
--           last_provisioned_at, last_health_check, metadata, updated_at, updated_by

-- 1. Adicionar colunas novas (todas IF NOT EXISTS)
ALTER TABLE public.church_whatsapp_channels
  ADD COLUMN IF NOT EXISTS provider               TEXT,
  ADD COLUMN IF NOT EXISTS instance_id            TEXT,
  ADD COLUMN IF NOT EXISTS display_name           TEXT,
  ADD COLUMN IF NOT EXISTS status                 TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message          TEXT,
  ADD COLUMN IF NOT EXISTS last_provisioned_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata               JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill provider a partir de channel_type
UPDATE public.church_whatsapp_channels
SET provider = channel_type
WHERE provider IS NULL;

-- 3. Backfill instance_id a partir de colunas existentes (zapi primeiro, meta fallback)
UPDATE public.church_whatsapp_channels
SET instance_id = COALESCE(zapi_instance_id, meta_phone_number_id)
WHERE instance_id IS NULL;

-- 4. Backfill display_name a partir de provider_label
UPDATE public.church_whatsapp_channels
SET display_name = provider_label
WHERE display_name IS NULL AND provider_label IS NOT NULL;

-- 5. Garantir que status nunca seja NULL (backfill precaução)
UPDATE public.church_whatsapp_channels
SET status = 'pending'
WHERE status IS NULL;

-- 6. Adicionar CHECK em status (só após backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_channel_status'
      AND conrelid = 'public.church_whatsapp_channels'::regclass
  ) THEN
    ALTER TABLE public.church_whatsapp_channels
      ADD CONSTRAINT chk_channel_status
      CHECK (status IN ('pending','provisioning','connected','error'));
  END IF;
END$$;

-- 7. UNIQUE (church_id, provider) — seguro após auditoria (3 rows, todos diferentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_church_provider'
      AND conrelid = 'public.church_whatsapp_channels'::regclass
  ) THEN
    ALTER TABLE public.church_whatsapp_channels
      ADD CONSTRAINT uq_church_provider UNIQUE (church_id, provider);
  END IF;
END$$;

-- 8. RLS
ALTER TABLE public.church_whatsapp_channels ENABLE ROW LEVEL SECURITY;

-- 8a. Policy admin full access (Decisão 57: auth.uid() + query auth.users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_whatsapp_channels'
      AND policyname = 'ekthos_admin_full_access'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY ekthos_admin_full_access
        ON public.church_whatsapp_channels
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

-- 8b. Policy pastor SELECT only da própria igreja (preparada para PASSO 7.5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_whatsapp_channels'
      AND policyname = 'pastor_select_own_church'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY pastor_select_own_church
        ON public.church_whatsapp_channels
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

-- 9. Trigger updated_at (padrão do projeto)
CREATE OR REPLACE FUNCTION public.set_updated_at_church_whatsapp_channels()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_church_whatsapp_channels
  ON public.church_whatsapp_channels;

CREATE TRIGGER trg_updated_at_church_whatsapp_channels
  BEFORE UPDATE ON public.church_whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_church_whatsapp_channels();
