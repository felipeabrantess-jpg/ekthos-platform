-- ============================================================
-- E19.1 — actor_type em journey_events + RPCs sem p_actor_id
--
-- Problema corrigido: as 6 RPCs aceitavam p_actor_id como
-- parâmetro do cliente, tornando o actor forjável.
-- Correção: actor_id = auth.uid() internamente; actor_type
-- derivado de auth.uid() IS NULL → 'system' | 'human'.
--
-- IDEMPOTENTE: DO blocks com EXCEPTION para ADD COLUMN/CONSTRAINT,
-- CREATE OR REPLACE para funções.
-- ============================================================

-- ── 1. Coluna actor_type em journey_events ──────────────────
DO $$ BEGIN
  ALTER TABLE journey_events
    ADD COLUMN actor_type text NOT NULL DEFAULT 'human'
    CHECK (actor_type IN ('human', 'agent', 'system'));
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 2. Constraint: actor_type='human' exige actor_id não nulo
-- (sistema/agente pode agir sem actor_id; humano nunca)
DO $$ BEGIN
  ALTER TABLE journey_events
    ADD CONSTRAINT chk_je_human_has_actor
    CHECK (actor_type <> 'human' OR actor_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Dropar assinaturas antigas com p_actor_id (overloads forjáveis)
-- CREATE OR REPLACE não remove overloads com assinaturas diferentes.
DROP FUNCTION IF EXISTS journey_advance(uuid,integer,uuid,uuid,text);
DROP FUNCTION IF EXISTS journey_assign(uuid,integer,uuid,uuid);
DROP FUNCTION IF EXISTS journey_register_touch(uuid,text,uuid,jsonb);
DROP FUNCTION IF EXISTS journey_transfer(uuid,integer,uuid,uuid,uuid,text);
DROP FUNCTION IF EXISTS journey_update_next_step(uuid,integer,text,date,uuid);
DROP FUNCTION IF EXISTS journey_close(uuid,integer,text,uuid,text);

-- ── 4. Recriar as 6 RPCs sem p_actor_id ────────────────────
-- actor_id  = auth.uid()  (NULL para service_role/sistema)
-- actor_type = CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END
-- O cliente não passa actor: o banco sempre atribui corretamente.

CREATE OR REPLACE FUNCTION journey_advance(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_new_stage_id     UUID,
  p_note             TEXT DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur        person_journey;
  v_new        person_journey;
  v_prev       UUID;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_prev       := v_cur.stage_id;
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    stage_id   = p_new_stage_id,
    version    = version + 1,
    updated_at = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'stage_advance',
    v_actor_id,
    v_actor_type,
    jsonb_build_object(
      'from_stage_id', v_prev,
      'to_stage_id',   p_new_stage_id,
      'note',          p_note
    )
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION journey_assign(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_owner_id         UUID
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur        person_journey;
  v_new        person_journey;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    owner_id   = p_owner_id,
    version    = version + 1,
    updated_at = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'owner_assigned',
    v_actor_id,
    v_actor_type,
    jsonb_build_object(
      'previous_owner_id', v_cur.owner_id,
      'new_owner_id',      p_owner_id
    )
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION journey_register_touch(
  p_journey_id  UUID,
  p_touch_type  TEXT,
  p_payload     JSONB DEFAULT '{}'
)
RETURNS journey_events
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur        person_journey;
  v_event      journey_events;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  SELECT * INTO v_cur
  FROM person_journey
  WHERE id = p_journey_id
    AND (
      (auth.role() = 'authenticated' AND church_id = auth_church_id())
      OR auth.role() = 'service_role'
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND_OR_FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (p_journey_id, v_cur.church_id, p_touch_type, v_actor_id, v_actor_type, p_payload)
  RETURNING * INTO v_event;

  UPDATE person_journey
  SET updated_at = NOW()
  WHERE id = p_journey_id;

  RETURN v_event;
END;
$$;

CREATE OR REPLACE FUNCTION journey_transfer(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_new_owner_id     UUID,
  p_new_ministry_id  UUID DEFAULT NULL,
  p_note             TEXT DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur        person_journey;
  v_new        person_journey;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    owner_id    = p_new_owner_id,
    ministry_id = COALESCE(p_new_ministry_id, ministry_id),
    version     = version + 1,
    updated_at  = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'journey_transferred',
    v_actor_id,
    v_actor_type,
    jsonb_build_object(
      'previous_owner_id',    v_cur.owner_id,
      'new_owner_id',         p_new_owner_id,
      'previous_ministry_id', v_cur.ministry_id,
      'new_ministry_id',      p_new_ministry_id,
      'note',                 p_note
    )
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION journey_update_next_step(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_next_step        TEXT,
  p_due_date         DATE DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur        person_journey;
  v_new        person_journey;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    next_step        = p_next_step,
    next_step_due_at = p_due_date,
    version          = version + 1,
    updated_at       = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'next_step_updated',
    v_actor_id,
    v_actor_type,
    jsonb_build_object(
      'next_step',        p_next_step,
      'next_step_due_at', p_due_date
    )
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION journey_close(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_outcome          TEXT,
  p_note             TEXT DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur        person_journey;
  v_new        person_journey;
  v_actor_id   UUID;
  v_actor_type text;
BEGIN
  IF p_outcome IS NULL OR trim(p_outcome) = '' THEN
    RAISE EXCEPTION 'JOURNEY_CLOSE_REQUIRES_OUTCOME'
      USING ERRCODE = 'P0001';
  END IF;

  v_cur        := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_actor_id   := auth.uid();
  v_actor_type := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'human' END;

  UPDATE person_journey
  SET
    closed_at  = NOW(),
    outcome    = p_outcome,
    version    = version + 1,
    updated_at = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, actor_type, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'journey_closed',
    v_actor_id,
    v_actor_type,
    jsonb_build_object(
      'outcome', p_outcome,
      'note',    p_note
    )
  );

  RETURN v_new;
END;
$$;

-- ── 5. Grants (CREATE OR REPLACE mantém os existentes; reafirmar por clareza)
REVOKE EXECUTE ON FUNCTION journey_advance(uuid,integer,uuid,text)          FROM anon, public;
REVOKE EXECUTE ON FUNCTION journey_assign(uuid,integer,uuid)                FROM anon, public;
REVOKE EXECUTE ON FUNCTION journey_register_touch(uuid,text,jsonb)          FROM anon, public;
REVOKE EXECUTE ON FUNCTION journey_transfer(uuid,integer,uuid,uuid,text)    FROM anon, public;
REVOKE EXECUTE ON FUNCTION journey_update_next_step(uuid,integer,text,date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION journey_close(uuid,integer,text,text)            FROM anon, public;

GRANT EXECUTE ON FUNCTION journey_advance(uuid,integer,uuid,text)          TO authenticated;
GRANT EXECUTE ON FUNCTION journey_assign(uuid,integer,uuid)                TO authenticated;
GRANT EXECUTE ON FUNCTION journey_register_touch(uuid,text,jsonb)          TO authenticated;
GRANT EXECUTE ON FUNCTION journey_transfer(uuid,integer,uuid,uuid,text)    TO authenticated;
GRANT EXECUTE ON FUNCTION journey_update_next_step(uuid,integer,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION journey_close(uuid,integer,text,text)            TO authenticated;
