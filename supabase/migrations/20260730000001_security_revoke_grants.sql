-- ============================================================
-- SEGURANÇA: REVOKE / GRANT — Onda 2
-- Aplicada: 2026-07-30
-- Branch: feat/security-grants-onda1
-- ============================================================
-- ESCOPO:
--   E2: 8 funções críticas (EF service_role only)
--   E3: debit_agent_credits (3 EFs, todas service_role)
--   E1-add: increment_blast_sent/failed (campaign-blast-sender, service_role)
--           5 funções sem caller (create_default_*, generate_event_occurrences,
--           reengajamento_scan_disparar, volunteer_reengajamento_scan)
--   E4: generate_recurring_occurrences (REVOKE anon+PUBLIC)
--       renew_agent_credit_cycles, check_credit_thresholds,
--       pause_agents_at_zero (REVOKE authenticated)
--   E5: 4 views journey_audit_* → security_invoker = true
--
-- EXCLUÍDA DESTA MIGRATION:
--   record_audit_event — 27 admin EFs chamam com supabaseUser (authenticated JWT).
--   Ação necessária: guard interno (CREATE OR REPLACE) em Onda 3.
--
-- PROIBIDO: qualquer CREATE OR REPLACE FUNCTION. Zero mudança de corpo.
-- Idempotente: REVOKE/GRANT são no-op se o estado já for o desejado.
-- ============================================================


-- ──────────────────────────────────────────────────────────────
-- E2.1 — get_agent_prompt_resolved
-- Caller: EF agent-acolhimento (SERVICE_ROLE_KEY)
-- Risco: SECURITY DEFINER + row_security=off → lê prompts de qq igreja
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION get_agent_prompt_resolved(uuid, text)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION get_agent_prompt_resolved(uuid, text)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.2 — grant_access
-- Callers: EF admin-church-create, stripe-webhook (SERVICE_ROLE_KEY)
-- Risco: ativa planos/subscrições — escrita crítica
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION grant_access(
  uuid, text, character varying, character varying,
  uuid, timestamp with time zone, timestamp with time zone,
  character varying, text, uuid, uuid, boolean
) FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION grant_access(
  uuid, text, character varying, character varying,
  uuid, timestamp with time zone, timestamp with time zone,
  character varying, text, uuid, uuid, boolean
) TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.3 — process_stripe_checkout_completed
-- Caller: EF stripe-webhook (SERVICE_ROLE_KEY)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION process_stripe_checkout_completed(jsonb)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION process_stripe_checkout_completed(jsonb)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.4 — process_subscription_deleted
-- Caller: EF stripe-webhook (SERVICE_ROLE_KEY)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION process_subscription_deleted(jsonb)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION process_subscription_deleted(jsonb)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.5 — process_subscription_updated
-- Caller: EF stripe-webhook (SERVICE_ROLE_KEY)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION process_subscription_updated(jsonb)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION process_subscription_updated(jsonb)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.6 — process_invoice_payment_failed
-- Caller: EF stripe-webhook (SERVICE_ROLE_KEY)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION process_invoice_payment_failed(jsonb)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION process_invoice_payment_failed(jsonb)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.7 — activate_agent_internal
-- Callers: EF admin-cockpit-sell, stripe-webhook (SERVICE_ROLE_KEY)
-- Nota: já não tem authenticated (no-op), idempotente
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION activate_agent_internal(uuid, text, text)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION activate_agent_internal(uuid, text, text)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E2.8 — apply_credit_topup
-- Caller: nenhum no codebase (orphan function — só database.types.ts)
-- Risco: escrita financeira exposta sem caller
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION apply_credit_topup(uuid, text, text)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION apply_credit_topup(uuid, text, text)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E3 — debit_agent_credits
-- Callers: agent-acolhimento, agent-reengajamento, agent-operacao
-- Todos usam SERVICE_ROLE_KEY
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION debit_agent_credits(uuid, text, numeric, text, uuid, text)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION debit_agent_credits(uuid, text, numeric, text, uuid, text)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E1-add: increment_blast_sent / increment_blast_failed
-- Caller: EF campaign-blast-sender (SERVICE_ROLE_KEY)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION increment_blast_sent(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_blast_sent(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION increment_blast_failed(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION increment_blast_failed(uuid)
  TO service_role;

-- ──────────────────────────────────────────────────────────────
-- E1-add: funções sem caller algum no codebase
-- Seguro revogar: apenas em database.types.ts (declaração de tipo)
-- ──────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION create_default_messaging_config()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION create_default_messaging_config()
  TO service_role;

REVOKE EXECUTE ON FUNCTION create_default_pipeline_stages(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION create_default_pipeline_stages(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION generate_event_occurrences(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION generate_event_occurrences(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION reengajamento_scan_disparar()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION reengajamento_scan_disparar()
  TO service_role;

REVOKE EXECUTE ON FUNCTION volunteer_reengajamento_scan(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION volunteer_reengajamento_scan(uuid)
  TO service_role;


-- ──────────────────────────────────────────────────────────────
-- E4 — Funções cron-only (jobs usam role=postgres — não quebra)
-- ──────────────────────────────────────────────────────────────

-- E4.1 — generate_recurring_occurrences: REVOKE apenas anon + PUBLIC
-- Job 23 usa role=postgres (superuser) — REVOKE não afeta o cron
REVOKE EXECUTE ON FUNCTION generate_recurring_occurrences(integer)
  FROM anon, PUBLIC;
-- authenticated: mantido por ora (separar em Onda 3 com guard tenant)

-- E4.2 — renew_agent_credit_cycles: REVOKE authenticated
-- Job 6 usa role=postgres
REVOKE EXECUTE ON FUNCTION renew_agent_credit_cycles()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION renew_agent_credit_cycles()
  TO service_role;

-- E4.3 — check_credit_thresholds: REVOKE authenticated
-- Job 7 usa role=postgres
REVOKE EXECUTE ON FUNCTION check_credit_thresholds()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION check_credit_thresholds()
  TO service_role;

-- E4.4 — pause_agents_at_zero: REVOKE authenticated
-- Job usa role=postgres
REVOKE EXECUTE ON FUNCTION pause_agents_at_zero()
  FROM authenticated, anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION pause_agents_at_zero()
  TO service_role;


-- ──────────────────────────────────────────────────────────────
-- E5 — Views journey_audit_* → security_invoker = true
-- Supabase Advisors flageia SECURITY DEFINER em views como ERROR.
-- security_invoker=true faz a view executar como o usuário atual,
-- respeitando RLS das tabelas subjacentes.
-- ──────────────────────────────────────────────────────────────

-- E5.1 — journey_audit_missing_spine
CREATE OR REPLACE VIEW journey_audit_missing_spine
  WITH (security_invoker = true)
AS
SELECT
  pp.church_id,
  pp.person_id,
  pp.stage_id AS pipeline_stage_id,
  pp.entered_at,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS person_name,
  p.phone
FROM person_pipeline pp
JOIN people p ON p.id = pp.person_id AND p.deleted_at IS NULL
LEFT JOIN person_journey pj
  ON pj.person_id = pp.person_id
  AND pj.church_id = pp.church_id
  AND pj.closed_at IS NULL
WHERE pj.id IS NULL;

-- E5.2 — journey_audit_orphan_spine
CREATE OR REPLACE VIEW journey_audit_orphan_spine
  WITH (security_invoker = true)
AS
SELECT
  pj.church_id,
  pj.person_id,
  pj.stage_id,
  pj.opened_at,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS person_name
FROM person_journey pj
JOIN people p ON p.id = pj.person_id AND p.deleted_at IS NULL
LEFT JOIN person_pipeline pp
  ON pp.person_id = pj.person_id
  AND pp.church_id = pj.church_id
WHERE pp.person_id IS NULL
  AND pj.closed_at IS NULL;

-- E5.3 — journey_audit_stage_conflicts
CREATE OR REPLACE VIEW journey_audit_stage_conflicts
  WITH (security_invoker = true)
AS
SELECT
  p.church_id,
  p.id AS person_id,
  p.pipeline_stage_id AS stage_em_people,
  pp.stage_id         AS stage_em_pipeline,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS person_name
FROM people p
JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.deleted_at IS NULL
  AND p.pipeline_stage_id IS NOT NULL
  AND p.pipeline_stage_id != pp.stage_id;

-- E5.4 — journey_audit_reconciliation
CREATE OR REPLACE VIEW journey_audit_reconciliation
  WITH (security_invoker = true)
AS
SELECT
  c.id AS church_id,
  c.name AS church_name,
  (SELECT COUNT(*) FROM people WHERE church_id = c.id AND deleted_at IS NULL)                          AS total_pessoas,
  (SELECT COUNT(*) FROM person_pipeline WHERE church_id = c.id)                                        AS no_pipeline_legado,
  (SELECT COUNT(*) FROM person_journey WHERE church_id = c.id AND closed_at IS NULL)                   AS na_espinha_ativa,
  (SELECT COUNT(*) FROM person_journey WHERE church_id = c.id AND closed_at IS NULL) -
  (SELECT COUNT(*) FROM person_pipeline WHERE church_id = c.id)                                        AS delta_espinha_vs_pipeline,
  (SELECT enabled FROM church_feature_flags WHERE church_id = c.id AND flag_key = 'journey_unification')
                                                                                                       AS flag_journey_ativa
FROM churches c
WHERE c.deleted_at IS NULL
ORDER BY c.name;
