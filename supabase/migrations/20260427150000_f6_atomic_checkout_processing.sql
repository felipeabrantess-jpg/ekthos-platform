-- ============================================================
-- F6: Funções SQL de processamento atômico do webhook Stripe
-- ============================================================
-- 4 funções SECURITY DEFINER que encapsulam toda a lógica de
-- escrita do webhook numa única transação Postgres.
-- O webhook (EF) chama via supabase.rpc() e trata Auth/Stripe API
-- fora da transação (não-fatais).
--
-- Funções criadas:
--   1. process_stripe_checkout_completed(payload jsonb)
--      → INSERT churches + subscriptions + profiles + user_roles
--      → grant_access() → UPDATE coupon_redemptions se houver cupom
--   2. process_subscription_updated(payload jsonb)
--      → UPDATE subscriptions (status, período, cancel_at_period_end)
--   3. process_subscription_deleted(payload jsonb)
--      → UPDATE subscriptions (status=canceled)
--      → UPDATE access_grants (active=false, ends_at=now())
--      → UPDATE churches (status=suspended)
--   4. process_invoice_payment_failed(payload jsonb)
--      → UPDATE subscriptions (status=past_due)
--
-- Decisões F6 (Felipe 27/04/2026):
--   A1: profiles criado explicitamente (zero triggers em auth.users)
--   A2: user_roles role='admin' criado para o pastor
--   A3: cancel_at_period_end não revoga grant (só subscription.deleted)
--   A4: payment_failed não revoga grant (Stripe gerencia retry/dunning)
-- ============================================================

-- ── 1. process_stripe_checkout_completed ─────────────────────

CREATE OR REPLACE FUNCTION public.process_stripe_checkout_completed(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Payload fields
  v_session_id           text;
  v_stripe_event_id      text;
  v_stripe_sub_id        text;
  v_stripe_customer_id   text;
  v_church_name          text;
  v_church_slug          text;
  v_plan_slug            text;
  v_user_id              uuid;
  v_billing_origin       varchar;
  v_original_price_cents integer;
  v_discount_cents       integer;
  v_coupon_id            uuid;
  v_redemption_id        uuid;

  -- Result vars
  v_church_id   uuid;
  v_sub_id      uuid;
  v_grant_id    uuid;
BEGIN
  -- ── Extrair campos do payload ───────────────────────────────
  v_session_id           := p_payload->>'session_id';
  v_stripe_event_id      := p_payload->>'stripe_event_id';
  v_stripe_sub_id        := p_payload->>'stripe_subscription_id';
  v_stripe_customer_id   := p_payload->>'stripe_customer_id';
  v_church_name          := p_payload->>'church_name';
  v_church_slug          := p_payload->>'church_slug';
  v_plan_slug            := COALESCE(p_payload->>'plan_slug', 'chamado');
  v_billing_origin       := COALESCE(p_payload->>'billing_origin', 'stripe');
  v_original_price_cents := COALESCE((p_payload->>'original_price_cents')::integer, 0);
  v_discount_cents       := COALESCE((p_payload->>'discount_cents')::integer, 0);

  -- Campos opcionais (NULL se ausentes)
  v_user_id       := NULLIF(p_payload->>'user_id', '')::uuid;
  v_coupon_id     := NULLIF(p_payload->>'coupon_id', '')::uuid;
  v_redemption_id := NULLIF(p_payload->>'redemption_id', '')::uuid;

  -- ── Validações básicas ──────────────────────────────────────
  IF v_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'session_id is required');
  END IF;
  IF v_church_name IS NULL OR v_church_slug IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'church_name and church_slug are required');
  END IF;

  -- ── Idempotência: session já processada? ────────────────────
  SELECT s.church_id INTO v_church_id
  FROM subscriptions s
  WHERE s.stripe_checkout_session_id = v_session_id
  LIMIT 1;

  IF v_church_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success',          true,
      'already_processed', true,
      'church_id',        v_church_id,
      'session_id',       v_session_id
    );
  END IF;

  -- ── 1. INSERT church ────────────────────────────────────────
  -- status='onboarding': pastor pagou, ainda não configurou.
  -- subscription_plan preenchido por retrocompatibilidade (coluna
  -- deprecated F2, mas ainda usada por algumas telas do Cockpit).
  INSERT INTO churches (name, slug, status, subscription_plan)
  VALUES (v_church_name, v_church_slug, 'onboarding', v_plan_slug)
  RETURNING id INTO v_church_id;

  -- ── 2. INSERT subscription (com todos os campos F2) ─────────
  -- effective_price_cents = original - discount (preço efetivo mensal)
  INSERT INTO subscriptions (
    church_id,
    plan_slug,
    status,
    stripe_subscription_id,
    stripe_customer_id,
    stripe_checkout_session_id,
    billing_origin,
    effective_price_cents,
    discount_cents,
    applied_coupon_id,
    created_by
  )
  VALUES (
    v_church_id,
    v_plan_slug,
    'active',
    v_stripe_sub_id,
    v_stripe_customer_id,
    v_session_id,
    v_billing_origin,
    v_original_price_cents - v_discount_cents,
    v_discount_cents,
    v_coupon_id,
    v_user_id   -- NULL ok (pastor ainda não tem auth.users.id na landing)
  )
  RETURNING id INTO v_sub_id;

  -- ── 3. INSERT profiles + user_roles (decisões A1 e A2) ──────
  -- Só executa se o Edge Function já chamou inviteUserByEmail e
  -- passou user_id. Se NULL, admin corrige manualmente via Cockpit.
  IF v_user_id IS NOT NULL THEN
    INSERT INTO profiles (user_id, church_id)
    VALUES (v_user_id, v_church_id)
    ON CONFLICT (user_id, church_id) DO NOTHING;

    -- UNIQUE (user_id, church_id) em user_roles — ON CONFLICT seguro
    INSERT INTO user_roles (user_id, church_id, role)
    VALUES (v_user_id, v_church_id, 'admin')
    ON CONFLICT (user_id, church_id) DO NOTHING;
  END IF;

  -- ── 4. Criar access_grant via grant_access() ─────────────────
  -- grant_access() já escreve audit_log automaticamente (F1).
  -- ends_at = NULL: grant perpetuo até subscription.deleted.
  -- chk_paid_requires_subscription: passamos v_sub_id (criado acima).
  SELECT grant_access(
    v_church_id,                  -- p_church_id
    v_plan_slug,                  -- p_plan_slug
    'paid',                       -- p_grant_type
    'stripe',                     -- p_source
    v_sub_id,                     -- p_subscription_id (NOT NULL: satisfaz chk_paid_requires_subscription)
    now(),                        -- p_starts_at
    NULL,                         -- p_ends_at (perpetuo)
    'stripe_checkout_completed',  -- p_granted_reason
    v_session_id,                 -- p_notes (session_id para rastreabilidade)
    v_user_id,                    -- p_granted_by (NULL ok se pastor ainda não tem UUID)
    NULL,                         -- p_affiliate_id
    false                         -- p_converts_to_paid
  ) INTO v_grant_id;

  -- ── 5. Atualizar coupon_redemptions (se checkout veio com cupom) ─
  -- O edge function passou redemption_id = ID da entry em 'attempted'
  -- criada pelo coupon-validate antes do checkout.
  -- Atualiza: status='redeemed', preenche church_id e stripe IDs.
  IF v_redemption_id IS NOT NULL THEN
    UPDATE coupon_redemptions
    SET
      status                     = 'redeemed',
      church_id                  = v_church_id,
      stripe_checkout_session_id = v_session_id,
      stripe_subscription_id     = v_stripe_sub_id,
      redeemed_at                = now()
    WHERE id      = v_redemption_id
      AND status  = 'attempted';   -- guard: não atualizar se já redeemed (idempotência)
  END IF;

  -- ── 6. Incrementar coupons.times_redeemed ───────────────────
  -- Separado de coupon_redemptions para manter counter consistente.
  -- chk_redemptions_limit: times_redeemed <= max_redemptions.
  -- Se max_redemptions foi atingido entre o validate e o checkout
  -- (race condition rara), o CHECK vai lançar exceção → rollback tudo.
  IF v_coupon_id IS NOT NULL THEN
    UPDATE coupons
    SET times_redeemed = times_redeemed + 1
    WHERE id = v_coupon_id;
  END IF;

  -- ── 7. Audit log do evento de checkout ─────────────────────
  -- grant_access() já escreveu log do grant.
  -- Este log é do evento Stripe em si (rastreabilidade do webhook).
  INSERT INTO audit_logs (
    church_id,   entity_type,    entity_id, action,
    actor_type,  actor_id,       payload
  )
  VALUES (
    v_church_id,
    'subscription',
    v_sub_id,
    'stripe_checkout_completed_processed',
    'system',
    'stripe_webhook_v10',
    jsonb_build_object(
      'stripe_event_id',       v_stripe_event_id,
      'session_id',            v_session_id,
      'stripe_sub_id',         v_stripe_sub_id,
      'plan_slug',             v_plan_slug,
      'billing_origin',        v_billing_origin,
      'effective_price_cents', v_original_price_cents - v_discount_cents,
      'discount_cents',        v_discount_cents,
      'grant_id',              v_grant_id,
      'coupon_id',             v_coupon_id,
      'redemption_id',         v_redemption_id,
      'user_id',               v_user_id
    )
  );

  RETURN jsonb_build_object(
    'success',   true,
    'church_id', v_church_id,
    'sub_id',    v_sub_id,
    'grant_id',  v_grant_id
  );

EXCEPTION WHEN OTHERS THEN
  -- RAISE EXCEPTION força rollback automático do Postgres.
  -- O Edge Function recebe erro, retorna 500 para o Stripe retentar.
  RAISE EXCEPTION 'process_stripe_checkout_completed failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.process_stripe_checkout_completed(jsonb) IS
  'F6: processa checkout.session.completed de forma atômica. '
  'Cria church + subscription + profiles + user_roles + access_grant + redemption update. '
  'Idempotente por stripe_checkout_session_id. '
  'Chamada pelo stripe-webhook v10 via supabase.rpc().';

-- ── 2. process_subscription_updated ─────────────────────────

CREATE OR REPLACE FUNCTION public.process_subscription_updated(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id        text;
  v_status               varchar;
  v_current_period_start timestamptz;
  v_current_period_end   timestamptz;
  v_cancel_at_period_end boolean;
  v_church_id            uuid;
  v_sub_id               uuid;
BEGIN
  v_stripe_sub_id        := p_payload->>'stripe_subscription_id';
  v_status               := p_payload->>'status';
  v_cancel_at_period_end := COALESCE((p_payload->>'cancel_at_period_end')::boolean, false);

  -- Timestamps ISO 8601 → timestamptz
  v_current_period_start := NULLIF(p_payload->>'current_period_start', '')::timestamptz;
  v_current_period_end   := NULLIF(p_payload->>'current_period_end', '')::timestamptz;

  IF v_stripe_sub_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'stripe_subscription_id is required');
  END IF;

  -- Localizar subscription
  SELECT church_id, id INTO v_church_id, v_sub_id
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_church_id IS NULL THEN
    -- Webhook chegou antes do checkout.session.completed (race condition Stripe)
    RETURN jsonb_build_object('success', false, 'error', 'subscription not found', 'stripe_sub_id', v_stripe_sub_id);
  END IF;

  -- UPDATE subscription — idempotente por natureza (UPDATE puro)
  -- Decisão A3: cancel_at_period_end NÃO toca em access_grants.
  UPDATE subscriptions
  SET
    status                = COALESCE(v_status, status),
    current_period_start  = COALESCE(v_current_period_start, current_period_start),
    current_period_end    = COALESCE(v_current_period_end, current_period_end),
    cancel_at_period_end  = v_cancel_at_period_end,
    updated_at            = now()
  WHERE id = v_sub_id;

  RETURN jsonb_build_object(
    'success',        true,
    'church_id',      v_church_id,
    'subscription_id', v_sub_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'process_subscription_updated failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.process_subscription_updated(jsonb) IS
  'F6: processa customer.subscription.updated. '
  'Atualiza status, período e cancel_at_period_end em subscriptions. '
  'NÃO toca em access_grants (decisão A3). Idempotente por natureza (UPDATE puro).';

-- ── 3. process_subscription_deleted ─────────────────────────

CREATE OR REPLACE FUNCTION public.process_subscription_deleted(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id  text;
  v_stripe_event_id text;
  v_church_id      uuid;
  v_sub_id         uuid;
  v_grants_revoked integer;
BEGIN
  v_stripe_sub_id   := p_payload->>'stripe_subscription_id';
  v_stripe_event_id := p_payload->>'stripe_event_id';

  IF v_stripe_sub_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'stripe_subscription_id is required');
  END IF;

  -- Localizar subscription
  SELECT church_id, id INTO v_church_id, v_sub_id
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_church_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription not found', 'stripe_sub_id', v_stripe_sub_id);
  END IF;

  -- Idempotência: já cancelada? Retorna silenciosamente.
  IF EXISTS (
    SELECT 1 FROM subscriptions
    WHERE id = v_sub_id AND status = 'canceled'
  ) THEN
    RETURN jsonb_build_object('success', true, 'already_processed', true, 'church_id', v_church_id);
  END IF;

  -- 1. Cancelar subscription
  UPDATE subscriptions
  SET
    status               = 'canceled',
    cancel_at_period_end = false,
    updated_at           = now()
  WHERE id = v_sub_id;

  -- 2. Revogar access_grant(s) ativo(s) desta church
  -- active=false + ends_at=now() — church_has_access() retorna false imediatamente.
  -- ends_at > starts_at é satisfeito porque starts_at é do passado.
  UPDATE access_grants
  SET
    active   = false,
    ends_at  = now(),
    updated_at = now()
  WHERE church_id = v_church_id
    AND active   = true;

  GET DIAGNOSTICS v_grants_revoked = ROW_COUNT;

  -- 3. Suspender church
  UPDATE churches
  SET status     = 'suspended',
      updated_at = now()
  WHERE id = v_church_id;

  -- 4. Audit log
  INSERT INTO audit_logs (
    church_id, entity_type, entity_id, action,
    actor_type, actor_id, payload
  )
  VALUES (
    v_church_id,
    'subscription',
    v_sub_id,
    'stripe_subscription_deleted_processed',
    'system',
    'stripe_webhook_v10',
    jsonb_build_object(
      'stripe_event_id',  v_stripe_event_id,
      'stripe_sub_id',    v_stripe_sub_id,
      'grants_revoked',   v_grants_revoked
    )
  );

  RETURN jsonb_build_object(
    'success',        true,
    'church_id',      v_church_id,
    'subscription_id', v_sub_id,
    'access_revoked', v_grants_revoked > 0
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'process_subscription_deleted failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.process_subscription_deleted(jsonb) IS
  'F6: processa customer.subscription.deleted atomicamente. '
  'Cancela subscription + revoga access_grants + suspende church. '
  'Idempotente: segunda chamada com mesma sub_id retorna already_processed.';

-- ── 4. process_invoice_payment_failed ───────────────────────

CREATE OR REPLACE FUNCTION public.process_invoice_payment_failed(
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stripe_sub_id   text;
  v_stripe_event_id text;
  v_church_id       uuid;
  v_sub_id          uuid;
BEGIN
  v_stripe_sub_id   := p_payload->>'stripe_subscription_id';
  v_stripe_event_id := p_payload->>'stripe_event_id';

  IF v_stripe_sub_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'stripe_subscription_id is required');
  END IF;

  SELECT church_id, id INTO v_church_id, v_sub_id
  FROM subscriptions
  WHERE stripe_subscription_id = v_stripe_sub_id
  LIMIT 1;

  IF v_church_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription not found', 'stripe_sub_id', v_stripe_sub_id);
  END IF;

  -- Decisão A4: apenas atualiza status. access_grants intocados.
  -- Stripe gerencia retry/dunning. Revogação apenas em subscription.deleted.
  UPDATE subscriptions
  SET
    status     = 'past_due',
    updated_at = now()
  WHERE id = v_sub_id;

  RETURN jsonb_build_object(
    'success',         true,
    'church_id',       v_church_id,
    'subscription_id', v_sub_id
  );

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'process_invoice_payment_failed failed: % (SQLSTATE: %)', SQLERRM, SQLSTATE;
END;
$$;

COMMENT ON FUNCTION public.process_invoice_payment_failed(jsonb) IS
  'F6: processa invoice.payment_failed. '
  'Apenas atualiza subscriptions.status=past_due. '
  'NÃO revoga access_grants (decisão A4). Stripe gerencia dunning.';
