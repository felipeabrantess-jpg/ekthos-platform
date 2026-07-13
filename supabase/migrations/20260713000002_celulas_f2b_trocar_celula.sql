-- F2-B: fix unique constraint for history + atomic cell-change RPC
-- Depends on F2-A (joined_at, left_at)

-- 1. Remove old unique (group_id, person_id) — blocks person from rejoining same cell
ALTER TABLE cell_members DROP CONSTRAINT IF EXISTS cell_members_group_id_person_id_key;

-- 2. Partial unique: only one active membership per (group, person)
CREATE UNIQUE INDEX IF NOT EXISTS cell_members_active_unique
  ON cell_members (group_id, person_id)
  WHERE left_at IS NULL;

-- 3. Atomic RPC — SECURITY DEFINER required because audit_logs INSERT has service_role RLS
CREATE OR REPLACE FUNCTION change_person_cell(
  p_person_id   UUID,
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

  -- Validate person belongs to this church; capture current celula_id
  SELECT celula_id INTO v_old_group_id
  FROM people
  WHERE id = p_person_id AND church_id = v_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Person not found in this church';
  END IF;

  -- Validate new cell belongs to this church
  SELECT name INTO v_new_cell_name
  FROM groups
  WHERE id = p_new_group_id AND church_id = v_church_id;

  IF v_new_cell_name IS NULL THEN
    RAISE EXCEPTION 'Cell not found in this church';
  END IF;

  -- Capture old cell name (if any)
  IF v_old_group_id IS NOT NULL THEN
    SELECT name INTO v_old_cell_name
    FROM groups
    WHERE id = v_old_group_id AND church_id = v_church_id;
  END IF;

  -- Close active membership (no-op if none exists)
  UPDATE cell_members
  SET left_at = now()
  WHERE person_id = p_person_id
    AND church_id = v_church_id
    AND left_at IS NULL;

  -- Create new membership
  INSERT INTO cell_members (church_id, group_id, person_id, role, joined_at)
  VALUES (v_church_id, p_new_group_id, p_person_id, 'participante', now());

  -- Sync people.celula_id
  UPDATE people
  SET celula_id = p_new_group_id
  WHERE id = p_person_id AND church_id = v_church_id;

  -- Audit (SECURITY DEFINER bypasses audit_logs_service_insert RLS)
  INSERT INTO audit_logs (church_id, entity_type, entity_id, action, actor_type, actor_id, payload)
  VALUES (
    v_church_id,
    'person',
    p_person_id,
    'cell_changed',
    'user',
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

GRANT EXECUTE ON FUNCTION change_person_cell(UUID, UUID) TO authenticated;
