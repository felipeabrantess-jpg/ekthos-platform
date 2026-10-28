-- Rollback de 20261028200000_atendidas_hoje: desfaz as 4 substituições (trecho novo → trecho original) e remove a função.
CREATE FUNCTION pg_temp.unpatch(p_fn regprocedure, p_new text, p_old text) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE v_def text := pg_get_functiondef(p_fn); v_n int;
BEGIN
  v_n := (length(v_def) - length(replace(v_def, p_new, ''))) / length(p_new);
  IF v_n <> 1 THEN RAISE EXCEPTION 'TRECHO_NAO_ENCONTRADO: % (%)', p_fn, v_n; END IF;
  EXECUTE replace(v_def, p_new, p_old);
END $p$;

SELECT pg_temp.unpatch('public.get_care_status_counts(uuid,text,text,text,text,uuid,integer,date,date,date,date,text,text,text,text)',
  $n$    'sem_contato_48h', (SELECT COUNT(*) FROM base WHERE alert),
    'atendidas_hoje',  (SELECT COUNT(*) FROM base WHERE id IN (SELECT t.person_id FROM person_attended_today_rows(p_church_id) t)),$n$,
  $o$    'sem_contato_48h', (SELECT COUNT(*) FROM base WHERE alert),$o$);

SELECT pg_temp.unpatch('public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)',
  $n$           AND b.id IN (SELECT r.person_id FROM person_care_rows(p_church_id) r WHERE r.care_alert))
       -- Atendidas hoje (recorte do dia; não é estado)
       OR (p_care_status = 'atendidas_hoje'
           AND b.id IN (SELECT t.person_id FROM person_attended_today_rows(p_church_id) t))$n$,
  $o$           AND b.id IN (SELECT r.person_id FROM person_care_rows(p_church_id) r WHERE r.care_alert))$o$);

SELECT pg_temp.unpatch('public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)',
  $n$      'classification', person_classification(p.id),
      'atendimento_hoje', (SELECT to_jsonb(t) FROM person_attended_today_rows(p_church_id) t WHERE t.person_id = p.id),$n$,
  $o$      'classification', person_classification(p.id),$o$);

SELECT pg_temp.unpatch(p.oid::regprocedure,
  $n$       OR (p_care_status = 'sem_contato_48h' AND w.care_alert)
       OR (p_care_status = 'atendidas_hoje' AND w.id IN (SELECT t.person_id FROM person_attended_today_rows(p_church_id) t))$n$,
  $o$       OR (p_care_status = 'sem_contato_48h' AND w.care_alert)$o$)
FROM pg_proc p WHERE p.proname IN ('export_people_rows', 'export_people_rows_page') AND p.pronamespace = 'public'::regnamespace;

DROP FUNCTION IF EXISTS public.person_attended_today_rows(uuid);
