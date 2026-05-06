-- Migration: church_agent_config_add_custom_instructions
-- Adds custom_instructions (free-text prompt) and updated_by (audit trail)
-- to the existing church_agent_config table.
-- Also adds admin + service_role RLS policies so the Ekthos cockpit can
-- read/write any church's config without impersonation.
--
-- 100% additive — no existing columns altered, no data dropped.

-- ── ADD COLUMNS ───────────────────────────────────────────────────────────────

ALTER TABLE public.church_agent_config
  ADD COLUMN IF NOT EXISTS custom_instructions text,
  ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id);

-- ── RLS POLICIES ─────────────────────────────────────────────────────────────

-- Allow Ekthos admin (is_ekthos_admin = true in app_metadata) full access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'church_agent_config'
      AND policyname = 'church_agent_config_ekthos_admin_all'
  ) THEN
    CREATE POLICY church_agent_config_ekthos_admin_all
      ON public.church_agent_config
      FOR ALL
      TO authenticated
      USING (
        COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_ekthos_admin')::boolean), false) = true
      )
      WITH CHECK (
        COALESCE(((auth.jwt() -> 'app_metadata' ->> 'is_ekthos_admin')::boolean), false) = true
      );
  END IF;
END;
$$;

-- Allow service_role (Edge Functions via supabaseAdmin) unrestricted access
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'church_agent_config'
      AND policyname = 'church_agent_config_service_role'
  ) THEN
    CREATE POLICY church_agent_config_service_role
      ON public.church_agent_config
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END;
$$;
