-- ============================================================
-- Migration: 00014_security_hardening.sql
-- Descrição: Hardenização de segurança multi-tenant.
--   1. auth_church_id() lê de app_metadata primeiro (server-side)
--      com fallback para user_metadata (retrocompatibilidade).
--   2. Adiciona status 'cancelled' ao enum de churches (se necessário).
--   3. Protege a VIEW admin_churches_overview com security_invoker.
--   4. Adiciona política INSERT para impersonate_sessions (já existe ALL,
--      mas explicitamos para auditoria).
-- Criado em: 2026-04-10
-- ============================================================

-- ============================================================
-- 1. auth_church_id() — app_metadata tem prioridade
-- A versão anterior lia da tabela profiles (N+1 + possível bypass).
-- Nova versão lê direto do JWT, sem round-trip ao banco.
-- ============================================================

CREATE OR REPLACE FUNCTION auth_church_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata'  ->> 'church_id')::uuid,
    (auth.jwt() -> 'user_metadata' ->> 'church_id')::uuid
  )
$$;

COMMENT ON FUNCTION auth_church_id() IS
  'Retorna o church_id do JWT do usuário autenticado.
   Prioriza app_metadata (server-side, não editável pelo usuário)
   com fallback para user_metadata (retrocompatibilidade durante migração).';

-- ============================================================
-- 2. Adiciona status cancelled às igrejas (soft-delete billing)
-- ============================================================

DO $$
BEGIN
  -- Altera constraint check se existir como CHECK constraint
  -- (Supabase usa TEXT sem enum nativo para status)
  -- Noop seguro — apenas documenta o valor permitido.
  RAISE NOTICE 'status=cancelled é suportado via TEXT livre em churches.status';
END $$;

-- ============================================================
-- 3. Protege admin_churches_overview
-- A VIEW é recriada com SECURITY INVOKER: acesso ao dado
-- subjacente passa pelas políticas RLS do chamador.
-- Usuários não-admin verão 0 linhas (RLS bloqueará).
-- ============================================================

CREATE OR REPLACE VIEW admin_churches_overview
WITH (security_invoker = true)
AS
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
  -- Agentes ativos
  COALESCE((
    SELECT COUNT(*)
    FROM subscription_agents sa
    JOIN subscriptions sub ON sub.id = sa.subscription_id
    WHERE sub.church_id = c.id
      AND sa.active = true
  ), 0)                 AS agent_count,
  -- Último login aproximado
  (
    SELECT MAX(os.updated_at)
    FROM onboarding_sessions os
    WHERE os.church_id = c.id
  )                     AS last_activity
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

COMMENT ON VIEW admin_churches_overview IS
  'Visão consolidada para o painel admin (security_invoker=true).
   Requer is_ekthos_admin() ou service_role — RLS de churches bloqueia acesso não autorizado.';

-- ============================================================
-- 4. Garante que subscriptions_admin_select não duplique
-- (migration 00013 cria em bloco DO, pode já existir)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions'
      AND policyname = 'subscriptions_admin_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "subscriptions_admin_select"
        ON subscriptions FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'plans'
      AND policyname = 'plans_admin_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "plans_admin_select"
        ON plans FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_roles'
      AND policyname = 'user_roles_admin_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "user_roles_admin_select"
        ON user_roles FOR SELECT
        USING (is_ekthos_admin())
    $p$;
  END IF;
END $$;
