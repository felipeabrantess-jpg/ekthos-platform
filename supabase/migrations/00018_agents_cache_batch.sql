-- ============================================================
-- Migration: 00018_agents_cache_batch.sql
-- Descrição: Adiciona suporte a prompt caching e Batch API
--   nos campos de agent_executions.
-- Criado em: 2026-04-15
-- ============================================================

-- 1. Campos de cache (para rastreio de custo com prompt caching)
ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS cache_read_tokens     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cache_creation_tokens integer NOT NULL DEFAULT 0;

-- 2. Campos de batch (para Batch API — agentes assíncronos)
ALTER TABLE agent_executions
  ADD COLUMN IF NOT EXISTS batch_id     text,
  ADD COLUMN IF NOT EXISTS batch_status text CHECK (
    batch_status IN ('pending', 'processing', 'completed', 'failed')
  );

-- 3. success passa a ser nullable para jobs de batch em estado pending
ALTER TABLE agent_executions
  ALTER COLUMN success DROP NOT NULL;

-- 4. Índice para buscar batch jobs pendentes rapidamente
CREATE INDEX IF NOT EXISTS idx_agent_executions_batch_pending
  ON agent_executions (batch_status, created_at DESC)
  WHERE batch_status = 'pending';

-- 5. Índice para buscar último resultado de um agente por church
CREATE INDEX IF NOT EXISTS idx_agent_executions_church_agent
  ON agent_executions (church_id, agent_slug, created_at DESC);

COMMENT ON COLUMN agent_executions.cache_read_tokens IS
  'Tokens lidos do cache (custo 10% do normal). Preenchido pelo agente.';
COMMENT ON COLUMN agent_executions.cache_creation_tokens IS
  'Tokens gravados no cache (custo 125% do normal, amortizado nas chamadas seguintes).';
COMMENT ON COLUMN agent_executions.batch_id IS
  'ID do batch na Anthropic Batch API. Nulo para execuções síncronas.';
COMMENT ON COLUMN agent_executions.batch_status IS
  'Estado do batch: pending → processing → completed/failed. Nulo para síncronos.';
