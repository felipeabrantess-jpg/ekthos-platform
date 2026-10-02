// Teste REAL de concorrência da regra "1 pessoa = 1 telefone por igreja".
// Uso (depois da migration 20261003100000 aplicada):
//   SUPABASE_PAT=... node supabase/tests/phone_unique_concurrency.mjs
//
// Usa SOMENTE as igrejas de teste internas (nenhuma igreja cliente) e telefones sintéticos
// (DDD 20, inexistente). Cada requisição HTTP é uma conexão/transação própria que faz COMMIT.
// Ao final apaga exatamente os registros "ZZ-CONC" que criou e confere que não sobrou nada.
const PROJECT = 'mlqjywqnchilvgkbvicd', PAT = process.env.SUPABASE_PAT
if (!PAT) { console.error('SUPABASE_PAT ausente'); process.exit(2) }
const T1 = 'b8653e1e-1765-487a-a146-b2c9c0105315'   // Igreja Teste Frente 3B (Playwright)
const T2 = '62e473b8-cd39-4da2-aa5d-c296b03d6873'   // Igreja de Teste — Mock
const run = async (sql) => {
  const t0 = Date.now()
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  })
  const body = await r.text()
  return { ms: Date.now() - t0, ok: r.ok, body, blocked: /PHONE_ALREADY_LINKED|people_church_phone/.test(body), deadlock: /40P01|deadlock/i.test(body) }
}
const q = async (sql) => JSON.parse((await run(sql)).body)
// INSERT que segura a transação aberta por `hold` segundos antes do COMMIT
const ins = (church, name, phone, hold = 0) =>
  `BEGIN; INSERT INTO people (church_id, name, phone, source) VALUES ('${church}', '${name}', '${phone}', 'manual'); SELECT pg_sleep(${hold}); COMMIT;`
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const rows = (like) => q(`SELECT church_id, name, phone, phone_normalized FROM people WHERE name LIKE 'ZZ-CONC%' AND phone_normalized LIKE '${like}' ORDER BY created_at`)

const pre = await q(`SELECT count(*)::int n FROM people WHERE name LIKE 'ZZ-CONC%'`)
if (pre[0].n !== 0) { console.error('Resíduo de execução anterior — abortando'); process.exit(2) }

try {
  // ── 1. A segura a transação 3s; B (outro nome, outro formato) chega no meio ──
  const a = run(ins(T1, 'ZZ-CONC Pessoa A', '+5520911110001', 3))
  await new Promise(r => setTimeout(r, 800))
  const b = run(ins(T1, 'ZZ-CONC Pessoa B', '(20) 91111-0001'))
  const [ra, rb] = await Promise.all([a, b])
  const r1 = await rows('20911110001')
  ck('1. A (em transação aberta) vence; B, simultânea, é BLOQUEADA', ra.ok && !rb.ok && rb.blocked, `A ${ra.ms} ms ok=${ra.ok} | B ${rb.ms} ms bloqueada=${rb.blocked}`)
  ck('1. B esperou A terminar (lock por igreja+telefone), sem deadlock', rb.ms >= 1500 && !ra.deadlock && !rb.deadlock, `B esperou ${rb.ms} ms`)
  ck('1. existe UM único cadastro, e é o da vencedora, inalterado', r1.length === 1 && r1[0].name === 'ZZ-CONC Pessoa A' && r1[0].phone === '+5520911110001', JSON.stringify(r1.map(x => [x.name, x.phone])))

  // ── 2. Disparo no mesmo instante, 5 rodadas, formatos diferentes ──
  let wins = 0, blocks = 0, dead = 0, extra = 0
  for (let i = 0; i < 5; i++) {
    const n = `2092222${String(i).padStart(4, '0')}`
    const [x, y] = await Promise.all([
      run(ins(T1, `ZZ-CONC R${i} X`, `+55${n}`, 0.3)),
      run(ins(T1, `ZZ-CONC R${i} Y`, `55 ${n.slice(0, 2)} ${n.slice(2)}`, 0.3)),
    ])
    wins += (x.ok ? 1 : 0) + (y.ok ? 1 : 0); blocks += (x.blocked ? 1 : 0) + (y.blocked ? 1 : 0); dead += (x.deadlock || y.deadlock) ? 1 : 0
    const r = await rows(n); if (r.length !== 1) extra++
  }
  ck('2. 5 rodadas simultâneas: em cada uma exatamente 1 vence e 1 é bloqueada', wins === 5 && blocks === 5, `venceram ${wins}, bloqueadas ${blocks}`)
  ck('2. nenhum segundo cadastro, nenhum deadlock, nenhum dado parcial', extra === 0 && dead === 0)

  // ── 3. Três tentativas simultâneas do mesmo telefone ──
  const tri = await Promise.all(['+5520933330001', '5520933330001', '20 93333-0001'].map((p, i) => run(ins(T1, `ZZ-CONC T${i}`, p, 0.3))))
  const r3 = await rows('20933330001')
  ck('3. três simultâneas: 1 vence, 2 bloqueadas, 1 cadastro', tri.filter(x => x.ok).length === 1 && tri.filter(x => x.blocked).length === 2 && r3.length === 1, `ok=${tri.filter(x => x.ok).length} bloqueadas=${tri.filter(x => x.blocked).length}`)

  // ── 4. Duas IGREJAS diferentes, mesmo telefone, ao mesmo tempo → as duas gravam ──
  const [c1, c2] = await Promise.all([run(ins(T1, 'ZZ-CONC Igreja 1', '+5520944440001', 1)), run(ins(T2, 'ZZ-CONC Igreja 2', '(20) 94444-0001', 1))])
  const r4 = await rows('20944440001')
  ck('4. igrejas diferentes com o mesmo telefone: as DUAS gravam, sem esperar uma pela outra', c1.ok && c2.ok && r4.length === 2 && new Set(r4.map(x => x.church_id)).size === 2 && Math.max(c1.ms, c2.ms) < 2600, `${c1.ms} ms / ${c2.ms} ms`)

  // ── 5. Edição simultânea: duas pessoas tentam assumir o mesmo telefone novo ──
  await run(ins(T1, 'ZZ-CONC Edita 1', '+5520955550001')); await run(ins(T1, 'ZZ-CONC Edita 2', '+5520955550002'))
  const upd = (name, phone) => `BEGIN; UPDATE people SET phone = '${phone}' WHERE name = '${name}' AND church_id = '${T1}'; SELECT pg_sleep(0.5); COMMIT;`
  const [u1, u2] = await Promise.all([run(upd('ZZ-CONC Edita 1', '+5520955559999')), run(upd('ZZ-CONC Edita 2', '(20) 95555-9999'))])
  const r5 = await rows('20955559999')
  ck('5. edição simultânea para o mesmo telefone: só uma vence; a outra pessoa fica como estava', [u1, u2].filter(x => x.ok).length === 1 && [u1, u2].filter(x => x.blocked).length === 1 && r5.length === 1 && !u1.deadlock && !u2.deadlock, `ok=${[u1, u2].filter(x => x.ok).length}`)
} finally {
  // limpeza: somente os registros sintéticos criados por este teste, nas igrejas de teste
  await run(`DELETE FROM audit_logs WHERE entity_type = 'person' AND entity_id IN (SELECT id FROM people WHERE name LIKE 'ZZ-CONC%' AND church_id IN ('${T1}', '${T2}'))`)
  await run(`DELETE FROM people WHERE name LIKE 'ZZ-CONC%' AND church_id IN ('${T1}', '${T2}')`)
  const post = await q(`SELECT count(*)::int n FROM people WHERE name LIKE 'ZZ-CONC%'`)
  ck('limpeza: nenhum registro de teste ficou no banco', post[0].n === 0)
}
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
