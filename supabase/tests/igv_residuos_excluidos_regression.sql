-- Regressão — migration 20261027140000 (resíduos de pessoas excluídas da IGV). Transação desfeita no fim.
-- Uso: node supabase/tests/run-regression.mjs <este arquivo> supabase/migrations/20261027140000_igv_residuos_pessoas_excluidas.sql
BEGIN;
SET LOCAL lock_timeout = '3s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _antes ON COMMIT DROP AS SELECT
  (SELECT md5(string_agg(v::text, '' ORDER BY v.id)) FROM volunteers v WHERE v.church_id <> '6c127559-874a-4748-8fce-55d4079613a5') outras_vol,
  (SELECT md5(string_agg(m::text, '' ORDER BY m.id)) FROM ministry_members m WHERE m.church_id <> '6c127559-874a-4748-8fce-55d4079613a5') outras_mm,
  (SELECT count(*) FROM volunteers v JOIN people p ON p.id = v.person_id WHERE v.church_id = '6c127559-874a-4748-8fce-55d4079613a5' AND v.is_active AND p.deleted_at IS NULL) igv_vol_ativos_validos,
  (SELECT count(*) FROM people_deletion_unlinks) log_antes,
  (SELECT count(*) FROM person_journey) jornadas, (SELECT count(*) FROM journey_events) eventos;

--@@MIGRATION@@

DO $$
DECLARE c constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
BEGIN
  INSERT INTO _r SELECT 1, 'nenhuma pessoa excluída da IGV segue com papel ativo',
    NOT EXISTS (SELECT 1 FROM volunteers v JOIN people p ON p.id = v.person_id WHERE v.church_id = c AND v.is_active AND p.deleted_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM leaders l JOIN people p ON p.id = l.person_id WHERE l.church_id = c AND l.is_active AND p.deleted_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM ministries m JOIN people p ON p.id = m.leader_id WHERE m.church_id = c AND p.deleted_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM groups g JOIN people p ON p.id IN (g.leader_id, g.co_leader_id) WHERE g.church_id = c AND p.deleted_at IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM ministry_members mm JOIN people p ON p.id = mm.person_id WHERE mm.church_id = c AND p.deleted_at IS NOT NULL), NULL;
  INSERT INTO _r SELECT 2, 'Hélio: voluntariado desativado e registrado (restaurável)',
    NOT EXISTS (SELECT 1 FROM volunteers WHERE id = 'd0ac9ec5-8753-4418-812b-8458509b24da' AND is_active)
    AND EXISTS (SELECT 1 FROM people_deletion_unlinks WHERE row_id = 'd0ac9ec5-8753-4418-812b-8458509b24da' AND action = 'deactivate' AND (row_before ->> 'is_active')::boolean), NULL;
  INSERT INTO _r SELECT 3, 'voluntários ativos de pessoas válidas intactos', (SELECT count(*) FROM volunteers v JOIN people p ON p.id = v.person_id WHERE v.church_id = c AND v.is_active AND p.deleted_at IS NULL) = (SELECT igv_vol_ativos_validos FROM _antes),
    (SELECT igv_vol_ativos_validos FROM _antes)::text;
  INSERT INTO _r SELECT 4, 'outras igrejas intactas', (SELECT md5(string_agg(v::text, '' ORDER BY v.id)) FROM volunteers v WHERE v.church_id <> c) IS NOT DISTINCT FROM (SELECT outras_vol FROM _antes)
    AND (SELECT md5(string_agg(m::text, '' ORDER BY m.id)) FROM ministry_members m WHERE m.church_id <> c) IS NOT DISTINCT FROM (SELECT outras_mm FROM _antes), NULL;
  INSERT INTO _r SELECT 5, 'históricos intactos (atendimentos e eventos)', (SELECT count(*) FROM person_journey) = (SELECT jornadas FROM _antes) AND (SELECT count(*) FROM journey_events) = (SELECT eventos FROM _antes), NULL;
  INSERT INTO _r SELECT 6, 'registro de restauração: só linhas da IGV', NOT EXISTS (SELECT 1 FROM people_deletion_unlinks WHERE church_id <> c AND created_at > now() - interval '1 minute'),
    format('%s linha(s) novas', (SELECT count(*) FROM people_deletion_unlinks) - (SELECT log_antes FROM _antes));
END $$;
DO $$ BEGIN RAISE EXCEPTION 'RESULTADO:%', (SELECT json_agg(_r ORDER BY n) FROM _r); END $$;
