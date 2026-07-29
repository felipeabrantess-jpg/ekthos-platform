-- ============================================================
-- Journey RPCs — Fase 1
-- 6 funções SECURITY DEFINER que mutam person_journey de forma
-- atômica: valida tenant → valida versão → UPDATE → INSERT evento
--
-- Lock otimista: cada RPC recebe p_expected_version e falha com
-- JOURNEY_VERSION_CONFLICT se a versão atual não bater.
-- GRANT EXECUTE apenas para authenticated (nunca anon).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- HELPERS INTERNOS
-- ──────────────────────────────────────────────────────────────

-- Valida acesso da sessão à jornada e retorna o row atual.
-- Lança exceção se: jornada não existe, church incorreta, versão errada.
CREATE OR REPLACE FUNCTION _journey_fetch_and_lock(
  p_journey_id       UUID,
  p_expected_version INTEGER
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row person_journey;
BEGIN
  SELECT * INTO v_row
  FROM person_journey
  WHERE id = p_journey_id
    AND (
      -- authenticated: apenas a própria church
      (auth.role() = 'authenticated' AND church_id = auth_church_id())
      -- service_role: irrestrito
      OR auth.role() = 'service_role'
    )
    AND closed_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'JOURNEY_NOT_FOUND_OR_FORBIDDEN'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_row.version != p_expected_version THEN
    RAISE EXCEPTION 'JOURNEY_VERSION_CONFLICT: expected % got %',
      p_expected_version, v_row.version
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_row;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 1. journey_advance — avança para novo estágio do funil
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journey_advance(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_new_stage_id     UUID,
  p_actor_id         UUID,
  p_note             TEXT DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur  person_journey;
  v_new  person_journey;
  v_prev UUID;
BEGIN
  v_cur  := _journey_fetch_and_lock(p_journey_id, p_expected_version);
  v_prev := v_cur.stage_id;

  UPDATE person_journey
  SET
    stage_id = p_new_stage_id,
    version  = version + 1,
    updated_at = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'stage_advance',
    p_actor_id,
    jsonb_build_object(
      'from_stage_id', v_prev,
      'to_stage_id',   p_new_stage_id,
      'note',          p_note
    )
  );

  RETURN v_new;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 2. journey_assign — atribui responsável pastoral
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journey_assign(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_owner_id         UUID,
  p_actor_id         UUID
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur person_journey;
  v_new person_journey;
BEGIN
  v_cur := _journey_fetch_and_lock(p_journey_id, p_expected_version);

  UPDATE person_journey
  SET
    owner_id   = p_owner_id,
    version    = version + 1,
    updated_at = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'owner_assigned',
    p_actor_id,
    jsonb_build_object(
      'previous_owner_id', v_cur.owner_id,
      'new_owner_id',      p_owner_id
    )
  );

  RETURN v_new;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3. journey_register_touch — registra toque pastoral (sem mutar stage)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journey_register_touch(
  p_journey_id  UUID,
  p_touch_type  TEXT,
  p_actor_id    UUID,
  p_payload     JSONB DEFAULT '{}'
)
RETURNS journey_events
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur   person_journey;
  v_event journey_events;
BEGIN
  -- Não exige versão (evento é sempre append; não altera person_journey)
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

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, payload)
  VALUES (p_journey_id, v_cur.church_id, p_touch_type, p_actor_id, p_payload)
  RETURNING * INTO v_event;

  -- Atualiza last_activity sem incrementar version (toque não é mutação de estado)
  UPDATE person_journey
  SET updated_at = NOW()
  WHERE id = p_journey_id;

  RETURN v_event;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 4. journey_transfer — transfere para outro ministério/pastor
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journey_transfer(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_new_owner_id     UUID,
  p_new_ministry_id  UUID DEFAULT NULL,
  p_actor_id         UUID DEFAULT NULL,
  p_note             TEXT DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur person_journey;
  v_new person_journey;
BEGIN
  v_cur := _journey_fetch_and_lock(p_journey_id, p_expected_version);

  UPDATE person_journey
  SET
    owner_id    = p_new_owner_id,
    ministry_id = COALESCE(p_new_ministry_id, ministry_id),
    version     = version + 1,
    updated_at  = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'journey_transferred',
    p_actor_id,
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

-- ──────────────────────────────────────────────────────────────
-- 5. journey_update_next_step — atualiza próximo passo pastoral
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journey_update_next_step(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_next_step        TEXT,
  p_due_date         DATE DEFAULT NULL,
  p_actor_id         UUID DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur person_journey;
  v_new person_journey;
BEGIN
  v_cur := _journey_fetch_and_lock(p_journey_id, p_expected_version);

  UPDATE person_journey
  SET
    next_step        = p_next_step,
    next_step_due_at = p_due_date,
    version          = version + 1,
    updated_at       = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'next_step_updated',
    p_actor_id,
    jsonb_build_object(
      'next_step',        p_next_step,
      'next_step_due_at', p_due_date
    )
  );

  RETURN v_new;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- 6. journey_close — encerra jornada com outcome
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION journey_close(
  p_journey_id       UUID,
  p_expected_version INTEGER,
  p_outcome          TEXT,
  p_actor_id         UUID DEFAULT NULL,
  p_note             TEXT DEFAULT NULL
)
RETURNS person_journey
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cur person_journey;
  v_new person_journey;
BEGIN
  IF p_outcome IS NULL OR trim(p_outcome) = '' THEN
    RAISE EXCEPTION 'JOURNEY_CLOSE_REQUIRES_OUTCOME'
      USING ERRCODE = 'P0001';
  END IF;

  v_cur := _journey_fetch_and_lock(p_journey_id, p_expected_version);

  UPDATE person_journey
  SET
    closed_at  = NOW(),
    outcome    = p_outcome,
    version    = version + 1,
    updated_at = NOW()
  WHERE id = p_journey_id
  RETURNING * INTO v_new;

  INSERT INTO journey_events (journey_id, church_id, event_type, actor_id, payload)
  VALUES (
    p_journey_id,
    v_cur.church_id,
    'journey_closed',
    p_actor_id,
    jsonb_build_object(
      'outcome', p_outcome,
      'note',    p_note
    )
  );

  RETURN v_new;
END;
$$;

-- ──────────────────────────────────────────────────────────────
-- GRANTS — apenas authenticated (nunca anon)
-- ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION journey_advance          TO authenticated;
GRANT EXECUTE ON FUNCTION journey_assign           TO authenticated;
GRANT EXECUTE ON FUNCTION journey_register_touch   TO authenticated;
GRANT EXECUTE ON FUNCTION journey_transfer         TO authenticated;
GRANT EXECUTE ON FUNCTION journey_update_next_step TO authenticated;
GRANT EXECUTE ON FUNCTION journey_close            TO authenticated;

-- helper interno: apenas service_role pode chamar diretamente
REVOKE ALL ON FUNCTION _journey_fetch_and_lock FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION _journey_fetch_and_lock TO service_role;
