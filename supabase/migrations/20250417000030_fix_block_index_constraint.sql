-- Migration: fix_block_index_constraint
-- Corrige o CHECK constraint que limitava block_index <= 6 numa tabela de 20 perguntas.
-- Root cause de todos os erros 500 a partir da P6 do onboarding.

ALTER TABLE onboarding_sessions DROP CONSTRAINT IF EXISTS onboarding_sessions_block_index_check;
ALTER TABLE onboarding_sessions ADD CONSTRAINT onboarding_sessions_block_index_check CHECK (block_index >= 1 AND block_index <= 20);
