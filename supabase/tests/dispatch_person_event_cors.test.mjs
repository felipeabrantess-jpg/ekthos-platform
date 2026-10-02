/**
 * dispatch_person_event_cors.test.mjs — executa o CÓDIGO REAL de dispatch-person-event contra um
 * Supabase em memória. Zero rede, zero banco.
 *   node supabase/tests/dispatch_person_event_cors.test.mjs [--control <arquivo da versão anterior>]
 * Cobre: preflight/CORS do cadastro manual (app.ekthoschurch.com) e o fluxo
 * cadastro manual → dispatch recebido → acolhimento_journey criada → agent-acolhimento invocado.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'functions', 'dispatch-person-event', 'index.ts')
const ctlIdx = process.argv.indexOf('--control'); const CONTROL = ctlIdx > 0 ? process.argv[ctlIdx + 1] : null
const CH = 'church-1', APP = 'https://app.ekthoschurch.com'

function makeDb(seed = {}) {
  const t = new Proxy({ ...seed }, { get: (o, k) => (k in o ? o[k] : (o[k] = [])) })
  let seq = 0; const writes = []
  function builder(table) {
    const st = { op: 'select', filters: [], limit: null, payload: null, head: false }
    const match = (r) => st.filters.every(f => f(r))
    const run = () => {
      if (st.op === 'insert') { const rows = (Array.isArray(st.payload) ? st.payload : [st.payload]).map(p => ({ id: `${table}-${++seq}`, created_at: new Date().toISOString(), ...p })); t[table].push(...rows); writes.push({ table, op: 'insert', rows }); return { data: rows, error: null } }
      if (st.op === 'update') { const hit = t[table].filter(match); hit.forEach(r => Object.assign(r, st.payload)); writes.push({ table, op: 'update', n: hit.length, set: st.payload }); return { data: hit, error: null } }
      let out = t[table].filter(match); if (st.limit != null) out = out.slice(0, st.limit); return { data: out, error: null, count: out.length }
    }
    const api = {
      select(_c, o) { if (st.op === 'select') st.head = !!o?.head; return api },
      insert(p) { st.op = 'insert'; st.payload = p; return api }, update(p) { st.op = 'update'; st.payload = p; return api },
      eq(c, v) { st.filters.push(r => (c.includes('.') ? true : r[c] === v)); return api },
      is(c, v) { st.filters.push(r => (r[c] ?? null) === v); return api },
      or() { return api }, in(c, vs) { st.filters.push(r => vs.includes(r[c])); return api }, limit(n) { st.limit = n; return api }, order() { return api },
      async maybeSingle() { const r = run(); return { data: r.data[0] ?? null, error: null } },
      async single() { const r = run(); return r.data[0] ? { data: r.data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not found' } } },
      then(res, rej) { const r = run(); return Promise.resolve(st.head ? { data: null, error: null, count: r.count } : r).then(res, rej) },
    }
    return api
  }
  return { t, writes, client: { from: builder, rpc: async () => ({ data: null, error: null }) } }
}
async function load(file, db, fetchLog) {
  let src = readFileSync(file, 'utf8')
  const imp = /import \{ createClient \} from ['"]https:\/\/esm\.sh\/@supabase\/supabase-js@2['"];?\r?\n/
  if (!imp.test(src)) throw new Error('import do supabase-js não encontrado')
  src = src.replace(imp, 'const createClient = (globalThis as any).__createClient\n')
  const out = join(mkdtempSync(join(tmpdir(), 'dpe-')), 'index.ts'); writeFileSync(out, src)
  let handler = null
  globalThis.__createClient = () => db.client
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'srv' })[k] }, serve: (h) => { handler = h } }
  globalThis.fetch = async (url, init) => { fetchLog.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200 }) }
  await import(pathToFileURL(out).href + '?v=' + Math.random())
  return handler
}
const seed = () => ({
  people: [{ id: 'p-manual', church_id: CH, name: 'Pessoa Manual', phone: '+5521999990000', email: null, source: 'manual', person_stage: 'visitante', is_bulk_import: false, como_conheceu: null, observacoes_pastorais: null, first_visit_date: null }],
  agent_grants: [{ id: 'g1', church_id: CH, agent_slug: 'agent-acolhimento', revoked_at: null, ends_at: null }],
  churches: [{ id: CH, name: 'Igreja T', slug: 't' }],
})
const quiet = () => { const o = { ...console }; console.log = console.warn = console.error = () => {}; return () => Object.assign(console, o) }
async function run(file) {
  const restore = quiet(); const out = {}
  try {
    const db = makeDb(seed()); const fetchLog = []; const h = await load(file, db, fetchLog)
    const headersOf = (r) => Object.fromEntries([...r.headers.entries()])
    // 1. preflight do navegador, origem do app
    const pre = await h(new Request('http://x/dispatch-person-event', { method: 'OPTIONS', headers: { origin: APP, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization,content-type,apikey,x-client-info' } }))
    out.preflight = { status: pre.status, body: await pre.text(), h: headersOf(pre) }
    // 2. POST como o PersonModal faz (supabase.functions.invoke, com Origin do app)
    const post = await h(new Request('http://x/dispatch-person-event', { method: 'POST', headers: { origin: APP, 'content-type': 'application/json', authorization: 'Bearer user-jwt', apikey: 'anon' }, body: JSON.stringify({ person_id: 'p-manual', event: 'person_created' }) }))
    await new Promise(r => setTimeout(r, 50))
    out.post = { status: post.status, body: await post.json(), h: headersOf(post), journeys: db.t.acolhimento_journey.length, journey: db.t.acolhimento_journey[0], agentCalls: fetchLog.filter(f => f.url.includes('agent-acolhimento')).map(f => f.body), peopleWrites: db.writes.filter(w => w.table === 'people').length }
    // 3. subdomínio de igreja e origem desconhecida
    const sub = await h(new Request('http://x/d', { method: 'OPTIONS', headers: { origin: 'https://igreja-gerando-vencedores.ekthoschurch.com' } }))
    const bad = await h(new Request('http://x/d', { method: 'OPTIONS', headers: { origin: 'https://malicioso.example' } }))
    out.sub = headersOf(sub)['access-control-allow-origin']; out.bad = headersOf(bad)['access-control-allow-origin']
    // 4. QR continua igual: chamada interna sem Origin
    const db2 = makeDb(seed()); db2.t.people[0].source = 'qr_code'; const fl2 = []; const h2 = await load(file, db2, fl2)
    const qr = await h2(new Request('http://x/d', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer srv' }, body: JSON.stringify({ person_id: 'p-manual', event: 'person_created' }) }))
    await new Promise(r => setTimeout(r, 50))
    out.qr = { status: qr.status, journeys: db2.t.acolhimento_journey.length, agent: fl2.some(f => f.url.includes('agent-acolhimento')) }
    // 5. importação em lote: segue sem acolhimento
    const db3 = makeDb(seed()); db3.t.people[0].is_bulk_import = true; db3.t.people[0].source = 'import_xlsx'; const fl3 = []; const h3 = await load(file, db3, fl3)
    const imp = await h3(new Request('http://x/d', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ person_id: 'p-manual', event: 'person_created' }) }))
    out.imp = { status: imp.status, journeys: db3.t.acolhimento_journey.length }
  } finally { restore() }
  return out
}
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const N = await run(SRC)
ck('preflight OPTIONS de app.ekthoschurch.com → 204 sem corpo', N.preflight.status === 204 && N.preflight.body === '', `${N.preflight.status} "${N.preflight.body}"`)
ck('preflight devolve Access-Control-Allow-Origin = origem do app', N.preflight.h['access-control-allow-origin'] === APP, N.preflight.h['access-control-allow-origin'])
ck('preflight libera os cabeçalhos que o supabase-js envia (authorization, apikey, content-type, x-client-info)', /authorization/.test(N.preflight.h['access-control-allow-headers']) && /apikey/.test(N.preflight.h['access-control-allow-headers']) && /content-type/.test(N.preflight.h['access-control-allow-headers']) && /x-client-info/.test(N.preflight.h['access-control-allow-headers']) && /POST/.test(N.preflight.h['access-control-allow-methods']), N.preflight.h['access-control-allow-headers'])
ck('cadastro manual: POST do navegador → 200 com Access-Control-Allow-Origin', N.post.status === 200 && N.post.body.ok === true && N.post.h['access-control-allow-origin'] === APP)
ck('cadastro manual: acolhimento_journey criada para a pessoa', N.post.journeys === 1 && N.post.journey?.person_id === 'p-manual' && N.post.journey?.church_id === CH, JSON.stringify({ journeys: N.post.journeys, welcome: !!N.post.journey?.welcome_dispatched_at }))
ck('cadastro manual: agent-acolhimento invocado (D+0) com a jornada e a igreja', N.post.agentCalls.length === 1 && N.post.agentCalls[0].church_id === CH && !!N.post.agentCalls[0].journey_id, JSON.stringify(N.post.agentCalls[0]))
ck('nenhuma escrita na pessoa (payload e regra do agente intactos)', N.post.peopleWrites === 0)
ck('subdomínio de igreja permitido; origem desconhecida recebe a origem padrão (não a dela)', N.sub === 'https://igreja-gerando-vencedores.ekthoschurch.com' && N.bad === APP, `${N.sub} | ${N.bad}`)
ck('fluxo do QR inalterado (chamada interna sem Origin: jornada + agente)', N.qr.status === 200 && N.qr.journeys === 1 && N.qr.agent)
ck('importação em lote continua sem acolhimento', N.imp.status === 200 && N.imp.journeys === 0)
if (CONTROL) {
  const O = await run(CONTROL)
  console.log('\n— controle: versão de produção —')
  ck('CONTROLE: a versão de produção NÃO devolvia Access-Control-Allow-Origin no preflight', !O.preflight.h['access-control-allow-origin'], JSON.stringify(O.preflight.h))
  ck('CONTROLE: fora o CORS, o comportamento é idêntico (jornada, agente, QR, importação)', O.post.journeys === N.post.journeys && O.post.agentCalls.length === N.post.agentCalls.length && JSON.stringify(O.qr) === JSON.stringify(N.qr) && JSON.stringify(O.imp) === JSON.stringify(N.imp))
}
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
