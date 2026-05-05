-- ============================================================
-- Sprint 3A.1 — RPCs de habilitação de agente via cockpit admin
-- admin_grant_agent, admin_revoke_agent, admin_list_grantable_agents
-- ============================================================

-- 1. admin_grant_agent — cria ou atualiza grant para uma igreja
CREATE OR REPLACE FUNCTION public.admin_grant_agent(
  p_church_id                 uuid,
  p_agent_slug                text,
  p_grant_type                text,
  p_duration_days             integer  DEFAULT NULL,
  p_notes                     text     DEFAULT NULL,
  p_stripe_payment_intent_id  text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ends_at   timestamptz;
  v_grant_id  uuid;
BEGIN
  -- Auth: apenas admin Ekthos
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  -- Validar grant_type
  IF p_grant_type NOT IN ('trial', 'courtesy', 'paid') THEN
    RAISE EXCEPTION 'grant_type inválido: %. Use trial, courtesy ou paid.', p_grant_type;
  END IF;

  -- Trial exige duration_days > 0
  IF p_grant_type = 'trial' THEN
    IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
      RAISE EXCEPTION 'trial exige duration_days maior que zero';
    END IF;
    v_ends_at := now() + (p_duration_days || ' days')::interval;
  END IF;

  -- Verificar que o agente existe e está ativo
  IF NOT EXISTS (
    SELECT 1 FROM agents_catalog WHERE slug = p_agent_slug AND active = true
  ) THEN
    RAISE EXCEPTION 'agent_slug inválido ou inativo: %', p_agent_slug;
  END IF;

  -- Verificar que a igreja existe
  IF NOT EXISTS (SELECT 1 FROM churches WHERE id = p_church_id) THEN
    RAISE EXCEPTION 'church_id inválido: %', p_church_id;
  END IF;

  -- Upsert: se já existe grant para esta church+agent, atualiza
  INSERT INTO agent_grants (
    church_id,
    agent_slug,
    grant_type,
    granted_by,
    ends_at,
    notes,
    stripe_payment_intent_id,
    active,
    revoked_at,
    revoked_by
  ) VALUES (
    p_church_id,
    p_agent_slug,
    p_grant_type,
    auth.uid(),
    v_ends_at,
    p_notes,
    p_stripe_payment_intent_id,
    true,
    NULL,
    NULL
  )
  ON CONFLICT (church_id, agent_slug) DO UPDATE SET
    grant_type               = EXCLUDED.grant_type,
    granted_by               = EXCLUDED.granted_by,
    ends_at                  = EXCLUDED.ends_at,
    notes                    = EXCLUDED.notes,
    stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    active                   = true,
    revoked_at               = NULL,
    revoked_by               = NULL,
    starts_at                = now(),
    updated_at               = now()
  RETURNING id INTO v_grant_id;

  RETURN jsonb_build_object('ok', true, 'grant_id', v_grant_id);
END;
$$;

-- 2. admin_revoke_agent — revoga grant ativo
CREATE OR REPLACE FUNCTION public.admin_revoke_agent(
  p_church_id  uuid,
  p_agent_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  UPDATE agent_grants
  SET    active     = false,
         revoked_at = now(),
         revoked_by = auth.uid(),
         updated_at = now()
  WHERE  church_id  = p_church_id
    AND  agent_slug = p_agent_slug
    AND  active     = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant não encontrado ou já inativo para church_id=% agent_slug=%',
      p_church_id, p_agent_slug;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. admin_list_grantable_agents — catálogo + status de grant para uma igreja
CREATE OR REPLACE FUNCTION public.admin_list_grantable_agents(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'slug',         ac.slug,
        'name',         ac.name,
        'pricing_tier', ac.pricing_tier,
        'price_cents',  ac.price_cents,
        'category',     ac.category,
        'grant', CASE
          WHEN ag.id IS NOT NULL THEN jsonb_build_object(
            'id',         ag.id,
            'grant_type', ag.grant_type,
            'active',     ag.active,
            'starts_at',  ag.starts_at,
            'ends_at',    ag.ends_at,
            'notes',      ag.notes
          )
          ELSE NULL
        END
      )
      ORDER BY ac.name
    ), '[]'::jsonb)
    FROM agents_catalog ac
    LEFT JOIN agent_grants ag
      ON  ag.agent_slug = ac.slug
      AND ag.church_id  = p_church_id
      AND ag.active     = true
    WHERE ac.active = true
  );
END;
$$;

-- Grants de execução para admin autenticado
GRANT EXECUTE ON FUNCTION public.admin_grant_agent       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_agent      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_grantable_agents TO authenticated;

-- Revogar acesso de anon e PUBLIC (defense-in-depth — is_ekthos_admin() já protege)
REVOKE EXECUTE ON FUNCTION public.admin_grant_agent(uuid, text, text, integer, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_revoke_agent(uuid, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_list_grantable_agents(uuid) FROM anon, PUBLIC;
