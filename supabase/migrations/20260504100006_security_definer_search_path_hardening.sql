-- Migration: security_definer_search_path_hardening
-- Achado I5 — auditoria de segurança 03-04/05/2026
--
-- Problema:
--   15 funções SECURITY DEFINER não possuem SET search_path explícito.
--   Sem search_path fixo, um atacante com CREATE privilege pode criar
--   objetos em schemas precedentes ao 'public' no search_path padrão,
--   fazendo substituição de funções/tipos referenciados (search_path injection).
--   Além disso, extensões no schema 'extensions' (pg_net, pgcrypto) ficam
--   inacessíveis sem search_path qualificado — como ocorreu com
--   gen_random_bytes em upsert_session_token (corrigido em migration 000005).
--
-- Fix:
--   CREATE OR REPLACE de cada função com SET search_path = public, extensions
--   Idempotente: pode ser aplicado múltiplas vezes sem efeito colateral.
--   Não altera corpo, assinatura, grants ou dependências das funções.
--
-- Funções: 15 total
--   _is_ekthos_admin, activate_agent, auth_can_all_people, auth_can_financial,
--   auth_church_id, auth_user_role, cancel_agent, create_default_pipeline_stages,
--   get_church_agent_config, is_ekthos_admin, list_pending_activations,
--   pause_agent, start_agent_setup, trigger_n8n_pipeline,
--   upsert_church_agent_config

-- ── 1. _is_ekthos_admin() ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._is_ekthos_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_uid UUID;
  v_is_admin BOOLEAN := false;
BEGIN
  v_uid := auth.uid();

  -- Sem sessão autenticada → false
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  -- Verifica em raw_app_meta_data (fonte da verdade)
  SELECT
    COALESCE(
      (raw_app_meta_data ->> 'is_ekthos_admin')::boolean,
      (raw_user_meta_data ->> 'is_ekthos_admin')::boolean,
      false
    )
  INTO v_is_admin
  FROM auth.users
  WHERE id = v_uid;

  RETURN COALESCE(v_is_admin, false);
END;
$$;

-- ── 2. activate_agent(uuid) ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.activate_agent(p_sa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin UUID := auth.uid();
BEGIN
  IF NOT _is_ekthos_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE subscription_agents
  SET activation_status = 'active',
      active            = true,
      updated_at        = now(),
      metadata          = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                            'activated_by', v_admin::text,
                            'activated_at', now()::text
                          )
  WHERE id = p_sa_id
    AND activation_status = 'in_setup';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou não está em in_setup.';
  END IF;

  UPDATE internal_notifications
  SET status      = 'resolved',
      resolved_by = v_admin,
      resolved_at = now(),
      updated_at  = now()
  WHERE subscription_id = p_sa_id
    AND status = 'in_progress';

  RETURN jsonb_build_object('ok', true, 'sa_id', p_sa_id);
END;
$$;

-- ── 3. auth_can_all_people() ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_can_all_people()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    auth_user_role() IN (
      'admin', 'admin_departments', 'pastor_celulas', 'secretary'
    ),
    false
  )
$$;

-- ── 4. auth_can_financial() ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_can_financial()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    auth_user_role() IN ('admin', 'treasurer'),
    false
  )
$$;

-- ── 5. auth_church_id() ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_church_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid
$$;

-- ── 6. auth_user_role() ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS app_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT role
  FROM user_roles
  WHERE user_id = auth.uid()
    AND church_id = auth_church_id()
  LIMIT 1
$$;

-- ── 7. cancel_agent(uuid) ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_agent(p_sa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_admin UUID := auth.uid();
BEGIN
  IF NOT _is_ekthos_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

  UPDATE subscription_agents
  SET activation_status = 'cancelled', active = false,
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) ||
        jsonb_build_object('cancelled_by', v_admin::text, 'cancelled_at', now()::text)
  WHERE id = p_sa_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 8. create_default_pipeline_stages(uuid) ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages(p_church_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  INSERT INTO pipeline_stages
    (church_id, name, slug, order_index, sla_hours, days_until_followup, auto_followup)
  VALUES
    (p_church_id, 'Visitante',                'visitante',               1,   24, 1,  true),
    (p_church_id, 'Contato de boas-vindas',   'contato-boas-vindas',     2,   72, 3,  true),
    (p_church_id, 'Convidado para célula',    'convidado-celula',        3, NULL, 7,  true),
    (p_church_id, 'Frequentando célula',      'frequentando-celula',     4, NULL, 14, true),
    (p_church_id, 'Escola da Fé',             'escola-da-fe',            5, NULL, 30, false),
    (p_church_id, 'Formado Escola da Fé',     'formado-escola-fe',       6, NULL, 3,  true),
    (p_church_id, 'Batismo',                  'batismo',                 7, NULL, 7,  true),
    (p_church_id, 'Membro ativo',             'membro-ativo',            8, NULL, 30, false),
    (p_church_id, 'Servindo em departamento', 'servindo-departamento',   9, NULL, 0,  false),
    (p_church_id, 'Líder em treinamento',     'lider-treinamento',      10, NULL, 0,  false),
    (p_church_id, 'Líder de célula',          'lider-celula',           11, NULL, 0,  false)
  ON CONFLICT (church_id, slug) DO UPDATE
    SET
      name                = EXCLUDED.name,
      order_index         = EXCLUDED.order_index,
      sla_hours           = EXCLUDED.sla_hours,
      days_until_followup = EXCLUDED.days_until_followup,
      auto_followup       = EXCLUDED.auto_followup;

  DELETE FROM pipeline_stages
  WHERE church_id = p_church_id
    AND slug IN ('interesse-grupo', 'em-acompanhamento', 'membro', 'lider', 'inativo')
    AND NOT EXISTS (
      SELECT 1 FROM person_pipeline pp
      WHERE pp.stage_id = pipeline_stages.id
    );

  INSERT INTO church_settings (church_id)
  VALUES (p_church_id)
  ON CONFLICT (church_id) DO NOTHING;
END;
$$;

-- ── 9. get_church_agent_config(uuid, text) ────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_church_agent_config(p_church_id uuid, p_agent_slug text)
RETURNS TABLE(
  church_id          uuid,
  agent_slug         text,
  custom_instructions text,
  formality          text,
  denomination       text,
  updated_by         uuid,
  created_at         timestamp with time zone,
  updated_at         timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  SELECT COALESCE((raw_app_meta_data->>'is_ekthos_admin')::boolean, false)
  INTO v_is_admin FROM auth.users WHERE id = auth.uid();

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin Ekthos.';
  END IF;

  RETURN QUERY
  SELECT
    cac.church_id::uuid,
    cac.agent_slug::text,
    cac.custom_instructions::text,
    cac.formality::text,
    cac.denomination::text,
    cac.updated_by::uuid,
    cac.created_at::timestamptz,
    cac.updated_at::timestamptz
  FROM public.church_agent_config cac
  WHERE cac.church_id = p_church_id
    AND cac.agent_slug = p_agent_slug;
END;
$$;

-- ── 10. is_ekthos_admin() ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_ekthos_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    COALESCE(
      (auth.jwt() -> 'user_metadata' ->> 'is_ekthos_admin')::boolean,
      (auth.jwt() -> 'app_metadata'  ->> 'is_ekthos_admin')::boolean,
      false
    )
$$;

-- ── 11. list_pending_activations() ───────────────────────────────────────────

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
  ORDER BY sa.created_at DESC;
END;
$$;

-- ── 12. pause_agent(uuid) ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pause_agent(p_sa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE v_admin UUID := auth.uid();
BEGIN
  IF NOT _is_ekthos_admin() THEN RAISE EXCEPTION 'Acesso negado.'; END IF;

  UPDATE subscription_agents
  SET activation_status = 'paused', active = false,
      updated_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) ||
        jsonb_build_object('paused_by', v_admin::text, 'paused_at', now()::text)
  WHERE id = p_sa_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── 13. start_agent_setup(uuid, text) ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.start_agent_setup(p_sa_id uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin UUID := auth.uid();
BEGIN
  IF NOT _is_ekthos_admin() THEN
    RAISE EXCEPTION 'Acesso negado.';
  END IF;

  UPDATE subscription_agents
  SET activation_status = 'in_setup',
      updated_at        = now(),
      metadata          = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                            'setup_started_by', v_admin::text,
                            'setup_started_at', now()::text,
                            'setup_notes',      p_notes
                          )
  WHERE id = p_sa_id
    AND activation_status = 'pending_activation';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registro não encontrado ou já em outro estado.';
  END IF;

  UPDATE internal_notifications
  SET status      = 'in_progress',
      assigned_to = v_admin,
      updated_at  = now()
  WHERE subscription_id = p_sa_id
    AND notification_type = 'agent_purchase_pending'
    AND status = 'pending';

  RETURN jsonb_build_object('ok', true, 'sa_id', p_sa_id);
END;
$$;

-- ── 14. trigger_n8n_pipeline() ───────────────────────────────────────────────
-- NOTA: trigger_n8n_pipeline usa net.http_post do pg_net (schema 'extensions').
--   Este é exatamente o caso de uso para SET search_path = public, extensions.

CREATE OR REPLACE FUNCTION public.trigger_n8n_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url TEXT;
BEGIN
  SELECT pipeline_url INTO v_url
  FROM n8n_webhooks
  WHERE church_id = NEW.church_id AND is_active = true;

  IF v_url IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    body    := convert_to(
      jsonb_build_object(
        'event',      'pipeline_' || lower(TG_OP),
        'church_id',  NEW.church_id,
        'person_id',  NEW.person_id,
        'stage_id',   NEW.stage_id,
        'entered_at', NEW.entered_at,
        'loss_reason', NEW.loss_reason,
        'ts',         now()
      )::text,
      'UTF8'
    ),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 5000
  );

  RETURN NEW;
END;
$$;

-- ── 15. upsert_church_agent_config(uuid, text, text) ─────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_agent_config(
  p_church_id          uuid,
  p_agent_slug         text,
  p_custom_instructions text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id uuid;
  v_is_admin boolean := false;
BEGIN
  v_admin_id := auth.uid();

  SELECT COALESCE((raw_app_meta_data->>'is_ekthos_admin')::boolean, false)
  INTO v_is_admin FROM auth.users WHERE id = v_admin_id;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Acesso negado: apenas admin Ekthos.';
  END IF;

  IF p_church_id IS NULL OR p_agent_slug IS NULL THEN
    RAISE EXCEPTION 'church_id e agent_slug são obrigatórios.';
  END IF;

  INSERT INTO public.church_agent_config (
    church_id, agent_slug, custom_instructions, updated_by
  )
  VALUES (
    p_church_id, p_agent_slug, p_custom_instructions, v_admin_id
  )
  ON CONFLICT (church_id, agent_slug)
  DO UPDATE SET
    custom_instructions = EXCLUDED.custom_instructions,
    updated_by          = EXCLUDED.updated_by,
    updated_at          = now();

  RETURN jsonb_build_object(
    'ok',         true,
    'church_id',  p_church_id,
    'agent_slug', p_agent_slug
  );
END;
$$;
