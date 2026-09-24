-- ============================================================================
-- BUSCA NORMALIZADA (caixa / acento / cedilha) — Conversas
--
-- people.name_sort = f_unaccent(lower(trim(name))) cobre as buscas por nome nas
-- telas de pessoas. Em Conversas, porém, parte dos contatos foi criada pelo fluxo
-- de WhatsApp só com first_name/last_name (name NULL → name_sort NULL): na IGV,
-- 24 pessoas e 38 conversas. Para a regra valer também ali sem carregar tabelas
-- no frontend, criamos UMA coluna gerada que cobre os dois casos:
--
--   people.contact_name_sort =
--     f_unaccent(lower(trim(coalesce(nullif(name,''), trim(first_name || ' ' || last_name)))))
--   (sem concat_ws, que é STABLE e não pode entrar em coluna gerada)
--
-- Só leitura pela tela de Conversas (.ilike sobre a coluna). Nenhuma regra de
-- negócio muda; name_sort e as demais buscas ficam como estão.
-- ============================================================================

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS contact_name_sort text
  GENERATED ALWAYS AS (
    f_unaccent(lower(trim(coalesce(nullif(name, ''), trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))))))
  ) STORED;

COMMENT ON COLUMN people.contact_name_sort IS
  'Nome normalizado para busca (caixa/acento/ç-insensível): name, ou first_name+last_name quando name é nulo. Usado por Conversas.';

CREATE INDEX IF NOT EXISTS idx_people_church_contact_name_sort ON people (church_id, contact_name_sort);

-- ── Verificações ─────────────────────────────────────────────────────────────
DO $$
DECLARE v_null int; v_diff int;
BEGIN
  -- toda pessoa com name OU first/last tem contact_name_sort
  SELECT COUNT(*) INTO v_null FROM people
  WHERE contact_name_sort IS NULL AND (name IS NOT NULL OR first_name IS NOT NULL OR last_name IS NOT NULL);
  IF v_null > 0 THEN RAISE EXCEPTION 'contact_name_sort nulo em % pessoas com nome', v_null; END IF;
  -- onde name existe, contact_name_sort == name_sort (não muda a semântica existente)
  SELECT COUNT(*) INTO v_diff FROM people WHERE name IS NOT NULL AND name <> '' AND contact_name_sort IS DISTINCT FROM name_sort;
  IF v_diff > 0 THEN RAISE EXCEPTION 'contact_name_sort diverge de name_sort em % pessoas', v_diff; END IF;
END $$;
