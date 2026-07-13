-- Fix: change_person_cell usava actor_type='user' que viola o CHECK constraint
-- de audit_logs: CHECK (actor_type = ANY (ARRAY['agent','human','system','webhook']))
-- Isso causava rollback silencioso de toda a transação — nenhuma linha era criada
-- em cell_members e o histórico nunca aparecia.
-- Correção: trocar 'user' por 'human'.
--
-- Também faz backfill de cell_members para pessoas que têm celula_id definido
-- mas nunca passaram pela RPC (vínculo criado por caminho direto).
-- O backfill garante que a próxima troca terá um registro anterior para encerrar
-- e o histórico vai aparecer corretamente.

CREATE OR REPLACE FUNCTION change_person_cell(
  p_person_id    UUID,
  p_new_group_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_church_id     UUID;
  v_old_group_id  UUID;
  v_actor_id      TEXT;
  v_old_cell_name TEXT;
  v_new_cell_name TEXT;
BEGIN
  v_church_id := auth_church_id();
  v_actor_id  := auth.uid()::TEXT;

  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: no church context';
  END IF;

  SELECT celula_id INTO v_old_group_id
  FROM people
  WHERE id = p_person_id AND church_id = v_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found in this church';
  END IF;

  SELECT name INTO v_new_cell_name
  FROM groups
  WHERE id = p_new_group_id AND church_id = v_church_id;

  IF v_new_cell_name IS NULL THEN
    RAISE EXCEPTION 'Cell not found in this church';
  END IF;

  IF v_old_group_id IS NOT NULL THEN
    SELECT name INTO v_old_cell_name
    FROM groups
    WHERE id = v_old_group_id AND church_id = v_church_id;
  END IF;

  UPDATE cell_members
  SET left_at = now()
  WHERE person_id = p_person_id
    AND church_id = v_church_id
    AND left_at IS NULL;

  INSERT INTO cell_members (church_id, group_id, person_id, role, joined_at)
  VALUES (v_church_id, p_new_group_id, p_person_id, 'participante', now());

  UPDATE people
  SET celula_id = p_new_group_id
  WHERE id = p_person_id AND church_id = v_church_id;

  INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
  VALUES (
    v_church_id,
    'person',
    p_person_id,
    'cell_changed',
    'human',
    v_actor_id,
    jsonb_build_object(
      'old_group_id',  v_old_group_id,
      'new_group_id',  p_new_group_id,
      'old_cell_name', COALESCE(v_old_cell_name, 'sem célula'),
      'new_cell_name', v_new_cell_name
    )
  );

  RETURN jsonb_build_object(
    'ok',           true,
    'old_group_id', v_old_group_id,
    'new_group_id', p_new_group_id
  );
END;
$$;

-- Backfill: cria linha ativa em cell_members para pessoas que já têm celula_id
-- mas nenhum registro ativo na tabela de histórico.
-- NOT EXISTS garante idempotência — seguro rodar mais de uma vez.
INSERT INTO cell_members (church_id, group_id, person_id, role, joined_at)
SELECT
  p.church_id,
  p.celula_id,
  p.id,
  'participante'::cell_role,
  COALESCE(p.created_at, now())
FROM people p
WHERE p.celula_id IS NOT NULL
  AND p.church_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM cell_members cm
    WHERE cm.person_id = p.id AND cm.left_at IS NULL
  );
