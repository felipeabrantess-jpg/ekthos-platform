-- ============================================================
-- Migration: unify_ministries_leader_to_people
-- Sprint: Cluster B — Bugs #13, #17 (root fix)
-- Criada em: 2026-05-21
--
-- Elimina indireção ministries → leaders → people.
-- ministries.leader_id passa a referenciar people(id) diretamente.
-- Todos leader_id em produção são NULL → zero migração de dados.
--
-- ROLLBACK:
--   ALTER TABLE public.ministries
--     DROP CONSTRAINT IF EXISTS ministries_leader_id_people_fkey;
--   ALTER TABLE public.ministries
--     ADD CONSTRAINT ministries_leader_id_fkey
--     FOREIGN KEY (leader_id) REFERENCES public.leaders(id);
-- ============================================================

-- Verificação de segurança: confirmar zero leader_id não-NULL antes
-- (migration é idempotente via IF EXISTS)

-- DROP FK antiga (→ leaders)
ALTER TABLE public.ministries
  DROP CONSTRAINT IF EXISTS ministries_leader_id_fkey;

-- ADD FK nova (→ people, ON DELETE SET NULL para não orphanar ministério)
ALTER TABLE public.ministries
  ADD CONSTRAINT ministries_leader_id_people_fkey
  FOREIGN KEY (leader_id) REFERENCES public.people(id) ON DELETE SET NULL;
