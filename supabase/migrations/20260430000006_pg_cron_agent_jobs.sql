-- =============================================================
-- pg_cron jobs para agentes premium
-- Sprint 1 — 30/04/2026
--
-- NOTA TÉCNICA: Supabase não permite UPDATE em cron.job.active
-- via SQL de migration (permission denied). Jobs são sempre criados
-- como "ativos" pelo pg_cron. As 3 RPCs de infra são safe no-ops
-- quando não há dados. Os 2 de scan usam SELECT 1 até Sprint 2/3.
--
-- Para desativar um job: SELECT cron.unschedule('nome');
-- Para reativar: rodar o cron.schedule() correspondente.
-- =============================================================

-- 1. Renovação mensal de ciclos de crédito (todo dia 1 às 00:00)
SELECT cron.schedule(
  'agent-cycle-renew',
  '0 0 1 * *',
  $$ SELECT renew_agent_credit_cycles(); $$
);

-- 2. Verificação de thresholds de consumo (hourly)
SELECT cron.schedule(
  'agent-quota-check',
  '0 * * * *',
  $$ SELECT check_credit_thresholds(); $$
);

-- 3. Auto-pause em saldo zero (a cada 5 min)
SELECT cron.schedule(
  'agent-auto-pause',
  '*/5 * * * *',
  $$ SELECT pause_agents_at_zero(); $$
);

-- 4. Follow-up scan do agent-acolhimento (a cada 30 min)
-- PLACEHOLDER — implementação real em Sprint 2 (agent-acolhimento E2E)
SELECT cron.schedule(
  'agent-acolhimento-fu',
  '*/30 * * * *',
  $$ SELECT 1; /* Sprint 2: implementar scan de follow-up acolhimento */ $$
);

-- 5. Scan diário de inativos para reengajamento (09:00 todo dia)
-- PLACEHOLDER — implementação real em Sprint 3 (agent-reengajamento E2E)
SELECT cron.schedule(
  'agent-reengajamento-scan',
  '0 9 * * *',
  $$ SELECT 1; /* Sprint 3: implementar scan de inativos reengajamento */ $$
);
