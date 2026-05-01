-- =============================================================
-- SPRINT 2 — agent_pending_messages: retry columns + status extension
-- Suporte a dispatch-message → n8n + retry policy (attempt_count < 3)
-- 01/05/2026
-- =============================================================

-- 1. Adiciona coluna attempt_count (idempotente)
ALTER TABLE agent_pending_messages
  ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;

-- 2. Drop constraint de status existente (criada inline sem nome explícito)
--    Nome gerado pelo PostgreSQL: agent_pending_messages_status_check
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT con.conname INTO v_constraint
  FROM   pg_constraint con
  JOIN   pg_class      rel ON rel.oid = con.conrelid
  WHERE  rel.relname  = 'agent_pending_messages'
    AND  con.contype  = 'c'
    AND  con.conname  LIKE '%status%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE agent_pending_messages DROP CONSTRAINT %I', v_constraint);
  END IF;
END;
$$;

-- 3. Nova constraint de status com todos os valores Sprint 2
ALTER TABLE agent_pending_messages
  ADD CONSTRAINT agent_pending_messages_status_check
  CHECK (status IN (
    'awaiting_credits',   -- Sprint 1: sem crédito
    'awaiting_retry',     -- Sprint 2: POST n8n falhou, worker vai retentar
    'dispatched_to_n8n',  -- Sprint 2: n8n recebeu o payload
    'delivered',          -- Sprint 2+: confirmação de entrega (callback n8n)
    'failed',             -- Sprint 2: attempt_count >= 3, desistiu
    'dispatched',         -- legado Sprint 1
    'expired',            -- legado Sprint 1
    'cancelled'           -- legado Sprint 1
  ));

-- 4. Índice para o retry worker (filtra só o que importa)
CREATE INDEX IF NOT EXISTS idx_apm_retry
  ON agent_pending_messages(attempt_count, scheduled_for)
  WHERE status = 'awaiting_retry';
