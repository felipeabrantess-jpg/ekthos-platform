-- Fase 6.3 — Observabilidade mínima dos agentes pastorais
-- Adiciona trigger_type e status text a agent_executions.
-- NÃO renomeia colunas existentes (compat com agent-reengajamento v14).
-- success (boolean) permanece para retrocompatibilidade.

ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS trigger_type text,
  ADD COLUMN IF NOT EXISTS status       text;

COMMENT ON COLUMN agent_executions.trigger_type IS
  'Origem da execução: cron | inbound_message | journey | reengagement_scan';
COMMENT ON COLUMN agent_executions.status IS
  'Resultado textual: success | error | rate_limited | skipped';
COMMENT ON COLUMN agent_executions.success IS
  'Bool legado — mantido para compat com agent-reengajamento v14. Usar status text para novos agentes.';
