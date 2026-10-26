/**
 * people_delete_unlink.pglite.test.mjs — Lote 1 IGV: exclusão de pessoa sem vínculos residuais.
 *
 * Roda a migration 20261026120000 (e o rollback) num Postgres REAL em memória (PGlite).
 * Zero rede, zero banco de produção, só dados fictícios. O esquema mínimo abaixo reproduz as colunas
 * e os triggers de produção que a migration toca (conferidos em 26/10 via information_schema/pg_trigger).
 *
 *   node supabase/tests/people_delete_unlink.pglite.test.mjs
 *   PGLITE=<caminho>/@electric-sql/pglite/dist/index.js node …   (se o pacote não estiver no projeto)
 *   --control  → roda os mesmos cenários SEM a migration: os checks de limpeza precisam falhar.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CONTROL = process.argv.includes('--control')
const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite')

const MIGRATION = readFileSync(join(ROOT, 'supabase/migrations/20261026120000_people_delete_unlink.sql'), 'utf8')
const ROLLBACK  = readFileSync(join(ROOT, 'docs/rollbacks/20261026120000_people_delete_unlink.rollback.sql'), 'utf8')
const GOVERNANCE = readFileSync(join(ROOT, 'supabase/migrations/20261005100000_ministry_referrals_governance.sql'), 'utf8')
  .match(/CREATE OR REPLACE FUNCTION public\.get_ministry_referrals[\s\S]*?\$function\$;/)[0]

// ── esquema mínimo (colunas/triggers de produção relevantes) ─────────────────
const SCHEMA = `
CREATE ROLE anon; CREATE ROLE authenticated;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
CREATE FUNCTION public.auth_church_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.church', true), '')::uuid $$;
CREATE FUNCTION public.can_manage_ministry(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION public.person_classification_value(uuid) RETURNS text LANGUAGE sql STABLE AS $$ SELECT 'member'::text $$;

CREATE TABLE churches (id uuid PRIMARY KEY);
CREATE TABLE people (id uuid PRIMARY KEY, church_id uuid NOT NULL REFERENCES churches, name text NOT NULL, phone text,
  is_volunteer boolean DEFAULT false, deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE ministries (id uuid PRIMARY KEY, church_id uuid NOT NULL, name text NOT NULL, slug text NOT NULL, leader_id uuid REFERENCES people,
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), leader_user_id uuid);
CREATE TYPE ministry_role AS ENUM ('membro', 'lider', 'coordenador');
CREATE TABLE ministry_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, ministry_id uuid NOT NULL REFERENCES ministries,
  person_id uuid NOT NULL REFERENCES people ON DELETE CASCADE, role ministry_role NOT NULL DEFAULT 'membro', created_at timestamptz NOT NULL DEFAULT now(),
  referred_by uuid, referred_at timestamptz, referral_event_id uuid, added_by uuid);
CREATE TABLE groups (id uuid PRIMARY KEY, church_id uuid NOT NULL, name text NOT NULL, leader_id uuid REFERENCES people, co_leader_id uuid REFERENCES people,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE leaders (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, person_id uuid NOT NULL REFERENCES people ON DELETE CASCADE,
  role text NOT NULL, ministry_id uuid, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE volunteers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), church_id uuid NOT NULL, person_id uuid NOT NULL REFERENCES people ON DELETE CASCADE,
  ministry_id uuid NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE pipeline_stages (id uuid PRIMARY KEY, name text);
CREATE TABLE profiles (user_id uuid PRIMARY KEY, name text, display_name text);
CREATE TABLE user_roles (user_id uuid, church_id uuid, role text);
CREATE TABLE person_journey (id uuid PRIMARY KEY, church_id uuid NOT NULL, person_id uuid NOT NULL REFERENCES people ON DELETE CASCADE, stage_id uuid,
  ministry_id uuid, version int NOT NULL DEFAULT 1, notes text, opened_at timestamptz DEFAULT now(), closed_at timestamptz);
CREATE TABLE journey_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), journey_id uuid NOT NULL, church_id uuid, event_type text NOT NULL,
  actor_id uuid, actor_type text, payload jsonb, created_at timestamptz NOT NULL DEFAULT now());

-- triggers de produção nas tabelas tocadas (corpo idêntico ao de produção)
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER ministries_updated_at BEFORE UPDATE ON ministries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER leaders_updated_at    BEFORE UPDATE ON leaders    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER volunteers_updated_at BEFORE UPDATE ON volunteers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE FUNCTION role_requires_member() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
DECLARE v_person uuid; v_what text;
BEGIN
  IF TG_TABLE_NAME = 'volunteers' THEN
    IF (TG_OP = 'INSERT' AND NEW.is_active) OR (TG_OP = 'UPDATE' AND NEW.is_active AND NOT COALESCE(OLD.is_active, false)) THEN v_person := NEW.person_id; v_what := 'voluntário'; END IF;
  ELSIF TG_TABLE_NAME = 'ministries' THEN
    IF NEW.leader_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.leader_id IS DISTINCT FROM OLD.leader_id) THEN v_person := NEW.leader_id; v_what := 'líder de ministério'; END IF;
  ELSIF TG_TABLE_NAME = 'groups' THEN
    IF NEW.leader_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.leader_id IS DISTINCT FROM OLD.leader_id) THEN v_person := NEW.leader_id; v_what := 'líder de célula';
    ELSIF NEW.co_leader_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.co_leader_id IS DISTINCT FROM OLD.co_leader_id) THEN v_person := NEW.co_leader_id; v_what := 'vice-líder de célula'; END IF;
  END IF;
  IF v_person IS NOT NULL AND person_classification_value(v_person) = 'visitor' THEN
    RAISE EXCEPTION 'CLASSIFICATION_REQUIRED: só um Membro pode ser %', v_what USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER ministries_leader_requires_member BEFORE INSERT OR UPDATE OF leader_id ON ministries FOR EACH ROW EXECUTE FUNCTION role_requires_member();
CREATE TRIGGER groups_leader_requires_member BEFORE INSERT OR UPDATE OF leader_id, co_leader_id ON groups FOR EACH ROW EXECUTE FUNCTION role_requires_member();
CREATE TRIGGER volunteers_requires_member BEFORE INSERT OR UPDATE OF is_active ON volunteers FOR EACH ROW EXECUTE FUNCTION role_requires_member();
CREATE FUNCTION sync_is_volunteer_flag() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $f$
BEGIN
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.is_active = true) THEN UPDATE people SET is_volunteer = true WHERE id = NEW.person_id; END IF;
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW.is_active = false) THEN
    UPDATE people SET is_volunteer = false WHERE id = COALESCE(OLD.person_id, NEW.person_id)
      AND NOT EXISTS (SELECT 1 FROM volunteers v2 WHERE v2.person_id = COALESCE(OLD.person_id, NEW.person_id) AND v2.is_active = true AND v2.id != COALESCE(OLD.id, NEW.id));
  END IF;
  RETURN COALESCE(NEW, OLD);
END $f$;
CREATE TRIGGER trg_volunteer_sync AFTER INSERT OR DELETE OR UPDATE ON volunteers FOR EACH ROW EXECUTE FUNCTION sync_is_volunteer_flag();
${GOVERNANCE}
`

// ids fictícios
const IGV = '11111111-0000-0000-0000-000000000001', OUTRA = '11111111-0000-0000-0000-000000000002'
const A = 'aaaaaaaa-0000-0000-0000-000000000001'      // pessoa que será excluída (IGV)
const B = 'bbbbbbbb-0000-0000-0000-000000000001'      // colega que fica (IGV)
const C = 'cccccccc-0000-0000-0000-000000000001'      // encaminhada que será excluída (IGV)
const D = 'dddddddd-0000-0000-0000-000000000001'      // encaminhada que fica (IGV)
const X = 'eeeeeeee-0000-0000-0000-000000000001'      // pessoa da OUTRA igreja
const M1 = 'f0000000-0000-0000-0000-000000000001', M2 = 'f0000000-0000-0000-0000-000000000002', MX = 'f0000000-0000-0000-0000-000000000009'
const G1 = '90000000-0000-0000-0000-000000000001', G2 = '90000000-0000-0000-0000-000000000002', GX = '90000000-0000-0000-0000-000000000009'

const SEED = `
INSERT INTO churches VALUES ('${IGV}'), ('${OUTRA}');
INSERT INTO people (id, church_id, name, phone) VALUES
  ('${A}', '${IGV}', 'Líder Fictício', '+5520900000001'), ('${B}', '${IGV}', 'Colega Fictício', '+5520900000002'),
  ('${C}', '${IGV}', 'Encaminhado Fictício', '+5520900000003'), ('${D}', '${IGV}', 'Outro Encaminhado', '+5520900000004'),
  ('${X}', '${OUTRA}', 'Pessoa da Outra Igreja', '+5520900000001');
INSERT INTO ministries (id, church_id, name, slug, leader_id) VALUES
  ('${M1}', '${IGV}', 'ACOLHIMENTO', 'acolhimento', '${A}'), ('${M2}', '${IGV}', 'LOUVOR', 'louvor', '${B}'), ('${MX}', '${OUTRA}', 'OUTRA', 'outra', '${X}');
INSERT INTO groups (id, church_id, name, leader_id, co_leader_id) VALUES
  ('${G1}', '${IGV}', 'Célula 1', '${B}', '${A}'), ('${G2}', '${IGV}', 'Célula 2', '${A}', '${B}'), ('${GX}', '${OUTRA}', 'Célula X', '${X}', NULL);
INSERT INTO ministry_members (church_id, ministry_id, person_id, role, referred_by, referred_at) VALUES
  ('${IGV}', '${M1}', '${A}', 'lider', NULL, NULL), ('${IGV}', '${M2}', '${A}', 'membro', '${B}', now()),
  ('${IGV}', '${M1}', '${B}', 'membro', NULL, NULL), ('${OUTRA}', '${MX}', '${X}', 'lider', NULL, NULL);
INSERT INTO leaders (church_id, person_id, role, ministry_id) VALUES ('${IGV}', '${A}', 'lider', '${M1}'), ('${IGV}', '${B}', 'lider', '${M2}'), ('${OUTRA}', '${X}', 'lider', '${MX}');
INSERT INTO volunteers (church_id, person_id, ministry_id) VALUES ('${IGV}', '${A}', '${M2}'), ('${IGV}', '${B}', '${M2}'), ('${OUTRA}', '${X}', '${MX}');
INSERT INTO person_journey (id, church_id, person_id, ministry_id, notes) VALUES
  ('12000000-0000-0000-0000-00000000000c', '${IGV}', '${C}', '${M2}', 'nota C'), ('12000000-0000-0000-0000-00000000000d', '${IGV}', '${D}', '${M2}', 'nota D');
INSERT INTO journey_events (journey_id, church_id, event_type, actor_type, payload) VALUES
  ('12000000-0000-0000-0000-00000000000c', '${IGV}', 'ministry_referral', 'human', jsonb_build_object('ministry_id', '${M2}')),
  ('12000000-0000-0000-0000-00000000000d', '${IGV}', 'ministry_referral', 'human', jsonb_build_object('ministry_id', '${M2}'));
`

const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const J = JSON.stringify

const db = new PGlite()
await db.exec(SCHEMA)
await db.exec(SEED)
if (!CONTROL) await db.exec(MIGRATION)
const one = async (sql) => (await db.query(sql)).rows[0]
const all = async (sql) => (await db.query(sql)).rows
const fila = async () => { await db.exec(`SELECT set_config('test.church', '${IGV}', false)`); return (await all(`SELECT person_id FROM get_ministry_referrals()`)).map(r => r.person_id).sort() }
const snapOutra = async () => J(await all(`SELECT 'm' t, id::text, leader_id::text a, null b, null::boolean c FROM ministries WHERE church_id='${OUTRA}'
  UNION ALL SELECT 'g', id::text, leader_id::text, co_leader_id::text, null FROM groups WHERE church_id='${OUTRA}'
  UNION ALL SELECT 'mm', person_id::text, ministry_id::text, role::text, null FROM ministry_members WHERE church_id='${OUTRA}'
  UNION ALL SELECT 'l', person_id::text, null, null, is_active FROM leaders WHERE church_id='${OUTRA}'
  UNION ALL SELECT 'v', person_id::text, null, null, is_active FROM volunteers WHERE church_id='${OUTRA}' ORDER BY 1, 2`))
const snapB = async () => J(await all(`SELECT 'mm' t, ministry_id::text a FROM ministry_members WHERE person_id='${B}'
  UNION ALL SELECT 'l', is_active::text FROM leaders WHERE person_id='${B}' UNION ALL SELECT 'v', is_active::text FROM volunteers WHERE person_id='${B}'
  UNION ALL SELECT 'm2', leader_id::text FROM ministries WHERE id='${M2}' ORDER BY 1, 2`))

const outraAntes = await snapOutra(), bAntes = await snapB(), filaAntes = await fila()
ck('Pré-condição: fila mostra os dois encaminhados (C e D)', J(filaAntes) === J([C, D].sort()), J(filaAntes))

// 1) Alterar outro campo de A não dispara nada
await db.exec(`UPDATE people SET name = 'Líder Renomeado' WHERE id = '${A}'`)
ck('Atualizar nome de pessoa ativa não desfaz vínculos', (await one(`SELECT leader_id FROM ministries WHERE id='${M1}'`)).leader_id === A)

// 2) Excluir A
await db.exec(`UPDATE people SET deleted_at = now() WHERE id = '${A}'`)
const m1 = await one(`SELECT leader_id FROM ministries WHERE id='${M1}'`)
const g = await all(`SELECT id, leader_id, co_leader_id FROM groups WHERE church_id='${IGV}' ORDER BY id`)
const mmA = await one(`SELECT count(*)::int n FROM ministry_members WHERE person_id='${A}'`)
const lA = await one(`SELECT bool_or(is_active) a FROM leaders WHERE person_id='${A}'`)
const vA = await one(`SELECT bool_or(is_active) a FROM volunteers WHERE person_id='${A}'`)
const pA = await one(`SELECT name, deleted_at IS NOT NULL del, is_volunteer FROM people WHERE id='${A}'`)
ck('Excluir líder → ministério fica sem líder (leader_id NULL)', m1.leader_id === null, J(m1))
ck('Excluir → liderança e co-liderança de célula ficam vazias; o outro líder da célula permanece', g[0].leader_id === B && g[0].co_leader_id === null && g[1].leader_id === null && g[1].co_leader_id === B, J(g))
ck('Excluir → vínculos de ministério removidos (inclusive o vindo de encaminhamento)', mmA.n === 0, J(mmA))
ck('Excluir → papéis em leaders/volunteers desativados', lA.a === false && vA.a === false, J({ lA, vA }))
ck('A pessoa excluída continua no banco, com os dados dela (só deleted_at e is_volunteer mudam)', pA.name === 'Líder Renomeado' && pA.del && pA.is_volunteer === false, J(pA))
ck('Colega da mesma igreja intacto (vínculos, papéis e liderança do LOUVOR)', (await snapB()) === bAntes)
ck('Isolamento: OUTRA igreja intacta (mesmo telefone, mesmos papéis)', (await snapOutra()) === outraAntes)

if (!CONTROL) {
  const log = await all(`SELECT table_name, action, row_before FROM people_deletion_unlinks WHERE person_id='${A}' ORDER BY table_name, action`)
  const resumo = log.map(r => r.table_name + ':' + r.action)
  ck('Registro de restauração: 1 linha por vínculo desfeito, com o estado anterior', J(resumo) === J(['groups:clear_co_leader_id', 'groups:clear_leader_id', 'leaders:deactivate', 'ministries:clear_leader_id', 'ministry_members:delete', 'ministry_members:delete', 'volunteers:deactivate']), J(resumo))
  ck('Registro guarda o líder antigo do ministério', log.find(r => r.table_name === 'ministries').row_before.leader_id === A)
  ck('Registro guarda o encaminhamento removido (referred_by)', log.some(r => r.table_name === 'ministry_members' && r.row_before.referred_by === B))
  const ownerLog = await one(`SELECT count(*)::int n FROM people_deletion_unlinks WHERE church_id <> '${IGV}'`)
  ck('Registro só tem linhas da igreja da pessoa', ownerLog.n === 0)
  // 3) idempotência: novo UPDATE de deleted_at em quem já está excluído
  await db.exec(`UPDATE people SET deleted_at = now() WHERE id = '${A}'`)
  ck('Reexcluir quem já está excluído não gera nada novo', (await one(`SELECT count(*)::int n FROM people_deletion_unlinks`)).n === log.length)
  // 4) privilégios
  const priv = await one(`SELECT has_table_privilege('authenticated', 'people_deletion_unlinks', 'SELECT') a, has_table_privilege('anon', 'people_deletion_unlinks', 'SELECT') b,
                                 has_function_privilege('authenticated', 'people_unlink_on_delete()', 'EXECUTE') c`)
  ck('Registro e função fechados para anon/authenticated', !priv.a && !priv.b && !priv.c, J(priv))
}

// 5) Fila de encaminhamentos
await db.exec(`UPDATE people SET deleted_at = now() WHERE id = '${C}'`)
const filaDepois = await fila()
ck('Fila de Encaminhamentos: pessoa excluída sai; a outra continua', J(filaDepois) === J([D]), J(filaDepois))
const jC = await one(`SELECT ministry_id, closed_at, notes FROM person_journey WHERE person_id='${C}'`)
ck('A jornada da pessoa excluída não é alterada (histórico preservado)', jC.ministry_id === M2 && jC.closed_at === null && jC.notes === 'nota C', J(jC))

// 6) Recadastro: pessoa nova com o mesmo telefone não herda vínculos
await db.exec(`INSERT INTO people (id, church_id, name, phone) VALUES ('aaaaaaaa-0000-0000-0000-000000000002', '${IGV}', 'Líder Recadastrado', '+5520900000001')`)
const novos = await one(`SELECT (SELECT count(*)::int FROM ministry_members WHERE person_id='aaaaaaaa-0000-0000-0000-000000000002') mm, (SELECT leader_id FROM ministries WHERE id='${M1}') l`)
ck('Recadastro: pessoa nova começa sem vínculos herdados', novos.mm === 0 && novos.l === null, J(novos))

if (!CONTROL) {
  // 7) Rollback
  await db.exec(ROLLBACK)
  const trg = await one(`SELECT count(*)::int n FROM pg_trigger WHERE tgname = 'people_unlink_on_delete'`)
  await db.exec(`UPDATE ministries SET leader_id = '${B}' WHERE id = '${M1}'`)
  await db.exec(`UPDATE people SET deleted_at = now() WHERE id = '${B}'`)
  const semTrigger = await one(`SELECT leader_id FROM ministries WHERE id='${M1}'`)
  const filaRb = await fila()
  const logKept = await one(`SELECT count(*)::int n FROM people_deletion_unlinks`)
  ck('Rollback: trigger removido (exclusão volta ao comportamento anterior)', trg.n === 0 && semTrigger.leader_id === B, J({ trg, semTrigger }))
  ck('Rollback: fila volta à versão anterior (mostra a pessoa excluída)', filaRb.includes(C), J(filaRb))
  ck('Rollback: registro de restauração preservado', logKept.n > 0, J(logKept))
}

const failed = results.filter(x => !x).length
console.log(`\n=== ${CONTROL ? 'CONTROLE (sem migration) ' : ''}${results.length - failed}/${results.length} OK ===`)
process.exit(CONTROL ? 0 : failed ? 1 : 0)
