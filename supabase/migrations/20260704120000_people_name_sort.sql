-- Ordenação alfabética correta (com acentos) na listagem de Pessoas.
--
-- Problema: ORDER BY name ASC usa collation C (byte order), onde 'Á' > 'Z'.
-- Solução: coluna gerada name_sort = unaccent(lower(trim(name))), que normaliza
-- acentos e caixa para ordenação puramente alfabética.
--
-- Idempotente: IF NOT EXISTS em todas as operações.

-- 1. Extensão unaccent (disponível em todos os projetos Supabase)
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- 2. Coluna gerada para ordenação
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS name_sort TEXT
  GENERATED ALWAYS AS (extensions.unaccent(lower(trim(name)))) STORED;

-- 3. Índice composto (church_id, name_sort) para paginar ordenado sem full scan
CREATE INDEX IF NOT EXISTS idx_people_church_name_sort
  ON people (church_id, name_sort);
