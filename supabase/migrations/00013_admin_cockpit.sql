-- ============================================================
-- Migration: 00013_admin_cockpit.sql
-- Descrição: Painel de administração global da Ekthos.
--            Cria health_scores, impersonate_sessions.
--            Adiciona políticas de leitura global para is_ekthos_admin.
-- Criado em: 2026-04-10
-- ============================================================

-- ============================================================
-- FUNÇÃO HELPER: verifica se o usuário é admin da Ekthos
-- ============================================================

CREATE OR REPLACE FUNCTION is_ekthos_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'is_ekthos_admin')::boolean,
      (auth.jwt() -> 'app_metadata'  ->> 'is_ekthos_admin')::boolean,
      false
    )
$$;

-- ============================================================
-- TABELA: health_scores
-- Score de saúde pastoral calculado periodicamente por church.
-- ============================================================

CREATE TABLE IF NOT EXISTS health_scores (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  score           INTEGER     NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  components      JSONB,
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id, calculated_at)
);

CREATE INDEX IF NOT EXISTS idx_health_scores_church_id ON health_scores (church_id);
CREATE INDEX IF NOT EXISTS idx_health_scores_calculated_at ON health_scores (calculated_at DESC);

COMMENT ON TABLE health_scores IS 'Score de saúde pastoral (0-100) calculado periodicamente por church_id.';
COMMENT ON COLUMN health_scores.components IS 'JSON com breakdown: consolidacao, celulas, financeiro, engajamento, etc.';

ALTER TABLE health_scores ENABLE ROW LEVEL SECURITY;

-- Tenant vê o próprio score
CREATE POLICY "health_scores_tenant_select"
  ON health_scores FOR SELECT
  USING (church_id = auth_church_id());

-- Admin vê todos
CREATE POLICY "health_scores_admin_select"
  ON health_scores FOR SELECT
  USING (is_ekthos_admin());

-- Service role: acesso total
CREATE POLICY "health_scores_service_all"
  ON health_scores FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- TABELA: impersonate_sessions
-- Registro de acessos de impersonação por admin.
-- ============================================================

CREATE TABLE IF NOT EXISTS impersonate_sessions (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID        NOT NULL,
  church_id     UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at      TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_impersonate_sessions_admin ON impersonate_sessions (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_impersonate_sessions_church ON impersonate_sessions (church_id);

COMMENT ON TABLE impersonate_sessions IS 'Auditoria de sessões de impersonação do admin da Ekthos.';

ALTER TABLE impersonate_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impersonate_sessions_admin_all"
  ON impersonate_sessions FOR ALL
  USING (is_ekthos_admin());

CREATE POLICY "impersonate_sessions_service_all"
  ON impersonate_sessions FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================
-- POLÍTICAS ADMIN GLOBAL: churches
-- Admin da Ekthos pode ler dados de TODAS as igrejas.
-- ============================================================

CREATE POLICY "churches_admin_select"
  ON churches FOR SELECT
  USING (is_ekthos_admin());

-- ============================================================
-- POLÍTICAS ADMIN GLOBAL: subscriptions / billing
-- ============================================================

DO $$
BEGIN
  -- subscriptions
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'subscriptions') THEN
    EXECUTE $p$
      CREATE POLICY "subscriptions_admin_select"
        ON subscriptions FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;

  -- plans
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'plans') THEN
    EXECUTE $p$
      CREATE POLICY "plans_admin_select"
        ON plans FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;

  -- church_agents (se existir)
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'church_agents') THEN
    EXECUTE $p$
      CREATE POLICY "church_agents_admin_select"
        ON church_agents FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;

  -- user_roles
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'user_roles') THEN
    EXECUTE $p$
      CREATE POLICY "user_roles_admin_select"
        ON user_roles FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;
END $$;

-- ============================================================
-- VIEW: admin_churches_overview
-- Visão consolidada para o cockpit — evita N+1 no frontend.
-- ============================================================

CREATE OR REPLACE VIEW admin_churches_overview AS
SELECT
  c.id,
  c.name,
  c.logo_url,
  c.city,
  c.state,
  c.status,
  c.created_at,
  -- Plano atual
  s.plan_slug,
  s.status              AS subscription_status,
  s.current_period_end,
  -- Saúde
  hs.score              AS health_score,
  hs.calculated_at      AS health_calculated_at,
  -- Usuários
  (SELECT COUNT(*) FROM user_roles ur WHERE ur.church_id = c.id) AS user_count,
  -- Agentes
  0                     AS agent_count,
  -- Último login (aproximado via onboarding_sessions)
  (SELECT MAX(os.updated_at) FROM onboarding_sessions os WHERE os.church_id = c.id) AS last_activity
FROM churches c
LEFT JOIN LATERAL (
  SELECT plan_slug, status, current_period_end
  FROM subscriptions
  WHERE church_id = c.id
  ORDER BY created_at DESC
  LIMIT 1
) s ON true
LEFT JOIN LATERAL (
  SELECT score, calculated_at
  FROM health_scores
  WHERE church_id = c.id
  ORDER BY calculated_at DESC
  LIMIT 1
) hs ON true;

COMMENT ON VIEW admin_churches_overview IS 'Visão consolidada para o painel admin. Requer is_ekthos_admin ou service_role.';
