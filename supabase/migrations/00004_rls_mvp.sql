-- ============================================================
-- Migration: 00004_rls_mvp.sql
-- Descrição: Políticas RLS para todas as tabelas do MVP
-- Princípio: usuário só vê dados do seu church_id
-- ============================================================

-- Helper function: retorna o church_id do usuário autenticado
CREATE OR REPLACE FUNCTION auth_church_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT church_id
  FROM profiles  -- tabela de perfis (criada separadamente para auth)
  WHERE id = auth.uid()
$$;

-- ============================================================
-- RLS: churches
-- ============================================================
ALTER TABLE churches ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas a própria igreja
CREATE POLICY "churches_tenant_select" ON churches
  FOR SELECT USING (id = auth_church_id() AND deleted_at IS NULL);

-- Apenas sistema/service_role pode inserir
CREATE POLICY "churches_service_insert" ON churches
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Apenas service_role pode atualizar
CREATE POLICY "churches_service_update" ON churches
  FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: church_settings
-- ============================================================
ALTER TABLE church_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "church_settings_tenant_select" ON church_settings
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "church_settings_service_all" ON church_settings
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: integrations
-- Credenciais só visíveis para service_role (Edge Functions)
-- ============================================================
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integrations_tenant_select" ON integrations
  FOR SELECT USING (church_id = auth_church_id() AND is_active = true);

CREATE POLICY "integrations_service_all" ON integrations
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: people
-- ============================================================
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "people_tenant_select" ON people
  FOR SELECT USING (church_id = auth_church_id() AND deleted_at IS NULL);

CREATE POLICY "people_tenant_insert" ON people
  FOR INSERT WITH CHECK (church_id = auth_church_id());

CREATE POLICY "people_tenant_update" ON people
  FOR UPDATE USING (church_id = auth_church_id());

-- Service role tem acesso total (para agentes via Edge Function)
CREATE POLICY "people_service_all" ON people
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: interactions
-- ============================================================
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions_tenant_select" ON interactions
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "interactions_service_all" ON interactions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: pipeline_stages
-- ============================================================
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_tenant_select" ON pipeline_stages
  FOR SELECT USING (church_id = auth_church_id() AND is_active = true);

CREATE POLICY "pipeline_stages_service_all" ON pipeline_stages
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: person_pipeline
-- ============================================================
ALTER TABLE person_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_pipeline_tenant_select" ON person_pipeline
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "person_pipeline_service_all" ON person_pipeline
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: onboarding_sessions
-- ============================================================
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_sessions_service_all" ON onboarding_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: audit_logs
-- Imutável: INSERT permitido para service_role, SELECT para tenant ver os próprios
-- ============================================================
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_select" ON audit_logs
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "audit_logs_service_insert" ON audit_logs
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Nunca permitir DELETE ou UPDATE em audit_logs
-- (sem policy de DELETE = ninguém pode deletar, nem service_role via RLS)
