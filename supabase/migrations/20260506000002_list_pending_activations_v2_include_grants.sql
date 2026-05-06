-- list_pending_activations v2 — UNION subscription_agents + agent_grants
-- Inclui grants manuais (cortesia/trial/pago manual) que ainda não têm config preenchida.
-- "pending_config" é status virtual (não gravado no banco).

CREATE OR REPLACE FUNCTION public.list_pending_activations()
RETURNS TABLE(
  sa_id              uuid,
  subscription_id    uuid,
  church_id          uuid,
  church_name        text,
  agent_slug         text,
  agent_name         text,
  activation_status  text,
  package_type       text,
  credits_balance    integer,
  credits_total      integer,
  metadata           jsonb,
  created_at         timestamp with time zone,
  notification_id    uuid,
  notification_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  RETURN QUERY

  -- Bloco 1: Stripe (subscription_agents) — comportamento original
  SELECT
    sa.id,
    sa.subscription_id,
    s.church_id,
    c.name::TEXT,
    sa.agent_slug::TEXT,
    ac.name::TEXT,
    sa.activation_status::TEXT,
    sa.package_type::TEXT,
    sa.credits_balance,
    sa.credits_total,
    sa.metadata,
    sa.created_at,
    n.id,
    n.status::TEXT
  FROM subscription_agents sa
  JOIN subscriptions s  ON s.id  = sa.subscription_id
  JOIN churches      c  ON c.id  = s.church_id
  LEFT JOIN agents_catalog ac ON ac.slug = sa.agent_slug
  LEFT JOIN internal_notifications n
         ON n.subscription_id = sa.id
        AND n.notification_type = 'agent_purchase_pending'
  WHERE sa.activation_status IN ('pending_activation', 'in_setup')

  UNION ALL

  -- Bloco 2: Grants manuais (agent_grants) sem configuração preenchida
  SELECT
    ag.id,
    NULL::uuid,                     -- sem subscription_id
    ag.church_id,
    c.name::TEXT,
    ag.agent_slug::TEXT,
    ac.name::TEXT,
    'pending_config'::TEXT,         -- status virtual
    ag.grant_type::TEXT,            -- reutiliza package_type para exibir cortesia/trial/paid
    NULL::integer,
    NULL::integer,
    NULL::jsonb,
    ag.created_at,
    NULL::uuid,
    NULL::TEXT
  FROM agent_grants ag
  JOIN churches c ON c.id = ag.church_id
  LEFT JOIN agents_catalog ac ON ac.slug = ag.agent_slug
  LEFT JOIN church_agent_config cac
         ON cac.church_id = ag.church_id
        AND cac.agent_slug = ag.agent_slug
  WHERE ag.active = true
    AND ag.revoked_at IS NULL
    AND (ag.ends_at IS NULL OR ag.ends_at > now())   -- exclui trials expirados
    -- AND logic intencional: ambos os campos devem estar ausentes/vazios para considerar "sem config"
    -- (agent_name preenchido OU custom_instructions > 50 chars = configurado, sai da fila)
    AND (
      cac.agent_name IS NULL
      AND (cac.custom_instructions IS NULL OR length(cac.custom_instructions) <= 50)
    )

  ORDER BY created_at DESC;
END;
$$;
