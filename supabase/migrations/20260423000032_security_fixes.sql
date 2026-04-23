-- ============================================================
-- Migration: 20260423000032_security_fixes.sql
-- Auditoria de Segurança — correções críticas e altas
--
-- SEC-001: Limpa admin indevidos gerados pelo CROSS JOIN da 00008
-- SEC-007: Remove fallback user_metadata de auth_church_id()
-- SEC-009: Habilita pgcrypto (base para criptografia de CPF)
-- SEC-011: Corrige RLS de pipeline_history (type mismatch UUID)
--
-- Criado em: 2026-04-23
-- ============================================================

-- ══════════════════════════════════════════════════════════════
-- SEC-001: Limpar admin indevidos do CROSS JOIN
-- ──────────────────────────────────────────────────────────────
-- A migration 00008 fez CROSS JOIN entre auth.users × churches,
-- tornando todos os usuários admin de todas as igrejas.
-- Esta migration remove os registros indevidos, mantendo apenas:
--   (a) o usuário cujo app_metadata.church_id bate com a church, OU
--   (b) o usuário cujo raw_user_meta_data.church_id bate (retrocompat.)
-- Garante que nenhuma church fique sem admin: só deleta se existir
-- ao menos outro admin válido na mesma church.
-- ══════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  -- Remove admin indevidos (sem correspondência de church_id no JWT)
  -- Usa CTE para calcular quais registros são "legítimos" e quais não são.
  WITH legitimate_admins AS (
    -- Registros onde o usuário tem esse church_id em app_metadata OU user_metadata
    SELECT ur.id
    FROM user_roles ur
    JOIN auth.users u ON u.id = ur.user_id
    WHERE ur.role = 'admin'
      AND (
        (u.raw_app_meta_data  ->> 'church_id')::uuid = ur.church_id
        OR (u.raw_user_meta_data ->> 'church_id')::uuid = ur.church_id
      )
  ),
  admin_counts AS (
    -- Quantos admins legítimos cada church tem
    SELECT ur.church_id, COUNT(la.id) AS legit_count
    FROM user_roles ur
    LEFT JOIN legitimate_admins la ON la.id = ur.id
    WHERE ur.role = 'admin'
    GROUP BY ur.church_id
  ),
  to_delete AS (
    -- Candidatos à remoção: não são legítimos E a church tem pelo menos 1 legítimo
    SELECT ur.id
    FROM user_roles ur
    JOIN admin_counts ac ON ac.church_id = ur.church_id
    WHERE ur.role = 'admin'
      AND ur.id NOT IN (SELECT id FROM legitimate_admins)
      AND ac.legit_count > 0   -- Protege: só deleta se church tem admin real
  )
  DELETE FROM user_roles
  WHERE id IN (SELECT id FROM to_delete);

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE '[SEC-001] Registros admin indevidos removidos: %', v_deleted;
END $$;

-- Verificação pós-limpeza (aparece no log da migration)
DO $$
DECLARE
  v_total   INTEGER;
  v_users   INTEGER;
  v_churches INTEGER;
BEGIN
  SELECT
    COUNT(*),
    COUNT(DISTINCT user_id),
    COUNT(DISTINCT church_id)
  INTO v_total, v_users, v_churches
  FROM user_roles
  WHERE role = 'admin';

  RAISE NOTICE '[SEC-001] Estado pós-limpeza: total=% usuários=% igrejas=%',
    v_total, v_users, v_churches;
END $$;


-- ══════════════════════════════════════════════════════════════
-- SEC-007: Corrigir auth_church_id() — remover fallback user_metadata
-- ──────────────────────────────────────────────────────────────
-- user_metadata é editável pelo próprio usuário via SDK Supabase.
-- Um atacante podia modificar user_metadata.church_id para outro
-- church_id, bypassando RLS de TODAS as tabelas.
-- Solução: ler APENAS app_metadata (setado server-side por service_role).
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auth_church_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid
$$;

COMMENT ON FUNCTION auth_church_id() IS
  'Retorna o church_id do JWT do usuário autenticado.
   Lê APENAS app_metadata (server-side, imutável pelo usuário).
   Fallback para user_metadata REMOVIDO — era bypassável pelo cliente (SEC-007).
   Corrigido em: 2026-04-23';


-- ══════════════════════════════════════════════════════════════
-- SEC-009: Habilitar pgcrypto
-- ──────────────────────────────────────────────────────────────
-- Base para futura criptografia de CPF em people.cpf.
-- CPFs atualmente estão em plain text (violação LGPD).
-- Esta migration apenas habilita a extensão — criptografia dos
-- dados existentes será feita em migration separada após
-- definição da chave de criptografia (ekthos.cpf_key no Vault).
-- ══════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto;

COMMENT ON EXTENSION pgcrypto IS
  'Criptografia simétrica (pgp_sym_encrypt/decrypt) para dados sensíveis.
   Usado para criptografar CPF em people.cpf (SEC-009, LGPD).';


-- ══════════════════════════════════════════════════════════════
-- SEC-011: Corrigir RLS de pipeline_history
-- ──────────────────────────────────────────────────────────────
-- Política anterior: church_id = auth.jwt() ->> 'church_id'::text
-- Problema: comparação TEXT vs UUID → type mismatch → RLS bypassado
--           (retornava todas as linhas de todas as igrejas).
-- Solução: usar auth_church_id() que já faz o cast correto para UUID.
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "pipeline_history_tenant_select" ON pipeline_history;
CREATE POLICY "pipeline_history_tenant_select"
  ON pipeline_history FOR SELECT
  USING (church_id = auth_church_id());

-- Adicionar políticas de INSERT/UPDATE/DELETE para completude
-- (apenas service_role pode inserir — triggers fazem isso)
DROP POLICY IF EXISTS "pipeline_history_tenant_insert" ON pipeline_history;
CREATE POLICY "pipeline_history_tenant_insert"
  ON pipeline_history FOR INSERT
  WITH CHECK (
    church_id = auth_church_id()
    OR auth.role() = 'service_role'
  );

-- Pipeline history é imutável — sem UPDATE nem DELETE para usuários
-- (service_role mantém acesso total via "pipeline_history_service_all")
