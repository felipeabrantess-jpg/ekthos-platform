-- ============================================================
-- Migration: people_is_leader
-- Sprint: Cluster B — Feature #is_leader explícito
-- Criada em: 2026-05-21
--
-- Adiciona coluna is_leader (BOOLEAN NOT NULL DEFAULT false) em people.
-- Resolve o problema circular de seleção de líder: antes, "líder"
-- era quem já aparecia como leader_id em groups/ministries. Agora,
-- é uma flag explícita que pode ser marcada antes de a pessoa
-- assumir qualquer função.
--
-- Inclui backfill idempotente: marca is_leader=true para todas as
-- pessoas que já são leader_id ou co_leader_id em groups/ministries,
-- preservando os líderes atuais.
--
-- Rollback:
--   DROP INDEX IF EXISTS idx_people_is_leader;
--   ALTER TABLE public.people DROP COLUMN IF EXISTS is_leader;
-- ============================================================

-- 1. Adicionar coluna
ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS is_leader BOOLEAN NOT NULL DEFAULT false;

-- 2. Índice parcial eficiente (líderes são minoria da tabela)
CREATE INDEX IF NOT EXISTS idx_people_is_leader
  ON public.people (church_id, is_leader)
  WHERE is_leader = true;

COMMENT ON COLUMN public.people.is_leader IS
  'true se a pessoa exerce papel de liderança (líder de célula, coordenador, pastor). '
  'Marcado manualmente no cadastro da pessoa. Permite seleção em campos de líder.';

-- 3. Backfill idempotente — marca líderes existentes em groups e ministries
UPDATE public.people p
SET is_leader = true
FROM (
  SELECT leader_id    AS person_id FROM public.groups     WHERE leader_id    IS NOT NULL
  UNION
  SELECT co_leader_id AS person_id FROM public.groups     WHERE co_leader_id IS NOT NULL
  UNION
  SELECT leader_id    AS person_id FROM public.ministries WHERE leader_id    IS NOT NULL
) sources
WHERE p.id = sources.person_id
  AND p.is_leader = false;
