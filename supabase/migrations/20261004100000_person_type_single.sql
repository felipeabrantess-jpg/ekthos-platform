-- ============================================================
-- FRENTE 2 — Tipo da pessoa: no máximo UM tipo por pessoa
-- (itens 6 + 9 da ata IGV)
--
-- "Tipos de pessoa" (Visitante, Membro, Novo Convertido, Reconciliado, Inativos) são as
-- etiquetas da tabela tags, ligadas à pessoa por person_tags. Esta migration:
--   1. tags.category: separa a categoria "Tipos de pessoa" ('person_type') de etiquetas
--      gerais ('general'). As etiquetas que existem hoje (só os "Tipos de pessoa" da tela
--      /pessoas/flags) são marcadas EXPLICITAMENTE como 'person_type'. O default da coluna é
--      'general': uma etiqueta futura só vira "tipo de pessoa" se quem a cria disser isso.
--      A categoria nunca é deduzida de nome, cor, ordem ou rótulo.
--   2. Trigger person_tags_enforce_single_type: última barreira no banco — uma pessoa não
--      pode ficar com duas etiquetas da categoria 'person_type'. Etiquetas 'general'
--      continuam livres (várias por pessoa).
--   3. set_person_tags(): troca as etiquetas da pessoa numa única transação (sem escrita parcial).
--
-- O que esta migration NÃO faz:
--   - não altera, apaga nem escolhe tipo de nenhuma pessoa (o registro legado com
--     Membro + Visitante fica como está, até decisão humana);
--   - não sincroniza Tipo com Etapa, situação (left_at) ou atendimento;
--   - não muda permissões (continua valendo a RLS por igreja).
-- ============================================================

-- ── 1. Categoria da etiqueta ─────────────────────────────────
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS category text;

-- Classificação explícita do que existe HOJE: todas as etiquetas atuais foram criadas pela tela
-- "Tipos de Pessoa" e são tipos de pessoa. (Só preenche o que ainda não tem categoria.)
UPDATE public.tags SET category = 'person_type' WHERE category IS NULL;

-- Daqui em diante, sem categoria informada = etiqueta geral (nunca exclusiva por acidente).
ALTER TABLE public.tags ALTER COLUMN category SET DEFAULT 'general';
ALTER TABLE public.tags ALTER COLUMN category SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tags_category_check') THEN
    ALTER TABLE public.tags
      ADD CONSTRAINT tags_category_check CHECK (category IN ('person_type', 'general'));
  END IF;
END $$;

COMMENT ON COLUMN public.tags.category IS
  'person_type = "Tipos de pessoa" (no máximo 1 por pessoa); general = etiqueta livre (várias por pessoa)';

-- ── 2. Última barreira: um tipo por pessoa ───────────────────
CREATE OR REPLACE FUNCTION public.person_tags_enforce_single_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só a categoria "Tipos de pessoa" é exclusiva
  IF (SELECT t.category FROM tags t WHERE t.id = NEW.tag_id) IS DISTINCT FROM 'person_type' THEN
    RETURN NEW;
  END IF;

  -- Serializa gravações simultâneas de tipo para a mesma pessoa
  PERFORM pg_advisory_xact_lock(hashtextextended('person_type:' || NEW.person_id::text, 8013));

  IF EXISTS (
    SELECT 1
      FROM person_tags pt
      JOIN tags t ON t.id = pt.tag_id
     WHERE pt.person_id = NEW.person_id
       AND pt.id <> NEW.id
       AND pt.tag_id <> NEW.tag_id
       AND t.category = 'person_type'
  ) THEN
    RAISE EXCEPTION 'PERSON_TYPE_SINGLE: Uma pessoa só pode ter um tipo. Remova o tipo atual antes de escolher outro.'
      USING ERRCODE = '23514',
            CONSTRAINT = 'person_tags_single_person_type';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS person_tags_enforce_single_type ON public.person_tags;
CREATE TRIGGER person_tags_enforce_single_type
  BEFORE INSERT OR UPDATE OF tag_id, person_id ON public.person_tags
  FOR EACH ROW EXECUTE FUNCTION public.person_tags_enforce_single_type();

-- Transformar uma etiqueta geral em "tipo de pessoa" não pode criar pessoas com dois tipos
CREATE OR REPLACE FUNCTION public.tags_guard_category_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category = 'person_type' AND OLD.category IS DISTINCT FROM 'person_type' AND EXISTS (
    SELECT 1
      FROM person_tags a
      JOIN person_tags b ON b.person_id = a.person_id AND b.tag_id <> a.tag_id
      JOIN tags tb ON tb.id = b.tag_id AND tb.category = 'person_type'
     WHERE a.tag_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'PERSON_TYPE_SINGLE: há pessoas com esta etiqueta que já possuem um tipo.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tags_guard_category_change ON public.tags;
CREATE TRIGGER tags_guard_category_change
  BEFORE UPDATE OF category ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.tags_guard_category_change();

-- ── 3. Troca atômica das etiquetas da pessoa ─────────────────
-- SECURITY INVOKER: valem as políticas RLS de people / tags / person_tags (só a igreja do usuário).
-- Substitui o DELETE + INSERT em duas requisições que a tela fazia.
-- Tudo acontece numa única transação: para qualquer outra sessão a pessoa passa direto do
-- tipo antigo para o novo — nunca é vista com 0 ou 2 tipos no meio da troca.
-- Só mexe nas etiquetas que mudaram (as que permanecem não são regravadas).
CREATE OR REPLACE FUNCTION public.set_person_tags(p_person_id uuid, p_tag_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_church uuid;
  v_ids    uuid[] := COALESCE((SELECT array_agg(DISTINCT x) FROM unnest(p_tag_ids) x WHERE x IS NOT NULL), '{}');
  v_found  int;
  v_types  int;
BEGIN
  -- A RLS de people já limita à igreja do usuário; a conferência explícita abaixo é a 2ª trava.
  SELECT p.church_id INTO v_church FROM people p WHERE p.id = p_person_id AND p.deleted_at IS NULL;
  IF v_church IS NULL
     OR (COALESCE(auth.role(), '') <> 'service_role' AND v_church IS DISTINCT FROM auth_church_id()) THEN
    RAISE EXCEPTION 'PERSON_NOT_FOUND: pessoa não encontrada' USING ERRCODE = '42501';
  END IF;

  -- Uma troca por vez para a mesma pessoa (mesma chave de lock da trigger)
  PERFORM pg_advisory_xact_lock(hashtextextended('person_type:' || p_person_id::text, 8013));

  SELECT count(*), count(*) FILTER (WHERE t.category = 'person_type')
    INTO v_found, v_types
    FROM tags t
   WHERE t.id = ANY (v_ids) AND t.church_id = v_church;

  IF v_found <> COALESCE(array_length(v_ids, 1), 0) THEN
    RAISE EXCEPTION 'INVALID_TAG: etiqueta inexistente ou de outra igreja' USING ERRCODE = '42501';
  END IF;

  IF v_types > 1 THEN
    RAISE EXCEPTION 'PERSON_TYPE_SINGLE: Uma pessoa só pode ter um tipo.'
      USING ERRCODE = '23514', CONSTRAINT = 'person_tags_single_person_type';
  END IF;

  DELETE FROM person_tags pt
   WHERE pt.person_id = p_person_id AND pt.church_id = v_church AND NOT (pt.tag_id = ANY (v_ids));

  INSERT INTO person_tags (person_id, tag_id, church_id, assigned_by)
  SELECT p_person_id, x, v_church, auth.uid()
    FROM unnest(v_ids) x
   WHERE NOT EXISTS (SELECT 1 FROM person_tags pt WHERE pt.person_id = p_person_id AND pt.tag_id = x);

  RETURN jsonb_build_object('person_id', p_person_id, 'tag_ids', to_jsonb(v_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.set_person_tags(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_person_tags(uuid, uuid[]) TO authenticated, service_role;
