-- ============================================================
-- ROLLBACK — Journey Unification Fase 1
-- Desfaz as 5 migrations em ordem inversa: 5 → 4 → 3 → 2 → 1
--
-- PRÉ-CONDIÇÃO OBRIGATÓRIA:
--   person_journey deve estar com 0 linhas.
--   SELECT COUNT(*) FROM person_journey; -- deve retornar 0
--
-- EXECUTAR UMA STEP DE CADA VEZ e verificar antes de prosseguir.
-- NÃO executar como bloco único em produção.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 0 — Verificação de segurança (executar antes de tudo)
-- ──────────────────────────────────────────────────────────────
SELECT COUNT(*) AS linhas_ativas FROM person_journey WHERE closed_at IS NULL;
-- SE > 0: PARE. Backfill foi rodado. Rollback requer limpeza manual.

SELECT COUNT(*) AS total_journey  FROM person_journey;
-- SE > 0: PARE. Há dados reais. Rollback só é seguro com 0 linhas.


-- ──────────────────────────────────────────────────────────────
-- STEP 1 — Reverter migration 5 (actor_type + RPCs sem p_actor_id)
-- ──────────────────────────────────────────────────────────────

-- 1a. Revogar grants das novas RPCs
REVOKE EXECUTE ON FUNCTION journey_advance(uuid,integer,uuid,text)          FROM authenticated;
REVOKE EXECUTE ON FUNCTION journey_assign(uuid,integer,uuid)                FROM authenticated;
REVOKE EXECUTE ON FUNCTION journey_register_touch(uuid,text,jsonb)          FROM authenticated;
REVOKE EXECUTE ON FUNCTION journey_transfer(uuid,integer,uuid,uuid,text)    FROM authenticated;
REVOKE EXECUTE ON FUNCTION journey_update_next_step(uuid,integer,text,date) FROM authenticated;
REVOKE EXECUTE ON FUNCTION journey_close(uuid,integer,text,text)            FROM authenticated;

-- 1b. Dropar as 6 RPCs recriadas pela migration 5 (assinaturas sem p_actor_id)
DROP FUNCTION IF EXISTS journey_advance(uuid,integer,uuid,text);
DROP FUNCTION IF EXISTS journey_assign(uuid,integer,uuid);
DROP FUNCTION IF EXISTS journey_register_touch(uuid,text,jsonb);
DROP FUNCTION IF EXISTS journey_transfer(uuid,integer,uuid,uuid,text);
DROP FUNCTION IF EXISTS journey_update_next_step(uuid,integer,text,date);
DROP FUNCTION IF EXISTS journey_close(uuid,integer,text,text);

-- 1c. Dropar constraint e coluna actor_type
ALTER TABLE journey_events DROP CONSTRAINT IF EXISTS chk_je_human_has_actor;
ALTER TABLE journey_events DROP COLUMN IF EXISTS actor_type;

-- 1d. Remover do tracking
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260729000005';

-- Verificar: SELECT version, name FROM supabase_migrations.schema_migrations WHERE version LIKE '202607290000%';


-- ──────────────────────────────────────────────────────────────
-- STEP 2 — Reverter migration 4 (audit views)
-- ──────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS journey_audit_reconciliation;
DROP VIEW IF EXISTS journey_audit_stage_conflicts;
DROP VIEW IF EXISTS journey_audit_orphan_spine;
DROP VIEW IF EXISTS journey_audit_missing_spine;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260729000004';


-- ──────────────────────────────────────────────────────────────
-- STEP 3 — Reverter migration 3 (feature flag)
-- ──────────────────────────────────────────────────────────────
-- DROP CASCADE remove trigger, policies e índices automaticamente.
DROP TABLE IF EXISTS church_feature_flags CASCADE;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260729000003';


-- ──────────────────────────────────────────────────────────────
-- STEP 4 — Reverter migration 2 (RPCs originais com p_actor_id)
-- ──────────────────────────────────────────────────────────────
-- Pode ser que a migration 5 já as tenha dropado (overloads);
-- usar IF EXISTS por segurança.
REVOKE ALL ON FUNCTION _journey_fetch_and_lock(uuid,integer) FROM service_role;

DROP FUNCTION IF EXISTS journey_advance(uuid,integer,uuid,uuid,text);
DROP FUNCTION IF EXISTS journey_assign(uuid,integer,uuid,uuid);
DROP FUNCTION IF EXISTS journey_register_touch(uuid,text,uuid,jsonb);
DROP FUNCTION IF EXISTS journey_transfer(uuid,integer,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS journey_update_next_step(uuid,integer,text,date,uuid);
DROP FUNCTION IF EXISTS journey_close(uuid,integer,text,uuid,text);
DROP FUNCTION IF EXISTS _journey_fetch_and_lock(uuid,integer);

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260729000002';


-- ──────────────────────────────────────────────────────────────
-- STEP 5 — Reverter migration 1 (tabelas person_journey + journey_events)
-- ──────────────────────────────────────────────────────────────
-- ATENÇÃO: DROP CASCADE remove índices, triggers, policies e RLS.
-- journey_events primeiro (FK para person_journey).
DROP TABLE IF EXISTS journey_events CASCADE;
DROP TABLE IF EXISTS person_journey CASCADE;

DELETE FROM supabase_migrations.schema_migrations WHERE version = '20260729000001';


-- ──────────────────────────────────────────────────────────────
-- STEP 6 — Verificação final
-- ──────────────────────────────────────────────────────────────
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('person_journey', 'journey_events', 'church_feature_flags');
-- Resultado esperado: 0 linhas

SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version LIKE '20260729%';
-- Resultado esperado: 0 linhas
