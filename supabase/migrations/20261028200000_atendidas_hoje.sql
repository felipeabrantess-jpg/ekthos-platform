-- ============================================================
-- Tela Pessoas: "Atendida" → "Atendidas hoje" (pedido do proprietário 28/10).
--   Atendidas hoje = pessoas com QUALQUER atendimento registrado pela equipe HOJE (horário de Brasília):
--   contato (realizado, sem resposta, não atendeu, número errado, reagendado, não quer contato…) ou encaminhamento.
--   É um RECORTE (como "Sem atendimento há 48h"): não muda nenhum estado nem nenhum outro número.
-- 1. person_attended_today_rows(igreja): regra única (contador, lista e CSV usam a mesma).
-- 2. get_care_status_counts ganha a chave 'atendidas_hoje'; demais chaves inalteradas.
-- 3. get_people_page / export_people_rows / export_people_rows_page aceitam p_care_status = 'atendidas_hoje';
--    get_people_page devolve 'atendimento_hoje' (último registro do dia: resultado, anotação, quem, hora, quantos).
-- As 4 funções existentes são alteradas por SUBSTITUIÇÃO EXATA sobre a definição de produção, com conferência
-- de md5 antes (aborta se produção mudou) e de ocorrência única do trecho.
-- Rollback: docs/rollbacks/20261028200000_atendidas_hoje.rollback.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.person_attended_today_rows(p_church_id uuid)
 RETURNS TABLE(person_id uuid, at timestamptz, result text, notes text, actor_name text, registros_hoje int)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH ev AS (
    SELECT pj.person_id, je.created_at, je.actor_id,
           CASE je.event_type WHEN 'ministry_referral' THEN 'encaminhado' ELSE je.payload ->> 'result' END AS result,
           CASE je.event_type
             WHEN 'ministry_referral' THEN 'Encaminhado para ' || COALESCE(je.payload ->> 'ministry_name', 'ministério')
             ELSE NULLIF(je.payload ->> 'notes', '')
           END AS notes
    FROM journey_events je
    JOIN person_journey pj ON pj.id = je.journey_id
    WHERE pj.church_id = p_church_id
      AND (COALESCE(auth.role(), '') = 'service_role' OR p_church_id = auth_church_id())
      AND je.actor_type = 'human'
      AND je.event_type IN ('pastoral_contact', 'ministry_referral')
      AND je.created_at >= (date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
  )
  SELECT DISTINCT ON (ev.person_id)
         ev.person_id, ev.created_at, ev.result, ev.notes,
         COALESCE(pr.name, pr.display_name, au.raw_user_meta_data ->> 'full_name', au.email)::text,
         (COUNT(*) OVER (PARTITION BY ev.person_id))::int
  FROM ev
  LEFT JOIN auth.users au ON au.id      = ev.actor_id
  LEFT JOIN profiles   pr ON pr.user_id = ev.actor_id
  -- último registro do dia; empate (contato + encaminhamento na mesma gravação) → o contato
  ORDER BY ev.person_id, ev.created_at DESC, (ev.result = 'encaminhado') ASC
$function$;
REVOKE ALL ON FUNCTION public.person_attended_today_rows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_attended_today_rows(uuid) TO authenticated, service_role;

CREATE FUNCTION pg_temp.patch(p_fn regprocedure, p_md5 text, p_old text, p_new text) RETURNS void LANGUAGE plpgsql AS $p$
DECLARE v_def text; v_src text; v_n int;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc WHERE oid = p_fn;
  IF md5(v_src) <> p_md5 THEN RAISE EXCEPTION 'PRODUCAO_MUDOU: % (md5 %)', p_fn, md5(v_src); END IF;
  v_def := pg_get_functiondef(p_fn);
  v_n := (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old);
  IF v_n <> 1 THEN RAISE EXCEPTION 'TRECHO_NAO_UNICO: % (% ocorrências)', p_fn, v_n; END IF;
  EXECUTE replace(v_def, p_old, p_new);
END $p$;

-- 2. contador
SELECT pg_temp.patch('public.get_care_status_counts(uuid,text,text,text,text,uuid,integer,date,date,date,date,text,text,text,text)',
  'e0a1970d417d2dbe997a3a82af2e3f70',
  $o$    'sem_contato_48h', (SELECT COUNT(*) FROM base WHERE alert),$o$,
  $n$    'sem_contato_48h', (SELECT COUNT(*) FROM base WHERE alert),
    'atendidas_hoje',  (SELECT COUNT(*) FROM base WHERE id IN (SELECT t.person_id FROM person_attended_today_rows(p_church_id) t)),$n$);

-- 3a. lista: filtro
SELECT pg_temp.patch('public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)',
  'd49b8474158bd5dbfd1cdcb331adb7bb',
  $o$           AND b.id IN (SELECT r.person_id FROM person_care_rows(p_church_id) r WHERE r.care_alert))$o$,
  $n$           AND b.id IN (SELECT r.person_id FROM person_care_rows(p_church_id) r WHERE r.care_alert))
       -- Atendidas hoje (recorte do dia; não é estado)
       OR (p_care_status = 'atendidas_hoje'
           AND b.id IN (SELECT t.person_id FROM person_attended_today_rows(p_church_id) t))$n$);
-- 3b. lista: o que aconteceu hoje (só pessoas da página)
SELECT pg_temp.patch('public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)',
  (SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.get_people_page(uuid,text,text,text,text,text,date,date,integer,integer,date,date,text,uuid,integer,text,text,text,text,text)'::regprocedure),
  $o$      'classification', person_classification(p.id),$o$,
  $n$      'classification', person_classification(p.id),
      'atendimento_hoje', (SELECT to_jsonb(t) FROM person_attended_today_rows(p_church_id) t WHERE t.person_id = p.id),$n$);

-- 3c. CSV (mesmo filtro nas duas exportações)
SELECT pg_temp.patch(p.oid::regprocedure, md5(p.prosrc),
  $o$       OR (p_care_status = 'sem_contato_48h' AND w.care_alert)$o$,
  $n$       OR (p_care_status = 'sem_contato_48h' AND w.care_alert)
       OR (p_care_status = 'atendidas_hoje' AND w.id IN (SELECT t.person_id FROM person_attended_today_rows(p_church_id) t))$n$)
FROM pg_proc p WHERE p.proname IN ('export_people_rows', 'export_people_rows_page') AND p.pronamespace = 'public'::regnamespace;
