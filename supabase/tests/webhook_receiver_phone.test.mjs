/**
 * webhook_receiver_phone.test.mjs — executa o CÓDIGO REAL da Edge Function webhook-receiver
 * (supabase/functions/webhook-receiver/index.ts) contra um Supabase em memória.
 * Zero rede, zero banco. Roda com:  node supabase/tests/webhook_receiver_phone.test.mjs
 *   --control <arquivo>  também roda a versão anterior (produção) para comparar o comportamento.
 *
 * O "banco" em memória reproduz o que a migration 20261003100000 garante:
 *   - people.phone_normalized (mesma regra de normalize_phone_br);
 *   - trigger people_enforce_unique_phone + índice people_church_phone_unique (erro 23505).
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'functions', 'webhook-receiver', 'index.ts')
const ctlIdx = process.argv.indexOf('--control')
const CONTROL = ctlIdx > 0 ? process.argv[ctlIdx + 1] : null

const C1 = 'church-1', C2 = 'church-2'
const norm = (raw) => { const d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, ''); if (!d) return null; return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d }

// ── Supabase em memória ───────────────────────────────────────
function makeDb() {
  const t = {
    people: [], conversations: [], conversation_messages: [],
    church_whatsapp_channels: [
      { id: 'ch-1', church_id: C1, channel_type: 'chatpro', active: true, meta_phone_number_id: 'meta-1' },
      { id: 'ch-2', church_id: C2, channel_type: 'chatpro', active: true, meta_phone_number_id: 'meta-2' },
    ],
  }
  const writes = []; let seq = 0
  const withGen = (table, r) => table === 'people' ? { ...r, phone_normalized: norm(r.phone) } : r
  function builder(table) {
    const st = { op: 'select', filters: [], orders: [], limit: null, head: false, count: false, payload: null, returning: false }
    const rows = () => t[table].map(r => withGen(table, r)).filter(r => st.filters.every(f => f(r)))
    const run = () => {
      if (st.op === 'insert') {
        const r = { id: `${table}-${++seq}`, created_at: new Date(Date.now() + seq).toISOString(), deleted_at: null, ...st.payload }
        if (table === 'people') {
          const k = norm(r.phone)
          const taken = k && t.people.some(p => p.church_id === r.church_id && !p.deleted_at && norm(p.phone) === k)
          if (taken) return { data: null, error: { code: '23505', message: 'PHONE_ALREADY_LINKED: Este telefone já está vinculado a uma pessoa cadastrada.' } }
        }
        t[table].push(r); writes.push({ table, op: 'insert', row: { ...st.payload } })
        return { data: [withGen(table, r)], error: null }
      }
      if (st.op === 'update') {
        const hit = t[table].filter(r => st.filters.every(f => f(withGen(table, r))))
        hit.forEach(r => Object.assign(r, st.payload)); writes.push({ table, op: 'update', ids: hit.map(r => r.id), set: { ...st.payload } })
        return { data: hit.map(r => withGen(table, r)), error: null }
      }
      let out = rows()
      for (const [col, asc] of [...st.orders].reverse()) out = [...out].sort((a, b) => (a[col] ?? '') < (b[col] ?? '') ? (asc ? -1 : 1) : (a[col] ?? '') > (b[col] ?? '') ? (asc ? 1 : -1) : 0)
      if (st.limit != null) out = out.slice(0, st.limit)
      return { data: out, error: null, count: out.length }
    }
    const api = {
      select(_cols, opts) { if (st.op === 'select') { st.head = !!opts?.head; st.count = !!opts?.count } else st.returning = true; return api },
      insert(p) { st.op = 'insert'; st.payload = p; return api },
      update(p) { st.op = 'update'; st.payload = p; return api },
      eq(c, v) { st.filters.push(r => r[c] === v); return api },
      is(c, v) { st.filters.push(r => (r[c] ?? null) === v); return api },
      order(c, o) { st.orders.push([c, o?.ascending !== false]); return api },
      limit(n) { st.limit = n; return api },
      async maybeSingle() { const r = run(); if (r.error) return r; if (r.data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }; return { data: r.data[0] ?? null, error: null } },
      async single() { const r = run(); if (r.error) return r; if (r.data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'not single' } }; return { data: r.data[0], error: null } },
      then(res, rej) { const r = run(); return Promise.resolve(st.head ? { data: null, error: r.error, count: r.count } : r).then(res, rej) },
    }
    return api
  }
  return { t, writes, client: { from: builder } }
}

// ── carrega a função real, trocando só o import do supabase-js ─
async function loadHandler(file, db, fetchLog) {
  let src = readFileSync(file, 'utf8')
  const imp = /import \{ createClient \} from 'https:\/\/esm\.sh\/@supabase\/supabase-js@2'\r?\n/
  if (!imp.test(src)) throw new Error('import do supabase-js não encontrado em ' + file)
  src = src.replace(imp, 'const createClient = (globalThis as any).__createClient\n')
  const dir = mkdtempSync(join(tmpdir(), 'wr-')); const out = join(dir, 'index.ts'); writeFileSync(out, src)
  let handler = null
  globalThis.__createClient = () => db.client
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'srv', META_WEBHOOK_VERIFY_TOKEN: 'verify-me' })[k] }, serve: (h) => { handler = h } }
  globalThis.fetch = async (url, init) => { fetchLog.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null }); return new Response('{}', { status: 200 }) }
  await import(pathToFileURL(out).href + '?v=' + Math.random())
  return handler
}

const quiet = () => { const o = { log: console.log, warn: console.warn, error: console.error }; console.log = console.warn = console.error = () => {}; return () => Object.assign(console, o) }
const settle = () => new Promise(r => setTimeout(r, 60))

async function scenario(file) {
  const out = {}
  const fresh = async () => { const db = makeDb(); const fetchLog = []; const handler = await loadHandler(file, db, fetchLog); return { db, fetchLog, handler } }
  const post = async (h, body, qs = '?channel_id=ch-1') => { const res = await h(new Request('http://x/webhook-receiver' + qs, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) })); await settle(); return res }
  const restore = quiet()
  try {
    // A. pessoa existente "+55 (21) 99999-9999"; webhook recebe 5521999999999
    { const { db, fetchLog, handler } = await fresh()
      db.t.people.push({ id: 'marcelo', church_id: C1, name: 'Marcelo Souza', first_name: null, last_name: null, phone: '+55 (21) 99999-9999', observacoes_pastorais: 'Anotação original', created_at: '2026-01-01', deleted_at: null })
      const before = JSON.stringify(db.t.people[0])
      const res = await post(handler, { phone: '5521999999999', body: 'Olá', id: 'm-A' })
      out.A = { status: res.status, people: db.t.people.length, contato: db.t.people.some(p => p.first_name === 'Contato'), marceloIntacto: JSON.stringify(db.t.people[0]) === before,
        convPerson: db.t.conversations[0]?.person_id, msgs: db.t.conversation_messages.length, triagemPerson: fetchLog.find(f => f.url.includes('agent-haiku-triagem'))?.body?.person_id,
        peopleWrites: db.writes.filter(w => w.table === 'people').length } }
    // A2. mesma pessoa gravada em outros formatos
    out.A2 = {}
    for (const stored of ['21999999999', '(21) 99999-9999', '5521999999999', '+5521999999999']) {
      const { db, handler } = await fresh()
      db.t.people.push({ id: 'marcelo', church_id: C1, name: 'Marcelo Souza', phone: stored, created_at: '2026-01-01', deleted_at: null })
      await post(handler, ['Msg', { cmd: 'chat', from: '5521999999999@s.whatsapp.net', body: 'Oi', id: 'm-A2' }])
      out.A2[stored] = db.t.people.length === 1 && db.t.conversations[0]?.person_id === 'marcelo'
    }
    // B. número novo → continua criando "Contato NNNN"
    { const { db, fetchLog, handler } = await fresh()
      await post(handler, { phone: '5521988887777', body: 'Oi', id: 'm-B' })
      const p = db.t.people[0]
      out.B = { people: db.t.people.length, first: p?.first_name, last: p?.last_name, phone: p?.phone, obs: p?.observacoes_pastorais, convPerson: db.t.conversations[0]?.person_id === p?.id,
        dispatch: fetchLog.some(f => f.url.includes('dispatch-person-event') && f.body?.person_id === p?.id), triagem: fetchLog.some(f => f.url.includes('agent-haiku-triagem')), msgs: db.t.conversation_messages.length } }
    // C. outro tenant com o mesmo telefone → isolamento
    { const { db, handler } = await fresh()
      db.t.people.push({ id: 'outra-igreja', church_id: C2, name: 'Pessoa da Igreja 2', phone: '+5521999999999', created_at: '2026-01-01', deleted_at: null })
      const before = JSON.stringify(db.t.people[0])
      await post(handler, { phone: '5521999999999', body: 'Oi', id: 'm-C' })
      const novo = db.t.people.find(p => p.church_id === C1)
      out.C = { naoUsouPessoaDeOutraIgreja: db.t.conversations[0]?.person_id !== 'outra-igreja', criouNaIgrejaCerta: novo?.first_name === 'Contato' && db.t.conversations[0]?.person_id === novo?.id,
        igreja2Intacta: JSON.stringify(db.t.people[0]) === before, convChurch: db.t.conversations[0]?.church_id } }
    // D. payloads inválidos / fluxo de webhook
    { const { db, fetchLog, handler } = await fresh()
      const r1 = await post(handler, 'isto-nao-e-json')
      const r2 = await post(handler, { qualquer: 'coisa' })
      const r3 = await post(handler, { phone: '5521999999999', body: 'Oi', id: 'm-D' }, '')           // sem channel_id
      const r4 = await post(handler, { phone: '5521999999999', body: 'Oi', id: '' })                    // sem id de mensagem
      const r5 = await handler(new Request('http://x/webhook-receiver?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'))
      out.D = { status: [r1.status, r2.status, r3.status, r4.status], semEscritas: db.writes.length === 0 && fetchLog.length === 0, challenge: await r5.text() } }
    // E. duplicada (mesmo provider_message_id) → ignorada; segunda mensagem reaproveita conversa e pessoa
    { const { db, handler } = await fresh()
      db.t.people.push({ id: 'marcelo', church_id: C1, name: 'Marcelo Souza', phone: '+5521999999999', created_at: '2026-01-01', deleted_at: null })
      await post(handler, { phone: '5521999999999', body: 'Um', id: 'm-E1' })
      await post(handler, { phone: '5521999999999', body: 'Um', id: 'm-E1' })
      await post(handler, { phone: '5521999999999', body: 'Dois', id: 'm-E2' })
      out.E = { people: db.t.people.length, convs: db.t.conversations.length, msgs: db.t.conversation_messages.length, unread: db.t.conversations[0]?.unread_count, convPerson: db.t.conversations[0]?.person_id } }
    // F. Meta Cloud (lote) com pessoa existente em outro formato
    { const { db, handler } = await fresh()
      db.t.people.push({ id: 'marcelo', church_id: C1, name: 'Marcelo Souza', phone: '(21) 99999-9999', created_at: '2026-01-01', deleted_at: null })
      await post(handler, { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: 'meta-1' }, messages: [
        { id: 'wamid-1', from: '5521999999999', timestamp: '1760000000', type: 'text', text: { body: 'Oi' } },
        { id: 'wamid-2', from: '5521977776666', timestamp: '1760000001', type: 'text', text: { body: 'Olá' } }] } }] }] }, '')
      out.F = { people: db.t.people.length, convs: db.t.conversations.map(c => c.person_id), msgs: db.t.conversation_messages.length } }
    // G. par legado (pessoa real "+55…" + "Contato" "55…"): continua usando o vínculo que já existia
    { const { db, handler } = await fresh()
      db.t.people.push({ id: 'real', church_id: C1, name: 'Pessoa Real', phone: '+5521999999999', created_at: '2026-01-01', deleted_at: null })
      db.t.people.push({ id: 'contato', church_id: C1, name: null, first_name: 'Contato', last_name: '9999', phone: '5521999999999', created_at: '2026-06-01', deleted_at: null })
      await post(handler, { phone: '5521999999999', body: 'Oi', id: 'm-G' })
      out.G = { people: db.t.people.length, convPerson: db.t.conversations[0]?.person_id } }
    // H. ownership=human → mensagem gravada, triagem suprimida
    { const { db, fetchLog, handler } = await fresh()
      db.t.people.push({ id: 'marcelo', church_id: C1, name: 'Marcelo Souza', phone: '+5521999999999', created_at: '2026-01-01', deleted_at: null })
      db.t.conversations.push({ id: 'conv-h', church_id: C1, channel_id: 'ch-1', contact_phone: '5521999999999', person_id: null, ownership: 'human', agent_slug: null, unread_count: 2 })
      await post(handler, { phone: '5521999999999', body: 'Oi pastor', id: 'm-H' })
      out.H = { msgs: db.t.conversation_messages.length, ownership: db.t.conversations[0].ownership, person: db.t.conversations[0].person_id, unread: db.t.conversations[0].unread_count, triagem: fetchLog.some(f => f.url.includes('triagem')) } }
  } finally { restore() }
  return out
}

const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const N = await scenario(SRC)

ck('pessoa existente "+55 (21) 99999-9999" × webhook 5521999999999 → localiza a pessoa, NÃO cria "Contato NNNN"', N.A.people === 1 && !N.A.contato, JSON.stringify({ pessoas: N.A.people }))
ck('pessoa existente: nome, telefone e observações intactos (nenhuma escrita em people)', N.A.marceloIntacto && N.A.peopleWrites === 0)
ck('pessoa existente: conversa, mensagem e triagem ligadas à pessoa correta', N.A.convPerson === 'marcelo' && N.A.msgs === 1 && N.A.triagemPerson === 'marcelo' && N.A.status === 200, JSON.stringify({ conv: N.A.convPerson, triagem: N.A.triagemPerson }))
ck('pessoa gravada como DDD / máscara / 55 / +55 → sempre localizada', Object.values(N.A2).every(Boolean), JSON.stringify(N.A2))
ck('número novo → continua criando "Contato NNNN" como hoje (conversa + jornada de acolhimento + triagem)', N.B.people === 1 && N.B.first === 'Contato' && N.B.last === '7777' && N.B.phone === '5521988887777' && N.B.obs === 'Cadastrado automaticamente via WhatsApp inbound' && N.B.convPerson && N.B.dispatch && N.B.triagem && N.B.msgs === 1, JSON.stringify(N.B))
ck('outro tenant com o mesmo telefone → isolamento preservado', N.C.naoUsouPessoaDeOutraIgreja && N.C.criouNaIgrejaCerta && N.C.igreja2Intacta && N.C.convChurch === C1, JSON.stringify(N.C))
ck('payload inválido / não reconhecido / sem canal / sem id → 200 e nenhuma escrita (como antes)', N.D.status.every(s => s === 200) && N.D.semEscritas, JSON.stringify(N.D.status))
ck('verificação GET hub.challenge da Meta continua respondendo', N.D.challenge === '12345')
ck('mensagem duplicada ignorada; 2ª mensagem reaproveita conversa e pessoa', N.E.people === 1 && N.E.convs === 1 && N.E.msgs === 2 && N.E.unread === 2 && N.E.convPerson === 'marcelo', JSON.stringify(N.E))
ck('Meta Cloud em lote: existente (outro formato) localizada; número novo vira Contato', N.F.people === 2 && N.F.convs[0] === 'marcelo' && N.F.msgs === 2, JSON.stringify(N.F))
ck('par legado (real "+55" + Contato "55"): mantém o vínculo que já existia; nada novo é criado', N.G.people === 2 && N.G.convPerson === 'contato', JSON.stringify(N.G))
ck('ownership=human: mensagem gravada, ownership preservado, triagem suprimida', N.H.msgs === 1 && N.H.ownership === 'human' && N.H.unread === 3 && !N.H.triagem && N.H.person === 'marcelo', JSON.stringify(N.H))

if (CONTROL) {
  const O = await scenario(CONTROL)
  console.log('\n— comparação com a versão anterior (produção) —')
  ck('CONTROLE: a versão anterior NÃO achava a pessoa em outro formato (tentava criar "Contato")', O.A.convPerson !== 'marcelo', JSON.stringify({ conv: O.A.convPerson ?? null }))
  for (const k of ['B', 'C', 'D', 'G']) ck(`comportamento idêntico ao anterior no cenário ${k}`, JSON.stringify(O[k]) === JSON.stringify(N[k]))
  ck('comportamento idêntico ao anterior quando o telefone gravado é exatamente o do webhook', O.A2['5521999999999'] === true && N.A2['5521999999999'] === true)
}

const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
