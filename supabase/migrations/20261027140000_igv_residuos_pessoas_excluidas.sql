-- ============================================================
-- IGV — papéis ativos de pessoas excluídas ANTES do trigger people_unlink_on_delete (20261026120000)
-- Reunião IGV 26/10: pessoa excluída não pode aparecer como líder, membro ou voluntário ativo.
-- Aplica às pessoas JÁ excluídas da IGV a mesma limpeza que o trigger faz nas exclusões novas:
--   ministries.leader_id → NULL · groups.leader_id/co_leader_id → NULL · ministry_members removidos ·
--   leaders/volunteers → is_active = false.
-- Só a IGV. Só papéis ATIVOS. Cada linha é guardada antes em people_deletion_unlinks (restaurável pelo bloco
-- RESTAURAR de docs/rollbacks/20261026120000_people_delete_unlink.rollback.sql). Históricos (atendimentos,
-- contatos, presenças, relatórios) NÃO são tocados. Situação em 26/10: 1 voluntário ativo (Hélio, ACOLHIMENTO).
-- ============================================================
DO $$
DECLARE
  c constant uuid := '6c127559-874a-4748-8fce-55d4079613a5';
BEGIN
  CREATE TEMP TABLE _exc ON COMMIT DROP AS
    SELECT id, deleted_at FROM people WHERE church_id = c AND deleted_at IS NOT NULL;

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT c, e.id, e.deleted_at, 'ministries', m.id, 'clear_leader_id', to_jsonb(m)
  FROM ministries m JOIN _exc e ON e.id = m.leader_id WHERE m.church_id = c;
  UPDATE ministries SET leader_id = NULL, updated_at = now() WHERE church_id = c AND leader_id IN (SELECT id FROM _exc);

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT c, e.id, e.deleted_at, 'groups', g.id, 'clear_leader_id', to_jsonb(g)
  FROM groups g JOIN _exc e ON e.id = g.leader_id WHERE g.church_id = c;
  UPDATE groups SET leader_id = NULL, updated_at = now() WHERE church_id = c AND leader_id IN (SELECT id FROM _exc);

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT c, e.id, e.deleted_at, 'groups', g.id, 'clear_co_leader_id', to_jsonb(g)
  FROM groups g JOIN _exc e ON e.id = g.co_leader_id WHERE g.church_id = c;
  UPDATE groups SET co_leader_id = NULL, updated_at = now() WHERE church_id = c AND co_leader_id IN (SELECT id FROM _exc);

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT c, e.id, e.deleted_at, 'ministry_members', mm.id, 'delete', to_jsonb(mm)
  FROM ministry_members mm JOIN _exc e ON e.id = mm.person_id WHERE mm.church_id = c;
  DELETE FROM ministry_members WHERE church_id = c AND person_id IN (SELECT id FROM _exc);

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT c, e.id, e.deleted_at, 'leaders', l.id, 'deactivate', to_jsonb(l)
  FROM leaders l JOIN _exc e ON e.id = l.person_id WHERE l.church_id = c AND l.is_active;
  UPDATE leaders SET is_active = false, updated_at = now() WHERE church_id = c AND is_active AND person_id IN (SELECT id FROM _exc);

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT c, e.id, e.deleted_at, 'volunteers', v.id, 'deactivate', to_jsonb(v)
  FROM volunteers v JOIN _exc e ON e.id = v.person_id WHERE v.church_id = c AND v.is_active;
  UPDATE volunteers SET is_active = false, updated_at = now() WHERE church_id = c AND is_active AND person_id IN (SELECT id FROM _exc);
END $$;
