-- supabase/migrations/20260508000001_admin_events_schema_extend.sql
-- Frente 4A: expande admin_events com colunas de auditoria estruturada.
-- Todas as novas colunas são NULLABLE para compat com INSERTs da Frente 3B.
-- D1 (BLINDAGEM): tabela já existe — ALTER TABLE, não CREATE.

-- ── 1. Novas colunas ──────────────────────────────────────────────────────────
ALTER TABLE public.admin_events
  ADD COLUMN IF NOT EXISTS actor_email              text,
  ADD COLUMN IF NOT EXISTS actor_roles              text[],
  ADD COLUMN IF NOT EXISTS resource                 text,
  ADD COLUMN IF NOT EXISTS resource_id              uuid,
  ADD COLUMN IF NOT EXISTS ip_address               inet,
  ADD COLUMN IF NOT EXISTS user_agent               text,
  ADD COLUMN IF NOT EXISTS request_id               text,
  ADD COLUMN IF NOT EXISTS status                   text,
  ADD COLUMN IF NOT EXISTS error_msg                text,
  ADD COLUMN IF NOT EXISTS impersonation_session_id uuid REFERENCES impersonate_sessions(id),
  ADD COLUMN IF NOT EXISTS impersonated_church_id   uuid REFERENCES churches(id),
  ADD COLUMN IF NOT EXISTS source                   text DEFAULT 'cockpit';

-- CHECK constraint para status (nullable para compat legado)
ALTER TABLE public.admin_events
  DROP CONSTRAINT IF EXISTS admin_events_status_check;
ALTER TABLE public.admin_events
  ADD CONSTRAINT admin_events_status_check
  CHECK (status IS NULL OR status IN ('success', 'failed', 'denied'));

-- ── 2. RLS: substituir service_role_all por políticas imutáveis ──────────────
-- Drop policies antigas
DROP POLICY IF EXISTS service_role_all_admin_events ON public.admin_events;
DROP POLICY IF EXISTS admin_ekthos_select_admin_events ON public.admin_events;

-- SELECT: ekthos_admin vê tudo
CREATE POLICY admin_events_ekthos_admin_select ON public.admin_events
  FOR SELECT TO authenticated
  USING (is_ekthos_admin());

-- SELECT: ekthos_support também vê (granularidade de campo fica para Frente 4B UI)
CREATE POLICY admin_events_ekthos_support_select ON public.admin_events
  FOR SELECT TO authenticated
  USING (
    has_ekthos_role('ekthos_admin') OR has_ekthos_role('ekthos_support')
  );

-- INSERT: apenas service_role (EFs usam service_role key que bypassa RLS,
-- mas esta policy documenta a intenção e bloqueia unauthenticated/anon)
CREATE POLICY admin_events_service_insert_only ON public.admin_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- SEM policy para UPDATE ou DELETE → tabela imutável para authenticated
-- Nota: service_role bypassa RLS por padrão no Supabase (sem FORCE RLS).
-- Imutabilidade real para service_role = OPS-DEBT futura (FORCE RLS + INSERT-only).
