-- =============================================================
-- HABILITAR pg_cron
-- Pré-requisito para agentes premium (jobs de renovação de créditos,
-- scan de inativos, auto-pause em saldo zero)
-- =============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
