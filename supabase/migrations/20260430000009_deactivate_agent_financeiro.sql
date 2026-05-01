-- =============================================================
-- Desativa agent-financeiro até Sprint Financeiro Pro
-- Sprint 1 — 30/04/2026
--
-- Caminho A (decisão Felipe): agent-escalas é o módulo ativo
-- no frontend (agents-content.ts). agent-financeiro volta em
-- Sprint dedicado com EF, schema e UX completos.
-- =============================================================

UPDATE agents_catalog
SET active = false, updated_at = now()
WHERE slug = 'agent-financeiro';
