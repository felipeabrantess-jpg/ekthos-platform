-- Fix #18: substituir subqueries diretas em auth.users por funções SECURITY DEFINER
-- Causa: 4 policies com SECURITY INVOKER fazem SELECT em auth.users → permission denied
-- Fix: is_ekthos_admin() e auth_church_id() já são SECURITY DEFINER, leem do JWT

-- 1. church_whatsapp_channels — causa direta do crash em Conversas
--    (query useConversations faz JOIN com esta tabela)
DROP POLICY IF EXISTS "ekthos_admin_full_access" ON public.church_whatsapp_channels;
CREATE POLICY "ekthos_admin_full_access"
  ON public.church_whatsapp_channels
  FOR ALL
  TO authenticated
  USING (is_ekthos_admin() = true)
  WITH CHECK (is_ekthos_admin() = true);

-- 2. church_channels — mesma vulnerabilidade
DROP POLICY IF EXISTS "ekthos_admin_full_access" ON public.church_channels;
CREATE POLICY "ekthos_admin_full_access"
  ON public.church_channels
  FOR ALL
  TO authenticated
  USING (is_ekthos_admin() = true)
  WITH CHECK (is_ekthos_admin() = true);

-- 3. agent_prompt_templates — mesma vulnerabilidade
DROP POLICY IF EXISTS "admin_ekthos_full_access_templates" ON public.agent_prompt_templates;
CREATE POLICY "admin_ekthos_full_access_templates"
  ON public.agent_prompt_templates
  FOR ALL
  TO authenticated
  USING (is_ekthos_admin() = true)
  WITH CHECK (is_ekthos_admin() = true);

-- 4. pending_addons — usa auth.users para church_id → substituir por auth_church_id()
DROP POLICY IF EXISTS "church_members_read_own" ON public.pending_addons;
CREATE POLICY "church_members_read_own"
  ON public.pending_addons
  FOR SELECT
  TO public
  USING (church_id = auth_church_id());

DROP POLICY IF EXISTS "church_members_insert_own" ON public.pending_addons;
CREATE POLICY "church_members_insert_own"
  ON public.pending_addons
  FOR INSERT
  TO public
  WITH CHECK (
    church_id = auth_church_id()
    AND user_id = auth.uid()
  );
