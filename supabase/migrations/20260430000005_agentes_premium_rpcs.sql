-- =============================================================
-- AGENTES PREMIUM — 5 RPCs SECURITY DEFINER
-- Sprint 1 — 30/04/2026
--
-- 1. debit_agent_credits    — cobrança atômica com FOR UPDATE
-- 2. renew_agent_credit_cycles — renovação mensal (chamado por cron)
-- 3. check_credit_thresholds  — detecta 70/90/100% uso
-- 4. pause_agents_at_zero     — auto-pause em saldo zero
-- 5. apply_credit_topup       — recarga avulsa via pacote
-- =============================================================

-- RPC 1: Cobrança atômica de créditos
CREATE OR REPLACE FUNCTION debit_agent_credits(
  p_church_id uuid,
  p_agent_slug text,
  p_credits numeric,
  p_operation_type text,
  p_related_entity_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text;
  v_cycle_remaining numeric;
  v_topup_remaining numeric;
  v_total_balance numeric;
  v_debit_from_cycle numeric;
  v_debit_from_topup numeric;
BEGIN
  -- Determina escopo: pool (se tem subscription pool) ou slug do agente
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM church_agent_subscriptions
      WHERE church_id = p_church_id
        AND plan_slug LIKE 'pool-%'
        AND active = true
    ) THEN 'pool'
    ELSE p_agent_slug
  END INTO v_scope;

  -- Lê saldo atual com lock para evitar race condition
  SELECT cycle_credits, topup_credits
  INTO v_cycle_remaining, v_topup_remaining
  FROM church_agent_credits
  WHERE church_id = p_church_id AND agent_scope = v_scope
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_subscription', 'scope', v_scope);
  END IF;

  v_total_balance := v_cycle_remaining + v_topup_remaining;

  IF v_total_balance < p_credits THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'balance', v_total_balance,
      'requested', p_credits,
      'scope', v_scope
    );
  END IF;

  -- Debita primeiro do ciclo, depois do topup
  IF v_cycle_remaining >= p_credits THEN
    v_debit_from_cycle := p_credits;
    v_debit_from_topup := 0;
  ELSE
    v_debit_from_cycle := v_cycle_remaining;
    v_debit_from_topup := p_credits - v_cycle_remaining;
  END IF;

  UPDATE church_agent_credits
  SET cycle_credits = cycle_credits - v_debit_from_cycle,
      topup_credits = topup_credits - v_debit_from_topup,
      updated_at = now()
  WHERE church_id = p_church_id AND agent_scope = v_scope;

  -- Log consumo do ciclo
  IF v_debit_from_cycle > 0 THEN
    INSERT INTO agent_credit_usage (church_id, agent_slug, operation_type, credits_consumed, source, related_entity_id, description)
    VALUES (p_church_id, p_agent_slug, p_operation_type, v_debit_from_cycle, 'cycle', p_related_entity_id, p_description);
  END IF;

  -- Log consumo do topup
  IF v_debit_from_topup > 0 THEN
    INSERT INTO agent_credit_usage (church_id, agent_slug, operation_type, credits_consumed, source, related_entity_id, description)
    VALUES (p_church_id, p_agent_slug, p_operation_type, v_debit_from_topup, 'topup', p_related_entity_id, p_description);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'debited_from_cycle', v_debit_from_cycle,
    'debited_from_topup', v_debit_from_topup,
    'remaining', v_total_balance - p_credits
  );
END;
$$;

-- RPC 2: Renovação mensal de ciclos
CREATE OR REPLACE FUNCTION renew_agent_credit_cycles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_renewed int := 0;
BEGIN
  UPDATE church_agent_credits cac
  SET cycle_credits = acp.monthly_credits,
      cycle_start = now(),
      cycle_end = now() + interval '1 month',
      updated_at = now()
  FROM church_agent_subscriptions cas
  JOIN agent_credit_plans acp ON acp.slug = cas.plan_slug
  WHERE cac.church_id = cas.church_id
    AND cas.active = true
    AND cac.cycle_end <= now();

  GET DIAGNOSTICS v_renewed = ROW_COUNT;

  -- Remove pausa por quota após renovação
  UPDATE church_agent_subscriptions
  SET paused_by_quota = false
  WHERE paused_by_quota = true AND active = true;

  RETURN jsonb_build_object('ok', true, 'renewed', v_renewed);
END;
$$;

-- RPC 3: Verificação de thresholds (70%, 90%, 100%)
CREATE OR REPLACE FUNCTION check_credit_thresholds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alerts_70 int := 0;
  v_alerts_90 int := 0;
  v_alerts_100 int := 0;
BEGIN
  -- Threshold 70%
  WITH usage_pct AS (
    SELECT cac.church_id, cac.agent_scope, cac.cycle_start,
           acp.monthly_credits AS max_credits,
           (acp.monthly_credits - cac.cycle_credits) AS used
    FROM church_agent_credits cac
    JOIN church_agent_subscriptions cas
      ON cas.church_id = cac.church_id
      AND (cas.plan_slug = cac.agent_scope OR (cas.plan_slug LIKE 'pool-%' AND cac.agent_scope = 'pool'))
    JOIN agent_credit_plans acp ON acp.slug = cas.plan_slug
    WHERE cas.active = true
  )
  INSERT INTO agent_credit_alerts (church_id, agent_scope, cycle_start, threshold_70_at)
  SELECT u.church_id, u.agent_scope, u.cycle_start, now()
  FROM usage_pct u
  LEFT JOIN agent_credit_alerts a
    ON a.church_id = u.church_id
    AND a.agent_scope = u.agent_scope
    AND a.cycle_start = u.cycle_start
  WHERE u.max_credits > 0
    AND u.used::float / u.max_credits >= 0.70
    AND a.threshold_70_at IS NULL
  ON CONFLICT (church_id, agent_scope, cycle_start)
  DO UPDATE SET threshold_70_at = COALESCE(agent_credit_alerts.threshold_70_at, now());

  GET DIAGNOSTICS v_alerts_70 = ROW_COUNT;

  -- Threshold 90%
  WITH usage_pct AS (
    SELECT cac.church_id, cac.agent_scope, cac.cycle_start,
           acp.monthly_credits AS max_credits,
           (acp.monthly_credits - cac.cycle_credits) AS used
    FROM church_agent_credits cac
    JOIN church_agent_subscriptions cas
      ON cas.church_id = cac.church_id
      AND (cas.plan_slug = cac.agent_scope OR (cas.plan_slug LIKE 'pool-%' AND cac.agent_scope = 'pool'))
    JOIN agent_credit_plans acp ON acp.slug = cas.plan_slug
    WHERE cas.active = true
  )
  INSERT INTO agent_credit_alerts (church_id, agent_scope, cycle_start, threshold_90_at)
  SELECT u.church_id, u.agent_scope, u.cycle_start, now()
  FROM usage_pct u
  LEFT JOIN agent_credit_alerts a
    ON a.church_id = u.church_id
    AND a.agent_scope = u.agent_scope
    AND a.cycle_start = u.cycle_start
  WHERE u.max_credits > 0
    AND u.used::float / u.max_credits >= 0.90
    AND a.threshold_90_at IS NULL
  ON CONFLICT (church_id, agent_scope, cycle_start)
  DO UPDATE SET threshold_90_at = COALESCE(agent_credit_alerts.threshold_90_at, now());

  GET DIAGNOSTICS v_alerts_90 = ROW_COUNT;

  -- Threshold 100%
  WITH usage_pct AS (
    SELECT cac.church_id, cac.agent_scope, cac.cycle_start,
           acp.monthly_credits AS max_credits,
           (acp.monthly_credits - cac.cycle_credits) AS used
    FROM church_agent_credits cac
    JOIN church_agent_subscriptions cas
      ON cas.church_id = cac.church_id
      AND (cas.plan_slug = cac.agent_scope OR (cas.plan_slug LIKE 'pool-%' AND cac.agent_scope = 'pool'))
    JOIN agent_credit_plans acp ON acp.slug = cas.plan_slug
    WHERE cas.active = true
  )
  INSERT INTO agent_credit_alerts (church_id, agent_scope, cycle_start, threshold_100_at)
  SELECT u.church_id, u.agent_scope, u.cycle_start, now()
  FROM usage_pct u
  LEFT JOIN agent_credit_alerts a
    ON a.church_id = u.church_id
    AND a.agent_scope = u.agent_scope
    AND a.cycle_start = u.cycle_start
  WHERE u.max_credits > 0
    AND u.used::float / u.max_credits >= 1.0
    AND a.threshold_100_at IS NULL
  ON CONFLICT (church_id, agent_scope, cycle_start)
  DO UPDATE SET threshold_100_at = COALESCE(agent_credit_alerts.threshold_100_at, now());

  GET DIAGNOSTICS v_alerts_100 = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'alerts_70', v_alerts_70,
    'alerts_90', v_alerts_90,
    'alerts_100', v_alerts_100
  );
END;
$$;

-- RPC 4: Auto-pause de subscriptions em saldo zero
CREATE OR REPLACE FUNCTION pause_agents_at_zero()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused int := 0;
BEGIN
  UPDATE church_agent_subscriptions cas
  SET paused_by_quota = true
  FROM church_agent_credits cac
  WHERE cas.church_id = cac.church_id
    AND cas.active = true
    AND cas.paused_by_quota = false
    AND (cac.cycle_credits + cac.topup_credits) <= 0;

  GET DIAGNOSTICS v_paused = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'paused', v_paused);
END;
$$;

-- RPC 5: Aplicar recarga avulsa
CREATE OR REPLACE FUNCTION apply_credit_topup(
  p_church_id uuid,
  p_package_slug text,
  p_stripe_invoice_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pkg credit_packages%ROWTYPE;
  v_scope text;
BEGIN
  SELECT * INTO v_pkg FROM credit_packages WHERE slug = p_package_slug AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'package_not_found');
  END IF;

  -- Determina escopo (pool ou avulso)
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM church_agent_subscriptions
      WHERE church_id = p_church_id AND plan_slug LIKE 'pool-%' AND active = true
    ) THEN 'pool'
    ELSE 'avulso'
  END INTO v_scope;

  -- Registra compra
  INSERT INTO credit_topup_purchases (
    church_id, package_slug, credits_purchased, credits_remaining,
    purchase_price_cents, expires_at, stripe_invoice_id
  )
  VALUES (
    p_church_id, p_package_slug, v_pkg.credits, v_pkg.credits,
    v_pkg.price_cents, now() + (v_pkg.ttl_days || ' days')::interval, p_stripe_invoice_id
  );

  -- Adiciona créditos ao saldo (upsert se registro não existir)
  INSERT INTO church_agent_credits (church_id, agent_scope, topup_credits, cycle_credits, cycle_start, cycle_end)
  VALUES (p_church_id, v_scope, v_pkg.credits, 0, now(), now() + interval '1 month')
  ON CONFLICT (church_id, agent_scope)
  DO UPDATE SET
    topup_credits = church_agent_credits.topup_credits + v_pkg.credits,
    updated_at = now();

  -- Remove pausa por quota (recarga reativa)
  UPDATE church_agent_subscriptions
  SET paused_by_quota = false
  WHERE church_id = p_church_id AND paused_by_quota = true;

  RETURN jsonb_build_object(
    'ok', true,
    'credits_added', v_pkg.credits,
    'scope', v_scope
  );
END;
$$;
