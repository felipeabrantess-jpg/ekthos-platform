-- ============================================================
-- Migration: 00015_set_admin.sql
-- Descrição: Garante is_ekthos_admin = true para o email do fundador.
--   1. UPDATE para usuário já existente (idempotente via COALESCE).
--   2. TRIGGER BEFORE INSERT para novos signups do mesmo email,
--      garantindo que o JWT emitido no signup já contenha o flag.
-- Criado em: 2026-04-15
-- ============================================================

-- 1. Seta is_ekthos_admin para usuário existente (se já existe na base)
UPDATE auth.users
SET raw_app_meta_data =
      COALESCE(raw_app_meta_data, '{}'::jsonb)
      || '{"is_ekthos_admin": true}'::jsonb
WHERE email = 'felipe@ekthosai.net';

-- 2. Função trigger: ao criar qualquer usuário na lista de admins,
--    já seta is_ekthos_admin = true no app_metadata antes de inserir.
--    Isso garante que o JWT do signup já carrega o flag.

CREATE OR REPLACE FUNCTION auth.set_ekthos_admin_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  IF NEW.email = ANY(ARRAY[
    'felipe@ekthosai.net'
    -- Adicione outros emails de admin Ekthos aqui se necessário
  ]) THEN
    NEW.raw_app_meta_data :=
      COALESCE(NEW.raw_app_meta_data, '{}'::jsonb)
      || '{"is_ekthos_admin": true}'::jsonb;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_ekthos_admin ON auth.users;
CREATE TRIGGER trg_set_ekthos_admin
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION auth.set_ekthos_admin_on_signup();

COMMENT ON FUNCTION auth.set_ekthos_admin_on_signup() IS
  'Seta is_ekthos_admin=true no app_metadata para emails autorizados ao criar conta.
   Isso garante que o JWT emitido no signup já contém o flag, sem depender de
   um UPDATE posterior ou refresh de sessão.';
