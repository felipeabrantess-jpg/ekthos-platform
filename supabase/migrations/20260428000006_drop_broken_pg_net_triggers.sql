-- =============================================================
-- Migration: drop_broken_pg_net_triggers
-- Data: 2026-04-28
-- Descrição: Remove triggers trg_n8n_people_insert e trg_n8n_people_update
--   que chamam trigger_n8n_people() → net.http_post() (pg_net NÃO instalado).
--   Esses triggers bloqueiam TODO INSERT/UPDATE na tabela people.
--   A funcionalidade de dispatch está substituída pelo dispatch-person-event EF
--   (chamado fire-and-forget pelo visitor-capture e outros EFs).
-- =============================================================

DROP TRIGGER IF EXISTS trg_n8n_people_insert ON people;
DROP TRIGGER IF EXISTS trg_n8n_people_update  ON people;

-- Remover a função também — depende de net.http_post que não existe
DROP FUNCTION IF EXISTS trigger_n8n_people();

COMMENT ON TABLE people IS
  'Tabela de pessoas da church. Triggers pg_net removidos em 2026-04-28 '
  '(pg_pg não instalado); dispatch via dispatch-person-event EF.';
