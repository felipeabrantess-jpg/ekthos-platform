-- ============================================================
-- Migration: 00002_rls_policies.sql
-- Descrição: Políticas RLS detalhadas para todas as tabelas do schema.
--            Garante isolamento total de dados entre tenants.
--            DEPENDE: 00001_initial_schema.sql
-- Criado em: 2026-04-07
-- ============================================================

-- ============================================================
-- NOTA IMPORTANTE:
-- As políticas RLS são a última linha de defesa no banco de dados.
-- Mesmo que a aplicação tenha um bug e não filtre por church_id,
-- o banco de dados NUNCA retornará dados de outro tenant.
-- Esta é a garantia de segurança fundamental do multi-tenancy.
-- ============================================================

-- ============================================================
-- RLS: TABELA churches
-- Acesso restrito: usuários veem apenas a própria church.
-- Platform admins veem todas.
-- ============================================================

ALTER TABLE churches ENABLE ROW LEVEL SECURITY;

-- Usuário autenticado vê apenas a sua igreja
CREATE POLICY "churches_select_own"
  ON churches FOR SELECT
  USING (
    id = get_current_church_id()
    OR is_platform_admin()
  );

-- Apenas platform admins criam novas igrejas
CREATE POLICY "churches_insert_platform_admin_only"
  ON churches FOR INSERT
  WITH CHECK (is_platform_admin());

-- Apenas platform admins e church_admin atualizam dados da igreja
CREATE POLICY "churches_update_admin"
  ON churches FOR UPDATE
  USING (
    (id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    (id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- Somente platform admins podem deletar igrejas
CREATE POLICY "churches_delete_platform_admin_only"
  ON churches FOR DELETE
  USING (is_platform_admin());

-- ============================================================
-- RLS: TABELA church_settings
-- ============================================================

ALTER TABLE church_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "church_settings_select_own_tenant"
  ON church_settings FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- Apenas church_admin pode criar configurações
CREATE POLICY "church_settings_insert_admin"
  ON church_settings FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- Apenas church_admin pode atualizar configurações
CREATE POLICY "church_settings_update_admin"
  ON church_settings FOR UPDATE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA profiles
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Usuário vê apenas profiles do seu tenant
CREATE POLICY "profiles_select_own_tenant"
  ON profiles FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- Usuário pode ver e atualizar apenas o próprio profile
CREATE POLICY "profiles_select_own_user"
  ON profiles FOR SELECT
  USING (user_id = auth.uid());

-- Inserção apenas via service role (onboarding) ou platform admin
CREATE POLICY "profiles_insert_admin"
  ON profiles FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- Usuário pode atualizar próprio profile. Admin pode atualizar qualquer profile do tenant.
CREATE POLICY "profiles_update_own_or_admin"
  ON profiles FOR UPDATE
  USING (
    user_id = auth.uid()
    OR (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    -- Não pode mudar o church_id (campo imutável após criação)
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA user_roles
-- ============================================================

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Apenas admins veem todos os roles do tenant
CREATE POLICY "user_roles_select_admin"
  ON user_roles FOR SELECT
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR user_id = auth.uid()
    OR is_platform_admin()
  );

-- Apenas church_admin pode conceder papéis
CREATE POLICY "user_roles_insert_admin"
  ON user_roles FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- Apenas church_admin pode remover papéis
CREATE POLICY "user_roles_delete_admin"
  ON user_roles FOR DELETE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA people
-- Dados sensíveis dos membros. Acesso restrito por tenant.
-- ============================================================

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário do tenant vê people (exceto soft-deletados para staff)
CREATE POLICY "people_select_own_tenant"
  ON people FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- INSERT: qualquer usuário autenticado do tenant pode adicionar pessoas
CREATE POLICY "people_insert_own_tenant"
  ON people FOR INSERT
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- UPDATE: qualquer usuário do tenant pode atualizar (admins e managers podem mais)
CREATE POLICY "people_update_own_tenant"
  ON people FOR UPDATE
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  )
  WITH CHECK (
    -- church_id é imutável
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- DELETE (soft delete): apenas admins e managers podem marcar deleted_at
CREATE POLICY "people_delete_admin_or_manager"
  ON people FOR DELETE
  USING (
    (church_id = get_current_church_id()
     AND (has_church_role('church_admin') OR has_church_role('church_manager')))
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA interactions
-- Log de interações. Leitura para admins e managers.
-- Escrita principalmente pelo sistema (service role).
-- ============================================================

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

-- SELECT: admins e managers veem todas as interações do tenant
CREATE POLICY "interactions_select_managers"
  ON interactions FOR SELECT
  USING (
    (church_id = get_current_church_id()
     AND (has_church_role('church_admin') OR has_church_role('church_manager')))
    OR is_platform_admin()
  );

-- INSERT: qualquer usuário do tenant pode inserir (sistema usa service role)
CREATE POLICY "interactions_insert_own_tenant"
  ON interactions FOR INSERT
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- UPDATE: apenas admins (para fechar tickets, marcar resolvido)
CREATE POLICY "interactions_update_admin"
  ON interactions FOR UPDATE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- Sem DELETE em interactions (histórico permanente)

-- ============================================================
-- RLS: TABELA pipeline_stages
-- ============================================================

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_select_own_tenant"
  ON pipeline_stages FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- Apenas admins configuram estágios
CREATE POLICY "pipeline_stages_write_admin"
  ON pipeline_stages FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

CREATE POLICY "pipeline_stages_update_admin"
  ON pipeline_stages FOR UPDATE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

CREATE POLICY "pipeline_stages_delete_admin"
  ON pipeline_stages FOR DELETE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA person_pipeline
-- ============================================================

ALTER TABLE person_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "person_pipeline_select_own_tenant"
  ON person_pipeline FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

CREATE POLICY "person_pipeline_insert_own_tenant"
  ON person_pipeline FOR INSERT
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

CREATE POLICY "person_pipeline_update_own_tenant"
  ON person_pipeline FOR UPDATE
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  )
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA donations
-- Dados financeiros. Acesso restrito a admins e managers.
-- ============================================================

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

-- SELECT: apenas admins e managers veem doações
CREATE POLICY "donations_select_admin_or_manager"
  ON donations FOR SELECT
  USING (
    (church_id = get_current_church_id()
     AND (has_church_role('church_admin') OR has_church_role('church_manager')))
    OR is_platform_admin()
  );

-- INSERT: sistema (service role) e admins
CREATE POLICY "donations_insert_admin"
  ON donations FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id()
     AND (has_church_role('church_admin') OR has_church_role('church_manager')))
    OR is_platform_admin()
  );

-- UPDATE: apenas admins (ex: confirmar, marcar como estornado)
CREATE POLICY "donations_update_admin"
  ON donations FOR UPDATE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- Sem DELETE em donations (histórico financeiro permanente)

-- ============================================================
-- RLS: TABELA integrations
-- Configurações de integração. Altamente sensível.
-- ============================================================

ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

-- SELECT: admins veem integrações (sem dados do Vault — apenas metadados)
CREATE POLICY "integrations_select_admin"
  ON integrations FOR SELECT
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- INSERT e UPDATE: apenas admins da igreja e platform admins
CREATE POLICY "integrations_insert_admin"
  ON integrations FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

CREATE POLICY "integrations_update_admin"
  ON integrations FOR UPDATE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  )
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

CREATE POLICY "integrations_delete_admin"
  ON integrations FOR DELETE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA campaigns
-- ============================================================

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own_tenant"
  ON campaigns FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

CREATE POLICY "campaigns_insert_manager"
  ON campaigns FOR INSERT
  WITH CHECK (
    (church_id = get_current_church_id()
     AND (has_church_role('church_admin') OR has_church_role('church_manager')))
    OR is_platform_admin()
  );

CREATE POLICY "campaigns_update_manager"
  ON campaigns FOR UPDATE
  USING (
    (church_id = get_current_church_id()
     AND (has_church_role('church_admin') OR has_church_role('church_manager')))
    OR is_platform_admin()
  )
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

CREATE POLICY "campaigns_delete_admin"
  ON campaigns FOR DELETE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- ============================================================
-- RLS: TABELA audit_logs
-- Apenas leitura para admins. Escrita apenas pelo sistema.
-- Sem update, sem delete — log imutável.
-- ============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins veem os logs de auditoria do próprio tenant
CREATE POLICY "audit_logs_select_admin"
  ON audit_logs FOR SELECT
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );

-- Qualquer usuário do tenant pode inserir (sistema usa service role principalmente)
CREATE POLICY "audit_logs_insert_own_tenant"
  ON audit_logs FOR INSERT
  WITH CHECK (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- EXPLICITAMENTE proibir UPDATE e DELETE em audit_logs (imutabilidade)
-- Nota: sem políticas de UPDATE/DELETE = ninguém pode atualizar ou deletar via RLS
-- A service role ainda pode (é um bypass intencional para administração emergencial)

-- ============================================================
-- RLS: TABELA platform_admins
-- Apenas platform admins veem e gerenciam esta tabela.
-- ============================================================

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_access"
  ON platform_admins FOR ALL
  USING (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- ============================================================
-- VERIFICAÇÃO FINAL: Confirmar RLS ativo em todas as tabelas
-- ============================================================
-- Execute após aplicar esta migration para confirmar:
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
--
-- Todas as tabelas devem retornar rowsecurity = true
-- ============================================================

-- ============================================================
-- ROLLBACK (remover políticas — use apenas em desenvolvimento)
-- ============================================================
-- DROP POLICY IF EXISTS "platform_admins_access" ON platform_admins;
-- DROP POLICY IF EXISTS "audit_logs_insert_own_tenant" ON audit_logs;
-- DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
-- DROP POLICY IF EXISTS "campaigns_delete_admin" ON campaigns;
-- DROP POLICY IF EXISTS "campaigns_update_manager" ON campaigns;
-- DROP POLICY IF EXISTS "campaigns_insert_manager" ON campaigns;
-- DROP POLICY IF EXISTS "campaigns_select_own_tenant" ON campaigns;
-- DROP POLICY IF EXISTS "integrations_delete_admin" ON integrations;
-- DROP POLICY IF EXISTS "integrations_update_admin" ON integrations;
-- DROP POLICY IF EXISTS "integrations_insert_admin" ON integrations;
-- DROP POLICY IF EXISTS "integrations_select_admin" ON integrations;
-- DROP POLICY IF EXISTS "donations_update_admin" ON donations;
-- DROP POLICY IF EXISTS "donations_insert_admin" ON donations;
-- DROP POLICY IF EXISTS "donations_select_admin_or_manager" ON donations;
-- DROP POLICY IF EXISTS "person_pipeline_update_own_tenant" ON person_pipeline;
-- DROP POLICY IF EXISTS "person_pipeline_insert_own_tenant" ON person_pipeline;
-- DROP POLICY IF EXISTS "person_pipeline_select_own_tenant" ON person_pipeline;
-- DROP POLICY IF EXISTS "pipeline_stages_delete_admin" ON pipeline_stages;
-- DROP POLICY IF EXISTS "pipeline_stages_update_admin" ON pipeline_stages;
-- DROP POLICY IF EXISTS "pipeline_stages_write_admin" ON pipeline_stages;
-- DROP POLICY IF EXISTS "pipeline_stages_select_own_tenant" ON pipeline_stages;
-- DROP POLICY IF EXISTS "interactions_update_admin" ON interactions;
-- DROP POLICY IF EXISTS "interactions_insert_own_tenant" ON interactions;
-- DROP POLICY IF EXISTS "interactions_select_managers" ON interactions;
-- DROP POLICY IF EXISTS "people_delete_admin_or_manager" ON people;
-- DROP POLICY IF EXISTS "people_update_own_tenant" ON people;
-- DROP POLICY IF EXISTS "people_insert_own_tenant" ON people;
-- DROP POLICY IF EXISTS "people_select_own_tenant" ON people;
-- DROP POLICY IF EXISTS "user_roles_delete_admin" ON user_roles;
-- DROP POLICY IF EXISTS "user_roles_insert_admin" ON user_roles;
-- DROP POLICY IF EXISTS "user_roles_select_admin" ON user_roles;
-- DROP POLICY IF EXISTS "profiles_update_own_or_admin" ON profiles;
-- DROP POLICY IF EXISTS "profiles_insert_admin" ON profiles;
-- DROP POLICY IF EXISTS "profiles_select_own_user" ON profiles;
-- DROP POLICY IF EXISTS "profiles_select_own_tenant" ON profiles;
-- DROP POLICY IF EXISTS "church_settings_update_admin" ON church_settings;
-- DROP POLICY IF EXISTS "church_settings_insert_admin" ON church_settings;
-- DROP POLICY IF EXISTS "church_settings_select_own_tenant" ON church_settings;
-- DROP POLICY IF EXISTS "churches_delete_platform_admin_only" ON churches;
-- DROP POLICY IF EXISTS "churches_update_admin" ON churches;
-- DROP POLICY IF EXISTS "churches_insert_platform_admin_only" ON churches;
-- DROP POLICY IF EXISTS "churches_select_own" ON churches;
