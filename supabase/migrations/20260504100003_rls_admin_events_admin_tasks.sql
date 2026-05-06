-- Migration: rls_admin_events_admin_tasks
-- Achado C3 — auditoria de segurança 03-04/05/2026
--
-- Problema: admin_events e admin_tasks já tinham RLS habilitado (rowsecurity = true)
--   mas ZERO policies criadas.
--   No PostgreSQL, RLS ON sem nenhuma policy bloqueia 100% dos acessos
--   para roles não-superuser — inclusive admins autenticados.
--   Resultado: todos os INSERTs de auditoria e leituras do cockpit falhavam
--   silenciosamente ou retornavam rows vazios.
--
-- NOTA: ENABLE ROW LEVEL SECURITY não é executado aqui porque ambas as tabelas
--   já têm rowsecurity = true. Esta migration apenas cria as policies ausentes.
--
-- ── admin_events ───────────────────────────────────────────────────────────────
--
-- Consumers identificados (pré-auditoria 04/05/2026):
--   ESCREVE: 12+ EFs admin com service_role:
--     admin-church-{create,pricing}, addon-prices-update,
--     affiliate-{crud,commissions-approve,commissions-mark-paid,
--                commissions-export-csv,coupon-create,coupon-toggle},
--     agents-catalog-update, plans-update
--   LÊ: admin-events-list e admin-church-detail (EFs com service_role + JWT admin)
--   Tabela: append-only (auditoria imutável) — NUNCA há UPDATE ou DELETE
--   Frontend pastor: ZERO acesso
--
-- ── admin_tasks ────────────────────────────────────────────────────────────────
--
-- Consumers identificados (pré-auditoria 04/05/2026):
--   ESCREVE: admin-tasks-crud POST (service_role + is_ekthos_admin JWT)
--   LÊ: admin-tasks-crud GET e admin-cockpit-metrics COUNT (service_role + admin JWT)
--   ATUALIZA: admin-tasks-crud PATCH (muda status, prioridade, assignee)
--   DELETA: soft delete via admin-tasks-crud DELETE (status='cancelled')
--   Frontend pastor: ZERO acesso
--
-- Decisão para ambas as tabelas:
--   service_role → acesso total (EFs escrevem via supabaseAdmin)
--   Admin Ekthos authenticated → acesso total (cockpit admin lê/escreve via JWT)
--   Pastor / authenticated genérico → ZERO acesso
--
-- Padrão admin: is_ekthos_admin() — conforme policies existentes em
--   health_scores, impersonate_sessions, churches, subscriptions, plans
--
-- NOTA: admin_events tem policy FOR ALL com WITH CHECK para compatibilidade
--   com o PostgreSQL (FOR ALL sem WITH CHECK é recusado pelo parser).
--   A imutabilidade (append-only) é garantida pela aplicação, não pela policy.
--   Ver migration 20260504100004 que restringe para SELECT+INSERT.

-- ── ADMIN_EVENTS ──────────────────────────────────────────────────────────────
-- RLS already enabled (rowsecurity = true). Adding missing policies only.

DROP POLICY IF EXISTS "service_role_all_admin_events" ON public.admin_events;
CREATE POLICY "service_role_all_admin_events"
  ON public.admin_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_ekthos_all_admin_events" ON public.admin_events;
CREATE POLICY "admin_ekthos_all_admin_events"
  ON public.admin_events
  FOR ALL
  TO authenticated
  USING (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- ── ADMIN_TASKS ───────────────────────────────────────────────────────────────
-- RLS already enabled (rowsecurity = true). Adding missing policies only.

DROP POLICY IF EXISTS "service_role_all_admin_tasks" ON public.admin_tasks;
CREATE POLICY "service_role_all_admin_tasks"
  ON public.admin_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "admin_ekthos_all_admin_tasks" ON public.admin_tasks;
CREATE POLICY "admin_ekthos_all_admin_tasks"
  ON public.admin_tasks
  FOR ALL
  TO authenticated
  USING (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());
