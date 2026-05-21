-- =============================================================================
-- OPS-DEBT-047 | 2026-05-21
-- rls_stripe_payment_links
--
-- Habilita RLS na tabela stripe_payment_links e cria policy admin-only.
--
-- Contexto: tabela criada via Supabase Dashboard (não via migration),
-- portanto sem RLS habilitada por padrão. URLs de pagamento Stripe
-- ficavam expostas sem autenticação.
--
-- Policy: apenas is_ekthos_admin() pode ler/escrever — mesmo padrão de
-- stripe_coupons e outras tabelas sensíveis do cockpit.
--
-- Rollback:
--   ALTER TABLE public.stripe_payment_links DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS "stripe_payment_links_admin_all" ON public.stripe_payment_links;
-- =============================================================================

ALTER TABLE public.stripe_payment_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stripe_payment_links_admin_all" ON public.stripe_payment_links;

CREATE POLICY "stripe_payment_links_admin_all"
  ON public.stripe_payment_links
  FOR ALL
  TO authenticated
  USING     (public.is_ekthos_admin())
  WITH CHECK (public.is_ekthos_admin());
