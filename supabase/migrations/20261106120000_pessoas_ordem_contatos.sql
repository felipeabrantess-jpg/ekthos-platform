-- Tela Pessoas, ordenar por Contatos: quem não tem contato fica no fim (crescente: 1º, 2º, 3º... e depois sem contato).
-- Antes, o 0 vinha primeiro na ordem crescente e escondia quem já foi contatado. Só muda a chave de ordenação.
-- Substituição exata sobre a definição de produção, com conferência de md5 e de ocorrência única.
-- Rollback: docs/rollbacks/20261106120000_pessoas_ordem_contatos.rollback.sql
DO $$
DECLARE
  f   regprocedure := 'public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)';
  old text := 'WHEN ''contatos'' THEN COALESCE((SELECT cc.n FROM contact_counts cc WHERE cc.person_id = f.id), 0)';
  new text := 'WHEN ''contatos'' THEN (SELECT cc.n FROM contact_counts cc WHERE cc.person_id = f.id)';
  d   text;
BEGIN
  IF (SELECT md5(prosrc) FROM pg_proc WHERE oid = f) <> '2cb44ad4696e8c628aee5ce4f7b271da' THEN RAISE EXCEPTION 'PRODUCAO_MUDOU'; END IF;
  d := pg_get_functiondef(f);
  IF (length(d) - length(replace(d, old, ''))) / length(old) <> 1 THEN RAISE EXCEPTION 'TRECHO_NAO_UNICO'; END IF;
  EXECUTE replace(d, old, new);
END $$;
