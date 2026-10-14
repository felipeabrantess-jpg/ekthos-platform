-- ============================================================
-- Regressão — item 14 da ata IGV: link de Documentação configurável (migration 20261010150000).
-- BEGIN … ROLLBACK; contas reais da IGV só como identidade (nada é alterado de forma persistente).
-- ============================================================
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE _r (n int, teste text, ok boolean, info text) ON COMMIT DROP;
CREATE TEMP TABLE _c ON COMMIT DROP AS
SELECT '6c127559-874a-4748-8fce-55d4079613a5'::uuid c1, '184fd750-4354-4c31-9018-64bc3605eca3'::uuid c2,
       '5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349'::uuid u_admin,
       '358cf292-5890-4570-9bc5-dd2f154dd208'::uuid u_admdep,
       '1b0d7654-618e-41e4-bf00-abb58da8aec8'::uuid u_lider,
       '48338f75-b6e8-40c4-871a-5f1193b18af9'::uuid u_comum;
GRANT ALL ON _r, _c TO authenticated, anon;
CREATE TEMP TABLE _snap ON COMMIT DROP AS
SELECT (SELECT count(*) FROM church_settings) n,
       (SELECT md5(string_agg(md5((to_jsonb(s) - 'ministerios_docs_url' - 'updated_at')::text), '' ORDER BY s.id)) FROM church_settings s) md5_sem_coluna;
GRANT ALL ON _snap TO authenticated;

-- (validação pré-deploy: a migration é injetada neste ponto, dentro desta mesma transação)

CREATE FUNCTION pg_temp.login(p_user uuid, p_church uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'app_metadata', json_build_object('church_id', p_church))::text, true)
$$;

-- admin configura
SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$
DECLARE c record; r text; v text;
BEGIN
  SELECT * INTO c FROM _c;
  v := set_ministerios_docs_url('  https://igv.sharepoint.com/pasta-ministerios  ');
  INSERT INTO _r VALUES (1, 'admin grava o link (espaços aparados) e recebe o valor gravado',
    v = 'https://igv.sharepoint.com/pasta-ministerios'
    AND (SELECT ministerios_docs_url FROM church_settings WHERE church_id = c.c1) = v, v);
  INSERT INTO _r VALUES (2, 'leitura pela política de tenant existente (admin enxerga o próprio link)',
    (SELECT ministerios_docs_url FROM church_settings WHERE church_id = c.c1) = 'https://igv.sharepoint.com/pasta-ministerios', NULL);
  FOREACH r IN ARRAY ARRAY['http://inseguro.com/x', 'javascript:alert(1)', 'ftp://x.com/a', 'https://x.com/a b', 'https://', 'igv.com/pasta', repeat('a', 2001)] LOOP
    BEGIN PERFORM set_ministerios_docs_url(CASE WHEN r = repeat('a', 2001) THEN 'https://x.com/' || r ELSE r END); v := 'ACEITO'; EXCEPTION WHEN OTHERS THEN v := SQLSTATE; END;
    INSERT INTO _r VALUES (3, 'rejeita URL inválida: ' || left(r, 28), v = '22023', v);
  END LOOP;
  INSERT INTO _r VALUES (4, 'após tentativas inválidas o link anterior segue intacto',
    (SELECT ministerios_docs_url FROM church_settings WHERE church_id = c.c1) = 'https://igv.sharepoint.com/pasta-ministerios', NULL);
  v := set_ministerios_docs_url('');
  INSERT INTO _r VALUES (5, 'texto vazio limpa o link (NULL)', v IS NULL AND (SELECT ministerios_docs_url IS NULL FROM church_settings WHERE church_id = c.c1), NULL);
  v := set_ministerios_docs_url('https://igv.sharepoint.com/nova');
END $$;
RESET ROLE;

-- admin_departments pode; líder e usuário comum não
SELECT pg_temp.login((SELECT u_admdep FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$ DECLARE v text; BEGIN
  v := set_ministerios_docs_url('https://igv.sharepoint.com/admin-dep');
  INSERT INTO _r VALUES (6, 'admin_departments também configura', v = 'https://igv.sharepoint.com/admin-dep', v);
END $$;
RESET ROLE;

SELECT pg_temp.login((SELECT u_lider FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$ DECLARE r text; BEGIN
  BEGIN PERFORM set_ministerios_docs_url('https://x.com/lider'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (7, 'conta de líder NÃO configura o link', r = '42501', r);
END $$;
RESET ROLE;

SELECT pg_temp.login((SELECT u_comum FROM _c), (SELECT c1 FROM _c));
SET LOCAL ROLE authenticated;
DO $$ DECLARE r text; BEGIN
  BEGIN PERFORM set_ministerios_docs_url('https://x.com/comum'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (8, 'usuário comum NÃO configura o link', r = '42501', r);
  BEGIN UPDATE church_settings SET ministerios_docs_url = 'https://x.com/direto' WHERE church_id = '6c127559-874a-4748-8fce-55d4079613a5';
    r := CASE WHEN FOUND THEN 'ESCRITA_DIRETA_PERMITIDA' ELSE 'BLOQUEADA_RLS' END; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (9, 'escrita direta na tabela continua bloqueada por RLS', r <> 'ESCRITA_DIRETA_PERMITIDA', r);
END $$;
RESET ROLE;

-- outra igreja: admin atuando na igreja 2 não toca nas configurações da IGV
SELECT pg_temp.login((SELECT u_admin FROM _c), (SELECT c2 FROM _c));
SET LOCAL ROLE authenticated;
DO $$ DECLARE r text; BEGIN
  BEGIN PERFORM set_ministerios_docs_url('https://x.com/outra-igreja'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (10, 'admin atuando em outra igreja não grava na IGV (recusado ou sem linha própria)', r IN ('42501', 'P0002'), r);
END $$;
RESET ROLE;

-- anon
SET LOCAL ROLE anon;
DO $$ DECLARE r text; BEGIN
  BEGIN PERFORM set_ministerios_docs_url('https://x.com/anon'); r := 'ACEITO'; EXCEPTION WHEN OTHERS THEN r := SQLSTATE; END;
  INSERT INTO _r VALUES (11, 'anon não executa', r = '42501', r);
END $$;
RESET ROLE;

-- preservação
INSERT INTO _r SELECT 12, 'nenhuma outra configuração de nenhuma igreja foi alterada',
  (SELECT count(*) FROM church_settings) = s.n
  AND (SELECT md5(string_agg(md5((to_jsonb(x) - 'ministerios_docs_url' - 'updated_at')::text), '' ORDER BY x.id)) FROM church_settings x) = s.md5_sem_coluna, NULL FROM _snap s;
INSERT INTO _r SELECT 13, 'somente a igreja do chamador recebeu link (as demais seguem NULL)',
  (SELECT count(*) FROM church_settings WHERE ministerios_docs_url IS NOT NULL AND church_id <> '6c127559-874a-4748-8fce-55d4079613a5') = 0, NULL;

SELECT n, teste, ok, info FROM _r ORDER BY n, teste;
ROLLBACK;
