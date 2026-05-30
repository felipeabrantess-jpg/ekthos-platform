-- ============================================================
-- Migration: 20260528000003_split_welcome_locks.sql
--
-- Resolve Cenário F: o lock único `welcome_dispatched_at` bloqueava
-- email E n8n com o mesmo mutex. Se n8n estava OFF na 1ª chamada,
-- o email travava o lock e n8n nunca disparava mesmo com flag ON.
--
-- Solução: dois locks independentes por canal:
--   email_welcome_dispatched_at  → mutex do email de boas-vindas
--   n8n_welcome_dispatched_at    → mutex do webhook n8n
--
-- Backfill: preserva histórico — quem já recebeu email tem o novo
-- campo preenchido (welcome_dispatched_at → email_welcome_dispatched_at).
--
-- welcome_dispatched_at original: DEPRECATED mas NUNCA removido.
-- Mantido para auditoria e compatibilidade retroativa.
-- ============================================================

-- 1. Adicionar novas colunas independentes
ALTER TABLE acolhimento_journey
  ADD COLUMN IF NOT EXISTS email_welcome_dispatched_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS n8n_welcome_dispatched_at   TIMESTAMPTZ DEFAULT NULL;

-- 2. Backfill: pessoas que já receberam o welcome via email
--    (welcome_dispatched_at IS NOT NULL → já passou pelo D3 guard antigo)
UPDATE acolhimento_journey
  SET email_welcome_dispatched_at = welcome_dispatched_at
  WHERE welcome_dispatched_at IS NOT NULL
    AND email_welcome_dispatched_at IS NULL;

-- 3. Marcar welcome_dispatched_at como deprecated (sem remoção — imutável)
COMMENT ON COLUMN acolhimento_journey.welcome_dispatched_at IS
  'DEPRECATED (2026-05-28): substituído por email_welcome_dispatched_at e n8n_welcome_dispatched_at. '
  'Mantido para auditoria retroativa. Nunca remover — histórico de acolhimentos em produção.';

COMMENT ON COLUMN acolhimento_journey.email_welcome_dispatched_at IS
  'Mutex pessimista do canal email: preenchido atomicamente na 1ª vez que o email de boas-vindas é enviado. '
  'Independente do canal n8n. NULL = email ainda não enviado.';

COMMENT ON COLUMN acolhimento_journey.n8n_welcome_dispatched_at IS
  'Mutex pessimista do canal n8n: preenchido atomicamente na 1ª vez que o webhook n8n é disparado. '
  'Independente do canal email. NULL = n8n ainda não disparado.';
