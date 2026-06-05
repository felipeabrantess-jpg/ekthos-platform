-- Migration: substitui unique constraint plena por partial unique index.
--
-- Problema: people_church_phone_unique era CONSTRAINT UNIQUE (church_id, phone)
-- sem predicado — pessoas soft-deletadas (deleted_at IS NOT NULL) continuavam
-- bloqueando o telefone para novos cadastros na mesma igreja, tornando o
-- soft-delete ineficaz para reutilização de número.
--
-- Solução: drop da constraint + partial unique index WHERE deleted_at IS NULL
-- garante unicidade apenas entre pessoas ativas.

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_church_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS people_church_phone_unique
  ON people (church_id, phone)
  WHERE deleted_at IS NULL;
