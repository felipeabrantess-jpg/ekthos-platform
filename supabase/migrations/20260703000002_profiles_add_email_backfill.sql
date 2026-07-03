-- Migration: adiciona coluna email em profiles e preenche retroativamente
--
-- Contexto: profiles.email existia na migration inicial mas foi removido.
-- A tela /configuracoes/usuarios precisa de email como fallback de exibição
-- quando display_name e name são null (usuários convidados sem nome).
--
-- Causa do bug "Usuário genérico":
--   1. Usuários convidados sem nome → display_name = null, name = null
--   2. Alguns user_ids em user_roles não têm linha em profiles (criados antes do EF)
--   Em ambos os casos o frontend cai no fallback 'Usuário'.
--
-- Este script:
--   1. Adiciona coluna email (nullable) em profiles
--   2. Preenche retroativamente email a partir de auth.users para linhas existentes
--   3. Cria profiles ausentes para user_ids em user_roles que não têm profile
--   4. Preenche display_name onde está null usando email como fallback

-- 1. Adicionar coluna email em profiles (idempotente)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Preencher email nos profiles existentes que não têm email
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND p.email IS NULL;

-- 3. Criar profiles ausentes para user_ids que têm user_roles mas não têm profile
INSERT INTO profiles (user_id, church_id, email, display_name)
SELECT
  ur.user_id,
  ur.church_id,
  u.email,
  u.email   -- usa email como display_name inicial
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id
WHERE NOT EXISTS (
  SELECT 1 FROM profiles p WHERE p.user_id = ur.user_id
)
ON CONFLICT (user_id) DO NOTHING;

-- 4. Preencher display_name com email onde está null
-- (não sobrescreve display_name que já tem valor)
UPDATE profiles p
SET display_name = u.email
FROM auth.users u
WHERE u.id = p.user_id
  AND p.display_name IS NULL
  AND u.email IS NOT NULL;
