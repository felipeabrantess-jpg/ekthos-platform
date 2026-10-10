/**
 * public_forms_phone.test.mjs — executa o CÓDIGO REAL dos quatro formulários públicos
 * (visitor-capture, igv-public-enrollment, igv-prayer-request, igv-cabinet-request)
 * contra um Supabase em memória. Zero rede, zero banco.
 *   node supabase/tests/public_forms_phone.test.mjs            → versão da branch
 *   node supabase/tests/public_forms_phone.test.mjs --control <dir>
 *        → também roda as versões anteriores (dir/<função>/index.ts) para provar que o
 *          teste detecta a sobrescrita antiga.
 *
 * O "banco" em memória reproduz o que a migration 20261003100000 garante
 * (people.phone_normalized + bloqueio 23505 de telefone já vinculado na mesma igreja).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FN = join(HERE, '..', 'functions')
const ctlIdx = process.argv.indexOf('--control')
const CONTROL = ctlIdx > 0 ? process.argv[ctlIdx + 1] : null

const IGV = '6c127559-874a-4748-8fce-55d4079613a5', OUTRA = 'church-2'
const norm = (raw) => { const d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, ''); if (!d) return null; return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d }

function makeDb(seed = {}) {
  const t = new Proxy({ ...seed }, { get: (o, k) => (k in o ? o[k] : (o[k] = [])) })
  const rpcCalls = []; let seq = 0
  const gen = (table, r) => table === 'people' ? { ...r, phone_normalized: norm(r.phone) } : r
  function builder(table) {
    const st = { op: 'select', filters: [], orders: [], limit: null, head: false, payload: null }
    const match = (r) => st.filters.every(f => f(gen(table, r)))
    const run = () => {
      if (st.op === 'insert') {
        const out = []
        for (const p of Array.isArray(st.payload) ? st.payload : [st.payload]) {
          const now = new Date(Date.now() + ++seq).toISOString()
          const r = { id: `${table}-${seq}`, created_at: now, submitted_at: now, deleted_at: null, ...p }
          if (table === 'people') {
            const k = norm(r.phone)
            if (k && t.people.some(x => x.church_id === r.church_id && !x.deleted_at && norm(x.phone) === k))
              return { data: null, error: { code: '23505', message: 'PHONE_ALREADY_LINKED: Este telefone já está vinculado a uma pessoa cadastrada.' } }
          }
          t[table].push(r); out.push(gen(table, r))
        }
        return { data: out, error: null }
      }
      if (st.op === 'update') { const hit = t[table].filter(match); hit.forEach(r => Object.assign(r, st.payload)); return { data: hit.map(r => gen(table, r)), error: null } }
      if (st.op === 'delete') { const hit = t[table].filter(match); for (const r of hit) t[table].splice(t[table].indexOf(r), 1); return { data: hit, error: null } }
      let out = t[table].filter(match).map(r => gen(table, r))
      for (const [c, asc] of [...st.orders].reverse()) out = [...out].sort((a, b) => (a[c] ?? '') < (b[c] ?? '') ? (asc ? -1 : 1) : (a[c] ?? '') > (b[c] ?? '') ? (asc ? 1 : -1) : 0)
      if (st.limit != null) out = out.slice(0, st.limit)
      return { data: out, error: null, count: out.length }
    }
    const api = {
      select(_c, o) { if (st.op === 'select') st.head = !!o?.head; return api },
      insert(p) { st.op = 'insert'; st.payload = p; return api },
      update(p) { st.op = 'update'; st.payload = p; return api },
      delete() { st.op = 'delete'; return api },
      eq(c, v) { st.filters.push(r => r[c] === v); return api },
      neq(c, v) { st.filters.push(r => r[c] !== v); return api },
      in(c, vs) { st.filters.push(r => vs.includes(r[c])); return api },
      is(c, v) { st.filters.push(r => (r[c] ?? null) === v); return api },
      gte(c, v) { st.filters.push(r => r[c] >= v); return api },
      order(c, o) { st.orders.push([c, o?.ascending !== false]); return api },
      limit(n) { st.limit = n; return api },
      async maybeSingle() { const r = run(); if (r.error) return r; if (r.data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }; return { data: r.data[0] ?? null, error: null } },
      async single() { const r = run(); if (r.error) return r; if (r.data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not single' } }; return { data: r.data[0], error: null } },
      then(res, rej) { const r = run(); return Promise.resolve(st.head ? { data: null, error: r.error, count: r.count } : r).then(res, rej) },
    }
    return api
  }
  return { t, rpcCalls, client: { from: builder, rpc: async (name, args) => { rpcCalls.push({ name, args }); return { data: null, error: null } } } }
}

async function load(file, db) {
  let src = readFileSync(file, 'utf8')
  const imp = /import \{ createClient \} from ['"](?:https:\/\/esm\.sh\/@supabase\/supabase-js@2|jsr:@supabase\/supabase-js@2)['"];?\r?\n/
  if (!imp.test(src)) throw new Error('import do supabase-js não encontrado em ' + file)
  src = src.replace(imp, 'const createClient = (globalThis as any).__createClient\n').replace(/import "jsr:@supabase\/functions-js\/edge-runtime\.d\.ts";?\r?\n/, '')
  const out = join(mkdtempSync(join(tmpdir(), 'ef-')), 'index.ts'); writeFileSync(out, src)
  let handler = null
  globalThis.__createClient = () => db.client
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'srv', ALLOWED_ORIGIN: 'https://app.ekthoschurch.com' })[k] }, serve: (h) => { handler = h } }
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  await import(pathToFileURL(out).href + '?v=' + Math.random())
  return handler
}
const post = async (h, body) => { const res = await h(new Request('http://x/fn', { method: 'POST', headers: { origin: 'https://app.ekthoschurch.com', 'content-type': 'application/json', 'x-forwarded-for': '10.0.0.' + Math.floor(Math.random() * 250) }, body: JSON.stringify(body) })); await new Promise(r => setTimeout(r, 40)); return res }
const marcelo = (phone, extra = {}) => ({ id: 'marcelo', church_id: IGV, name: 'Marcelo Souza', phone, email: null, observacoes_pastorais: 'Anotação pastoral original', first_visit_date: null, conversion_date: null, last_contact_at: null, source: 'import_xlsx', created_at: '2026-01-01', deleted_at: null, ...extra })
const ident = (p) => JSON.stringify([p.name, p.phone, p.observacoes_pastorais, p.email, p.source])

async function runAll(dirOf) {
  const o = {}; const log = { log: console.log, warn: console.warn, error: console.error }; console.log = console.warn = console.error = () => {}
  try {
    // ── visitor-capture ─────────────────────────────────────
    const qr = () => ({ qr_codes: [{ id: 'qr-1', church_id: IGV, unit_id: 'unit-1', slug: 'igv', is_active: true }, { id: 'qr-2', church_id: OUTRA, unit_id: null, slug: 'outra', is_active: true }] })
    const vc = async (seedPeople, body) => { const db = makeDb({ ...qr(), people: seedPeople }); const h = await load(dirOf('visitor-capture'), db); const res = await post(h, body); return { db, status: res.status, body: await res.clone().json().catch(() => null) } }
    { const { db, status } = await vc([marcelo('+5521999990000')], { slug: 'igv', name: 'João Pereira', phone: '(21) 99999-0000', invited_by_name: 'Fulano', entry_type: 'visitante' })
      const p = db.t.people[0]
      o.vc_existente = { status, pessoas: db.t.people.length, identidade: ident(p) === ident(marcelo('+5521999990000')), visita: !!p.first_visit_date && !!p.last_contact_at, pipeline: db.rpcCalls.some(c => c.name === 'capture_visitor_to_pipeline' && c.args.p_person_id === 'marcelo') } }
    o.vc_formatos = {}
    for (const stored of ['5521999990000', '21999990000', '(21) 99999-0000', '+552199990000']) {   // último: variante sem o 9º dígito (R8b já homologado)
      const { db } = await vc([marcelo(stored)], { slug: 'igv', name: 'João Pereira', phone: '21 99999-0000', invited_by_name: 'Fulano' })
      o.vc_formatos[stored] = db.t.people.length === 1 && ident(db.t.people[0]) === ident(marcelo(stored))
    }
    { const a = await vc([marcelo('+5521999990000', { conversion_date: '2020-05-05', first_visit_date: '2019-01-01' })], { slug: 'igv', name: 'João Pereira', phone: '21999990000', entry_type: 'novo_convertido' })
      const b = await vc([marcelo('+5521999990000')], { slug: 'igv', name: 'Marcelo Souza', phone: '21999990000', entry_type: 'novo_convertido' })
      o.vc_datas = { naoSobrescreve: a.db.t.people[0].conversion_date === '2020-05-05' && a.db.t.people[0].first_visit_date === '2019-01-01', preencheVazia: !!b.db.t.people[0].conversion_date && !!b.db.t.people[0].first_visit_date } }
    { const { db, status } = await vc([marcelo('+5521999990000')], { slug: 'igv', name: 'João Pereira', phone: '21999990000', entry_type: 'ja_sou_membro' })
      o.vc_membro = { status, pessoas: db.t.people.length, identidade: ident(db.t.people[0]) === ident(marcelo('+5521999990000')), contato: !!db.t.people[0].last_contact_at } }
    { const { db, status } = await vc([], { slug: 'igv', name: 'Carla Nova', phone: '(21) 97777-1111', invited_by_name: 'Fulano', entry_type: 'visitante' })
      const p = db.t.people[0]
      o.vc_novo = { status, pessoas: db.t.people.length, name: p?.name, phone: p?.phone, source: p?.source, obs: p?.observacoes_pastorais, unit: p?.unit_id, church: p?.church_id } }
    { const outra = { ...marcelo('+5521999990000'), id: 'outra', church_id: OUTRA, name: 'Pessoa da Igreja 2' }
      const { db } = await vc([outra], { slug: 'igv', name: 'João Pereira', phone: '21999990000' })
      o.vc_tenant = { criouNaIgv: db.t.people.some(p => p.church_id === IGV && p.name === 'João Pereira'), outraIntacta: ident(db.t.people.find(p => p.id === 'outra')) === ident(outra), total: db.t.people.length } }

    // ── item 8/12: aviso "USUÁRIO JÁ CADASTRADO" (só quando o telefone já existe) ──
    { const e = await vc([marcelo('+5521999990000')], { slug: 'igv', name: 'João Pereira', phone: '(21) 99999-0000', entry_type: 'visitante' })
      const m = await vc([marcelo('+5521999990000')], { slug: 'igv', name: 'João Pereira', phone: '21999990000', entry_type: 'ja_sou_membro' })
      const n = await vc([], { slug: 'igv', name: 'Carla Nova', phone: '(21) 97777-1111', entry_type: 'visitante' })
      const x = await vc([], { slug: 'slug-inexistente', name: 'Carla Nova', phone: '(21) 97777-1111' })
      const o24 = makeDb({ ...qr(), people: [] }); const h24 = await load(dirOf('visitor-capture'), o24)
      const r1 = await (await post(h24, { slug: 'igv', name: 'Carla Nova', phone: '(21) 97777-1111' })).json()
      const r2 = await (await post(h24, { slug: 'igv', name: 'Carla Outra', phone: '21 97777 1111' })).json()
      o.aviso = { existente: e.body, membro: m.body, novo: n.body, slugInvalido: x.body, novoDepoisRepetido: r1, repetido24h: r2, pessoasAposRepetir: o24.t.people.length, nomeMantido: o24.t.people[0]?.name } }

    // ── igv-public-enrollment ───────────────────────────────
    const course = () => ({ church_courses: [{ id: 'course-1', church_id: IGV, title: 'Curso', is_public: true, active: true, max_capacity: null, enrolled_count: 0 }] })
    { const db = makeDb({ ...course(), people: [marcelo('21999990000')] }); const h = await load(dirOf('igv-public-enrollment'), db)
      const res = await post(h, { course_id: 'course-1', name: 'João Pereira', phone: '(21) 99999-0000' })
      o.curso_existente = { status: res.status, pessoas: db.t.people.length, identidade: ident(db.t.people[0]) === ident(marcelo('21999990000')), inscricao: db.t.course_enrollments.length, vinculo: db.t.course_enrollments[0]?.person_id } }
    { const db = makeDb({ ...course(), people: [] }); const h = await load(dirOf('igv-public-enrollment'), db)
      const res = await post(h, { course_id: 'course-1', name: 'Carla Nova', phone: '(21) 97777-1111' })
      o.curso_novo = { status: res.status, pessoas: db.t.people.length, name: db.t.people[0]?.name, source: db.t.people[0]?.source, vinculo: db.t.course_enrollments[0]?.person_id === db.t.people[0]?.id } }

    // ── igv-prayer-request ──────────────────────────────────
    { const db = makeDb({ people: [marcelo('5521999990000')] }); const h = await load(dirOf('igv-prayer-request'), db)
      const res = await post(h, { name: 'João Pereira', phone: '21 99999-0000', request_text: 'Peço oração pela minha família.' })
      o.oracao_existente = { status: res.status, pessoas: db.t.people.length, identidade: ident(db.t.people[0]) === ident(marcelo('5521999990000')), pedidos: db.t.prayer_requests.length, vinculo: db.t.prayer_requests[0]?.person_id } }
    { const db = makeDb({ people: [] }); const h = await load(dirOf('igv-prayer-request'), db)
      const res = await post(h, { name: 'Carla Nova', phone: '21 97777-1111', request_text: 'Peço oração pela minha família.' })
      o.oracao_novo = { status: res.status, pessoas: db.t.people.length, name: db.t.people[0]?.name, source: db.t.people[0]?.source, vinculo: db.t.prayer_requests[0]?.person_id === db.t.people[0]?.id } }

    // ── igv-cabinet-request ─────────────────────────────────
    { const db = makeDb({ people: [marcelo('+5521999990000')] }); const h = await load(dirOf('igv-cabinet-request'), db)
      const res = await post(h, { name: 'João Pereira', phone: '(21) 99999-0000', theme: 'Oração', appointment_type: 'Individual' })
      o.gabinete_existente = { status: res.status, pessoas: db.t.people.length, identidade: ident(db.t.people[0]) === ident(marcelo('+5521999990000')), pedidos: db.t.pastoral_appointments.length, vinculo: db.t.pastoral_appointments[0]?.person_id } }
    { const db = makeDb({ people: [] }); const h = await load(dirOf('igv-cabinet-request'), db)
      const res = await post(h, { name: 'Carla Nova', phone: '(21) 97777-1111', theme: 'Oração', appointment_type: 'Individual' })
      o.gabinete_novo = { status: res.status, pessoas: db.t.people.length, name: db.t.people[0]?.name, source: db.t.people[0]?.source, vinculo: db.t.pastoral_appointments[0]?.person_id === db.t.people[0]?.id } }
  } finally { Object.assign(console, log) }
  return o
}

const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const N = await runAll((f) => join(FN, f, 'index.ts'))
const J = JSON.stringify

ck('QR (visitor-capture): telefone existente + nome diferente → não cria, não renomeia, não troca observações/telefone', N.vc_existente.status === 200 && N.vc_existente.pessoas === 1 && N.vc_existente.identidade, J(N.vc_existente))
ck('QR: datas operacionais mantidas (visita/contato registrados, pessoa segue para o pipeline)', N.vc_existente.visita && N.vc_existente.pipeline)
ck('QR: acha o dono do telefone em qualquer formato gravado (55, DDD, máscara, sem 9º dígito)', Object.values(N.vc_formatos).every(Boolean), J(N.vc_formatos))
ck('QR: conversão/primeira visita só preenchem quando vazias; nunca sobrescrevem', N.vc_datas.naoSobrescreve && N.vc_datas.preencheVazia, J(N.vc_datas))
ck('QR "já sou membro": só registra o contato', N.vc_membro.status === 200 && N.vc_membro.pessoas === 1 && N.vc_membro.identidade && N.vc_membro.contato)
ck('Aviso: telefone existente (visitante) → already_registered + "USUÁRIO JÁ CADASTRADO", sem criar/alterar identidade', N.aviso.existente?.already_registered === true && N.aviso.existente?.message === 'USUÁRIO JÁ CADASTRADO' && N.vc_existente.pessoas === 1 && N.vc_existente.identidade, J(N.aviso.existente))
ck('Aviso: telefone existente ("já sou membro") → already_registered', N.aviso.membro?.already_registered === true, J(N.aviso.membro))
ck('Aviso: cadastro novo → sucesso atual, sem already_registered', N.aviso.novo?.success === true && N.aviso.novo?.already_registered === undefined && N.aviso.novo?.message === 'Cadastro realizado!', J(N.aviso.novo))
ck('Aviso: slug inexistente → resposta genérica (não revela nada)', N.aviso.slugInvalido?.already_registered === undefined && N.aviso.slugInvalido?.success === true, J(N.aviso.slugInvalido))
ck('Aviso: reenvio em 24h → avisa e não duplica nem renomeia', N.aviso.novoDepoisRepetido?.already_registered === undefined && N.aviso.repetido24h?.already_registered === true && N.aviso.pessoasAposRepetir === 1 && N.aviso.nomeMantido === 'Carla Nova', J({ r1: N.aviso.novoDepoisRepetido, r2: N.aviso.repetido24h, p: N.aviso.pessoasAposRepetir, nome: N.aviso.nomeMantido }))
ck('QR: telefone novo → cadastro criado como antes (nome, origem, unidade, "Convidado por")', N.vc_novo.pessoas === 1 && N.vc_novo.name === 'Carla Nova' && N.vc_novo.phone === '+5521977771111' && N.vc_novo.source === 'qr_code' && N.vc_novo.obs === 'Convidado por: Fulano' && N.vc_novo.unit === 'unit-1' && N.vc_novo.church === IGV, J(N.vc_novo))
ck('QR: mesmo telefone em outra igreja → cria na igreja do QR; a outra fica intacta', N.vc_tenant.criouNaIgv && N.vc_tenant.outraIntacta && N.vc_tenant.total === 2)
ck('Curso IGV: telefone existente (outro formato) → não cria, não renomeia; inscrição vinculada à pessoa certa', N.curso_existente.status === 200 && N.curso_existente.pessoas === 1 && N.curso_existente.identidade && N.curso_existente.inscricao === 1 && N.curso_existente.vinculo === 'marcelo', J(N.curso_existente))
ck('Curso IGV: telefone novo → cria como antes', N.curso_novo.status === 200 && N.curso_novo.pessoas === 1 && N.curso_novo.name === 'Carla Nova' && N.curso_novo.source === 'curso_igv' && N.curso_novo.vinculo, J(N.curso_novo))
ck('Oração IGV: telefone existente (outro formato) → não cria, não renomeia; pedido vinculado à pessoa certa', N.oracao_existente.pessoas === 1 && N.oracao_existente.identidade && N.oracao_existente.pedidos === 1 && N.oracao_existente.vinculo === 'marcelo' && N.oracao_existente.status < 300, J(N.oracao_existente))
ck('Oração IGV: telefone novo → cria como antes', N.oracao_novo.pessoas === 1 && N.oracao_novo.name === 'Carla Nova' && N.oracao_novo.source === 'oracao_igv' && N.oracao_novo.vinculo, J(N.oracao_novo))
ck('Gabinete IGV: telefone existente (outro formato) → não cria, não renomeia; pedido vinculado à pessoa certa', N.gabinete_existente.pessoas === 1 && N.gabinete_existente.identidade && N.gabinete_existente.pedidos === 1 && N.gabinete_existente.vinculo === 'marcelo' && N.gabinete_existente.status < 300, J(N.gabinete_existente))
ck('Gabinete IGV: telefone novo → cria como antes', N.gabinete_novo.pessoas === 1 && N.gabinete_novo.name === 'Carla Nova' && N.gabinete_novo.source === 'gabinete_igv' && N.gabinete_novo.vinculo, J(N.gabinete_novo))

if (CONTROL) {
  const O = await runAll((f) => join(CONTROL, f, 'index.ts'))
  console.log('\n— controle: versões anteriores (o teste precisa detectar a sobrescrita antiga) —')
  ck('CONTROLE QR: a versão anterior renomeava/trocava observações', O.vc_existente.identidade === false)
  ck('CONTROLE Curso: a versão anterior não achava outro formato (duplicava) ou renomeava', O.curso_existente.identidade === false || O.curso_existente.pessoas !== 1 || O.curso_existente.vinculo !== 'marcelo', J(O.curso_existente))
  ck('CONTROLE Oração: idem', O.oracao_existente.identidade === false || O.oracao_existente.pessoas !== 1 || O.oracao_existente.vinculo !== 'marcelo', J(O.oracao_existente))
  ck('CONTROLE Gabinete: idem', O.gabinete_existente.identidade === false || O.gabinete_existente.pessoas !== 1 || O.gabinete_existente.vinculo !== 'marcelo', J(O.gabinete_existente))
  for (const k of ['vc_novo', 'curso_novo', 'oracao_novo', 'gabinete_novo']) ck(`telefone novo: resultado idêntico ao da versão anterior (${k})`, J(O[k]) === J(N[k]))
}

const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
