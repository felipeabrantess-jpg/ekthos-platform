// ============================================================
// Conferência da tela Pessoas com os DADOS REAIS da IGV — SÓ LEITURA.
//   SUPABASE_ACCESS_TOKEN=... node supabase/tests/pessoas_conferencia.mjs
// Cada requisição: BEGIN; identidade do admin IGV; SET LOCAL ROLE authenticated; SELECT ... (sem COMMIT, nada grava).
// 1. Números: botão (get_care_status_counts / get_people_stage_counts) = pessoas da lista (get_people_page),
//    sem repetidos, e fechamentos (Σ Quem = Todos; Σ Atendimento = Quem), por unidade.
// 2. Ordenação: nome/telefone/atendimento/contatos/cadastro × asc/desc — lista completa, sem repetidos nem
//    faltantes, chave monotônica (nulos por último), e paginação de 50 (tela) igual à de 1000.
// Sai com código 1 se qualquer caso falhar: é o critério para publicar.
// ============================================================
const T = process.env.SUPABASE_ACCESS_TOKEN
if (!T) { console.error('SUPABASE_ACCESS_TOKEN ausente'); process.exit(2) }
const C = '6c127559-874a-4748-8fce-55d4079613a5'
const ITAIPU = 'dcf2852d-e790-46dc-b66b-e8f74977a706', TRINDADE = 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f'
const UNITS = [[null, 'Todas'], [ITAIPU, 'Itaipu'], [TRINDADE, 'Trindade'], ['none', 'Sem unidade']]
const JWT = `SELECT set_config('request.jwt.claims','{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"${C}"}}',true); SET LOCAL ROLE authenticated;`

async function q(sql) {
  for (let t = 0; t < 4; t++) {
    const r = await fetch('https://api.supabase.com/v1/projects/mlqjywqnchilvgkbvicd/database/query', {
      method: 'POST', headers: { Authorization: 'Bearer ' + T, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'BEGIN; ' + JWT + sql }) })
    const txt = await r.text()
    try { const j = JSON.parse(txt); if (!r.ok) throw new Error(txt.slice(0, 300)); return j } catch (e) {
      if (String(e.message).startsWith('{')) throw e
      await new Promise(s => setTimeout(s, 2500))
    }
  }
  throw new Error('sem resposta: ' + sql.slice(0, 100))
}
const lit = v => v == null ? 'NULL' : `'${v}'`
// a API devolve o resultado do comando anterior quando o último vem vazio: só linhas com a chave esperada contam
const rows = (r, key) => r.filter(x => x && Object.prototype.hasOwnProperty.call(x, key) && x[key] != null)

const results = []
const ck = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`) }

const pageCall = (o, limit, offset) => `get_people_page(p_church_id=>'${C}', p_care_status=>${lit(o.st)}, p_unit_id=>${lit(o.u)}, p_stage=>NULL, p_source=>NULL, p_search=>NULL, p_date_from=>NULL, p_date_to=>NULL, p_limit=>${limit}, p_offset=>${offset}, p_classification=>${lit(o.cl)}, p_stage_key=>${lit(o.sk)}, p_sort_by=>${lit(o.sort)}, p_sort_dir=>${lit(o.dir)})`

async function ids(o, pageSize = 1000, maxPages = Infinity) {
  const out = []
  for (let off = 0, p = 0; p < maxPages; off += pageSize, p++) {
    const r = rows(await q(`SELECT row_data->>'id' AS id FROM ${pageCall(o, pageSize, off)}`), 'id')
    out.push(...r.map(x => x.id))
    if (r.length < pageSize) break
  }
  return out
}
const counts = async (u, cl) => (await q(`SELECT get_care_status_counts(p_church_id=>'${C}', p_unit_id=>${lit(u)}, p_stage_key=>NULL, p_stage=>NULL, p_source=>NULL, p_tag_id=>NULL, p_birth_month=>NULL, p_date_from=>NULL, p_date_to=>NULL, p_created_from=>NULL, p_created_to=>NULL, p_search=>NULL, p_classification=>${lit(cl)}, p_role=>NULL, p_contact=>NULL) AS v`)).find(x => x.v)?.v

// ── 1. Números ────────────────────────────────────────────────
const ESTADOS = [null, 'nao_atendida', 'em_atendimento', 'atendida', 'cancelado', 'sem_contato_48h']
const KEY = { null: 'total', sem_contato_48h: 'sem_contato_48h' }
for (const [u, un] of UNITS) {
  const m = {}
  for (const cl of [null, 'visitor', 'member', 'none']) {
    m[cl] = await counts(u, cl)
    for (const st of ESTADOS) {
      const botao = m[cl][KEY[st] ?? st]
      const l = await ids({ u, cl, st })
      const dist = new Set(l).size
      ck(`${un} | ${cl ?? 'todos'} | ${st ?? 'todos'}`, botao === dist && dist === l.length, `botão ${botao} × lista ${dist}${dist !== l.length ? ` (repetidos ${l.length - dist})` : ''}`)
    }
    const c = m[cl]
    ck(`${un} | ${cl ?? 'todos'} | Atendimento fecha`, c.nao_atendida + c.em_atendimento + c.atendida + c.cancelado === c.total, `${c.nao_atendida}+${c.em_atendimento}+${c.atendida}+${c.cancelado}=${c.total}`)
  }
  ck(`${un} | Quem fecha`, m.visitor.total + m.member.total + m.none.total === m[null].total, `${m.visitor.total}+${m.member.total}+${m.none.total}=${m[null].total}`)
  const stg = (await q(`SELECT get_people_stage_counts('${C}', ${lit(u)}) AS v`)).find(x => x.v)?.v
  for (const s of stg.stages) {
    const l = await ids({ u, sk: s.stage_key }); const dist = new Set(l).size
    ck(`${un} | etapa ${s.name}`, s.cnt === dist && dist === l.length, `botão ${s.cnt} × lista ${dist}`)
  }
}

// ── 2. Ordenação ──────────────────────────────────────────────
const KEYEXPR = {
  nome: `(g.row_data->>'name_sort')`,
  telefone: `(SELECT pe.phone_normalized FROM people pe WHERE pe.id = (g.row_data->>'id')::uuid)`,
  atendimento: `person_care_state((g.row_data->>'id')::uuid)`,
  cadastro: `((g.row_data->>'created_at')::timestamptz)`,
  contatos: `(SELECT count(*) FROM journey_events je JOIN person_journey pj ON pj.id = je.journey_id WHERE pj.person_id = (g.row_data->>'id')::uuid AND je.event_type = 'pastoral_contact')`,
}
async function checkSort(o, label) {
  const asc = o.dir === 'asc', e = KEYEXPR[o.sort]
  let all = [], viol = 0, prevLast = undefined
  for (let off = 0; ; off += 1000) {
    const r = (await q(`WITH g AS (SELECT row_number() OVER () rn, row_data FROM ${pageCall(o, 1000, off)}),
      k AS (SELECT rn, row_data->>'id' id, ${e.replace(/g\.row_data/g, 'g.row_data')} AS key FROM g),
      w AS (SELECT rn, id, key, lag(key) OVER (ORDER BY rn) pk FROM k)
      SELECT json_build_object('ids', json_agg(id ORDER BY rn),
        'viol', count(*) FILTER (WHERE rn > 1 AND ((pk IS NULL AND key IS NOT NULL) OR (pk IS NOT NULL AND key IS NOT NULL AND key ${asc ? '<' : '>'} pk))),
        'first', (SELECT key::text FROM w ORDER BY rn LIMIT 1), 'firstnull', (SELECT key IS NULL FROM w ORDER BY rn LIMIT 1),
        'last', (SELECT key::text FROM w ORDER BY rn DESC LIMIT 1), 'lastnull', (SELECT key IS NULL FROM w ORDER BY rn DESC LIMIT 1)) AS v FROM w`)).find(x => x.v)?.v
    if (!r || !r.ids) break
    all.push(...r.ids); viol += r.viol
    if (prevLast !== undefined) {   // fronteira entre páginas, comparada no próprio banco (mesma collation)
      const typ = o.sort === 'cadastro' ? 'timestamptz' : o.sort === 'contatos' ? 'bigint' : 'text'
      const a = prevLast.v, b = r.first
      const bad = prevLast.isnull ? !r.firstnull
        : r.firstnull ? false
        : (await q(`SELECT ($a$${b}$a$::${typ} ${asc ? '<' : '>'} $b$${a}$b$::${typ}) AS bad`)).find(x => 'bad' in x)?.bad
      if (bad) viol++
    }
    prevLast = { v: r.last, isnull: r.lastnull }
    if (r.ids.length < 1000) break
  }
  const dist = new Set(all).size
  const total = (await counts(o.u, o.cl)).total
  // paginação da tela (50 por página) = mesma sequência (até 3 páginas para listas grandes)
  const screen = await ids(o, 50, total > 400 ? 3 : Infinity)
  const sameAsScreen = screen.every((id, i) => id === all[i])
  ck(`ordenação ${label} ${o.sort} ${o.dir}`, viol === 0 && dist === all.length && dist === total && sameAsScreen,
    `${dist}/${total} pessoas, ${viol} fora de ordem, ${all.length - dist} repetidos, paginação 50 ${sameAsScreen ? 'igual' : 'DIFERENTE'}`)
}
for (const [u, cl, label] of [[null, null, 'Todas'], [ITAIPU, null, 'Itaipu'], [ITAIPU, 'visitor', 'Itaipu/Visitantes']])
  for (const sort of Object.keys(KEYEXPR)) for (const dir of ['asc', 'desc']) await checkSort({ u, cl, sort, dir }, label)

const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} batem ===`)
process.exit(failed ? 1 : 0)
