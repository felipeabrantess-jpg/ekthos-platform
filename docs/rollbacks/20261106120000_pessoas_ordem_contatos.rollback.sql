-- Desfaz 20261106120000_pessoas_ordem_contatos (volta o 0 como chave de quem não tem contato).
DO $$
DECLARE
  f   regprocedure := 'public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)';
  new text := 'WHEN ''contatos'' THEN (SELECT cc.n FROM contact_counts cc WHERE cc.person_id = f.id)';
  old text := 'WHEN ''contatos'' THEN COALESCE((SELECT cc.n FROM contact_counts cc WHERE cc.person_id = f.id), 0)';
  d   text := pg_get_functiondef(f);
BEGIN
  IF (length(d) - length(replace(d, new, ''))) / length(new) <> 1 THEN RAISE EXCEPTION 'TRECHO_NAO_ENCONTRADO'; END IF;
  EXECUTE replace(d, new, old);
END $$;
