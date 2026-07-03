-- Migration: adiciona coluna email em profiles e preenche retroativamente
--
-- Contexto: a tela /configuracoes/usuarios exibia "Usuário" genérico porque:
--   1. Usuários convidados sem nome → display_name=null, name=null
--   2. Alguns user_ids em user_roles não tinham linha em profiles
--
-- NOTA: usa WHERE NOT EXISTS (sem ON CONFLICT) pois a constraint UNIQUE
-- de profiles.user_id não existe como constraint nomeada em prod.
-- ──────────────────────────────────────────────────────────────

-- 1. Adiciona coluna email se não existir
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Preenche email nos profiles que ainda não têm
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND p.email IS NULL;

-- 3. Cria profiles ausentes para user_roles sem profile
--    (WHERE NOT EXISTS evita duplicata — sem depender de ON CONFLICT)
INSERT INTO profiles (user_id, church_id, email, display_name)
SELECT
  ur.user_id,
  ur.church_id,
  u.email,
  u.email
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.user_id = ur.user_id
);

-- 4. Preenche display_name com email onde está null
--    (não sobrescreve quem já tem display_name preenchido)
UPDATE profiles p
SET display_name = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND p.display_name IS NULL
  AND u.email IS NOT NULL;
