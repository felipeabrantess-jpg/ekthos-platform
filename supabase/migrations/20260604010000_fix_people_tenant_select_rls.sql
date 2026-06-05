-- Migration: fix people_tenant_select RLS policy
--
-- Root cause: PostgreSQL's WITH CHECK behaviour — when an UPDATE makes a row
-- invisible to the SELECT USING clause (deleted_at IS NOT NULL fails
-- "deleted_at IS NULL"), it raises ERROR 42501 ("new row violates row-level
-- security policy") and rolls back the statement. This blocked every
-- soft-delete (UPDATE people SET deleted_at = …) for church-role users.
--
-- Fix: remove the deleted_at IS NULL predicate from the SELECT USING clause.
-- The filter is applied at the application layer (.is('deleted_at', null))
-- in every listing query. The church_id tenant-isolation guard is preserved.

DROP POLICY IF EXISTS people_tenant_select ON people;

CREATE POLICY people_tenant_select ON people
  FOR SELECT
  USING (church_id = auth_church_id());
