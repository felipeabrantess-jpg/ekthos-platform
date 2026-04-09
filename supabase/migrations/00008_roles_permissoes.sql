-- ============================================================================
-- Migration 00008: Sistema de Roles e Permissões Pastorais
-- ----------------------------------------------------------------------------
-- 7 roles com hierarquia pastoral:
--   admin              → vê tudo, faz tudo (Pastor Carlos)
--   admin_departments  → gerencia departamentos e voluntários (Pastora Rita)
--   pastor_celulas     → gerencia todas as células (Pastor Marcos)
--   supervisor         → vê células da sua área (5–8 células)
--   cell_leader        → vê apenas a própria célula
--   secretary          → cadastra e edita membros
--   treasurer          → vê apenas financeiro (dízimos, ofertas)
-- ============================================================================

-- 1. Enum canônico de roles
-- ----------------------------------------------------------------------------
CREATE TYPE app_role AS ENUM (
  'admin',
  'admin_departments',
  'pastor_celulas',
  'supervisor',
  'cell_leader',
  'secretary',
  'treasurer'
);

-- 2. Tabela user_roles — um role por usuário por tenant
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_roles (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  church_id  UUID        NOT NULL REFERENCES churches(id)  ON DELETE CASCADE,
  role       app_role    NOT NULL DEFAULT 'cell_leader',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, church_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id  ON user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_church_id ON user_roles (church_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_lookup    ON user_roles (user_id, church_id);

COMMENT ON TABLE user_roles IS
  'Role pastoral de cada usuário por tenant. Exatamente 1 role por (usuário, igreja).';

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Usuário lê apenas o próprio role (sem chamar auth_user_role para evitar recursão)
CREATE POLICY "user_roles_own_select" ON user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Service role tem acesso total (Edge Functions, admin dashboard)
CREATE POLICY "user_roles_service_all" ON user_roles
  FOR ALL USING (auth.role() = 'service_role');

-- 3. Tabela supervisor_areas — células sob responsabilidade de um supervisor
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supervisor_areas (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supervisor_user_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id            UUID        NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  church_id           UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (supervisor_user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_supervisor_areas_user   ON supervisor_areas (supervisor_user_id);
CREATE INDEX IF NOT EXISTS idx_supervisor_areas_church ON supervisor_areas (church_id);

COMMENT ON TABLE supervisor_areas IS
  'Mapeamento supervisor → células sob sua área (5–8 células por supervisor).';

ALTER TABLE supervisor_areas ENABLE ROW LEVEL SECURITY;

-- Supervisor lê apenas suas áreas; admin/service via service_role
CREATE POLICY "supervisor_areas_own_select" ON supervisor_areas
  FOR SELECT USING (
    supervisor_user_id = auth.uid()
    AND church_id = auth_church_id()
  );

CREATE POLICY "supervisor_areas_service_all" ON supervisor_areas
  FOR ALL USING (auth.role() = 'service_role');

-- 4. Tabela cell_leader_assignments — célula que um líder gerencia
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_leader_assignments (
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  group_id   UUID        NOT NULL REFERENCES groups(id)    ON DELETE CASCADE,
  church_id  UUID        NOT NULL REFERENCES churches(id)  ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_cell_leader_user   ON cell_leader_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_cell_leader_church ON cell_leader_assignments (church_id);

COMMENT ON TABLE cell_leader_assignments IS
  'Mapeamento líder de célula → célula que ele lidera. Um líder pode liderar 1 célula.';

ALTER TABLE cell_leader_assignments ENABLE ROW LEVEL SECURITY;

-- Líder lê apenas sua própria atribuição
CREATE POLICY "cell_leader_assignments_own_select" ON cell_leader_assignments
  FOR SELECT USING (
    user_id = auth.uid()
    AND church_id = auth_church_id()
  );

CREATE POLICY "cell_leader_assignments_service_all" ON cell_leader_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- 5. Funções helper de permissão
-- ----------------------------------------------------------------------------

-- Retorna o role do usuário atual no tenant atual.
-- SECURITY DEFINER: bypasseia RLS de user_roles para leitura interna.
-- STABLE: resultado cacheado por transação (performance).
CREATE OR REPLACE FUNCTION auth_user_role()
RETURNS app_role LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role
  FROM user_roles
  WHERE user_id = auth.uid()
    AND church_id = auth_church_id()
  LIMIT 1
$$;

-- Retorna true se o usuário pode acessar dados financeiros.
CREATE OR REPLACE FUNCTION auth_can_financial()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    auth_user_role() IN ('admin', 'treasurer'),
    false
  )
$$;

-- Retorna true se o usuário pode ver todas as pessoas do tenant.
CREATE OR REPLACE FUNCTION auth_can_all_people()
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    auth_user_role() IN (
      'admin', 'admin_departments', 'pastor_celulas', 'secretary'
    ),
    false
  )
$$;

-- 6. RLS RESTRITIVA em tabelas financeiras
-- ----------------------------------------------------------------------------
-- Política RESTRICTIVE é AND-ada com as permissivas existentes.
-- Resultado: mesmo que tenant_select passe, o acesso financeiro
-- só é concedido se auth_can_financial() = true OU service_role.

CREATE POLICY "donations_financial_role_restrict" ON donations
  AS RESTRICTIVE FOR ALL
  USING (auth_can_financial() OR auth.role() = 'service_role');

CREATE POLICY "financial_campaigns_role_restrict" ON financial_campaigns
  AS RESTRICTIVE FOR ALL
  USING (auth_can_financial() OR auth.role() = 'service_role');

-- 7. Seed: promove todos os usuários existentes para admin
-- ----------------------------------------------------------------------------
-- Garante que quem já usava o sistema (owner do setup) não perde acesso.
-- Usa CROSS JOIN entre auth.users e churches porque profiles pode estar vazio
-- em instalações novas. ON CONFLICT garante idempotência.
INSERT INTO user_roles (user_id, church_id, role)
SELECT
  u.id,
  c.id,
  'admin'::app_role
FROM auth.users u
CROSS JOIN churches c
ON CONFLICT (user_id, church_id) DO NOTHING;
