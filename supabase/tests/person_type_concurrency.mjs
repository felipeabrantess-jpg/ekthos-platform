// Teste REAL de concorrência da regra "no máximo um tipo por pessoa".
// Uso (depois da migration 20261004100000 aplicada):
//   SUPABASE_PAT=... node supabase/tests/person_type_concurrency.mjs
//
// Usa SOMENTE a igreja de teste interna (nenhuma igreja cliente), com pessoa e etiquetas
// sintéticas (ZZ-CONC). Cada requisição HTTP é uma conexão/transação própria que faz COMMIT.
// Ao final apaga exatamente o que criou e confere que não sobrou nada.
const PROJECT = 'mlqjywqnchilvgkbvicd', PAT = process.env.SUPABASE_PAT
if (!PAT) { console.error('SUPABASE_PAT ausente'); process.exit(2) }
const T1 = 'b8653e1e-1765-487a-a146-b2c9c0105315'   // Igreja Teste Frente 3B (Playwright)
const run = async (sql) => {
  const t0 = Date.now()
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }) })
  const body = await r.text()
  return { ms: Date.now() - t0, ok: r.ok, body, blocked: /PERSON_TYPE_SINGLE|person_tags_single_person_type/.test(body), deadlock: /40P01|deadlock/i.test(body) }
}
const q = async (sql) => { const r = await run(sql); if (!r.ok) throw new Error(r.body.slice(0, 300)); return JSON.parse(r.body) }
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const wait = (ms) => new Promise(r => setTimeout(r, ms))
// usuário logado (id real em auth.users, exigido pelo registro de autor) atuando na igreja de teste —
// mesmo caminho da tela: role authenticated + RLS
const asUser = (inner, hold = 0) => `BEGIN;
SELECT set_config('request.jwt.claims', '{"sub":"5b2f7fca-2f4e-40fe-9507-dcb2cf8a3349","role":"authenticated","app_metadata":{"church_id":"${T1}"}}', true);
SET LOCAL ROLE authenticated;
${inner}
SELECT pg_sleep(${hold});
COMMIT;`

if ((await q(`SELECT count(*)::int n FROM people WHERE name LIKE 'ZZ-CONC%'`))[0].n || (await q(`SELECT count(*)::int n FROM tags WHERE name LIKE 'ZZ-CONC%'`))[0].n) { console.error('Resíduo de execução anterior — abortando'); process.exit(2) }

let P, P2, tag = {}
try {
  const tags = await q(`INSERT INTO tags (church_id, name, color, sort_order, category) VALUES
    ('${T1}', 'ZZ-CONC Membro', '#111111', 1, 'person_type'), ('${T1}', 'ZZ-CONC Visitante', '#222222', 2, 'person_type'), ('${T1}', 'ZZ-CONC Novo', '#333333', 3, 'person_type'),
    ('${T1}', 'ZZ-CONC Geral A', '#444444', 4, 'general'), ('${T1}', 'ZZ-CONC Geral B', '#555555', 5, 'general') RETURNING id, name`)
  for (const t of tags) tag[t.name.replace('ZZ-CONC ', '')] = t.id
  P = (await q(`INSERT INTO people (church_id, name, source) VALUES ('${T1}', 'ZZ-CONC Pessoa 1', 'manual') RETURNING id`))[0].id
  P2 = (await q(`INSERT INTO people (church_id, name, source) VALUES ('${T1}', 'ZZ-CONC Pessoa 2', 'manual') RETURNING id`))[0].id
  await q(`INSERT INTO person_tags (person_id, tag_id, church_id) VALUES ('${P}', '${tag.Membro}', '${T1}')`)
  const types = async (p) => (await q(`SELECT t.name FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = '${p}' AND t.category = 'person_type' ORDER BY t.name`)).map(r => r.name.replace('ZZ-CONC ', ''))
  const setTags = (p, ids, hold = 0) => run(asUser(`SELECT set_person_tags('${p}', ARRAY[${ids.map(i => `'${i}'`).join(',')}]::uuid[]);`, hold))

  // ── A. duas trocas simultâneas de tipo na MESMA pessoa ──
  const a = setTags(P, [tag.Visitante], 3)                 // segura a transação aberta por 3s
  await wait(900)
  const b = setTags(P, [tag.Novo])                         // chega no meio
  await wait(700)
  const meio = await types(P)                              // 3ª conexão olhando durante a troca
  const [ra, rb] = await Promise.all([a, b])
  const fim = await types(P)
  ck('A. duas trocas simultâneas: as duas concluem, uma depois da outra, sem deadlock', ra.ok && rb.ok && !ra.deadlock && !rb.deadlock && rb.ms >= 1500, `1ª ${ra.ms} ms | 2ª esperou ${rb.ms} ms`)
  ck('A. durante a troca, quem lê vê exatamente 1 tipo (nunca 0 nem 2)', meio.length === 1, `visto no meio: ${JSON.stringify(meio)}`)
  ck('A. ao final existe apenas UM tipo (o da última troca)', fim.length === 1 && fim[0] === 'Novo', JSON.stringify(fim))
  let bad = 0, dead = 0
  for (let i = 0; i < 5; i++) {
    const [x, y] = await Promise.all([setTags(P, [tag.Membro], 0.3), setTags(P, [tag.Visitante], 0.3)])
    if (x.deadlock || y.deadlock || !x.ok || !y.ok) dead++
    if ((await types(P)).length !== 1) bad++
  }
  ck('A. 5 rodadas disparadas no mesmo instante: sempre 1 tipo ao final, sem erro nem deadlock', bad === 0 && dead === 0, `estados inválidos=${bad} erros/deadlocks=${dead}`)

  // ── B. tentativa simultânea de inserir DOIS person_type direto na tabela ──
  const ins = (p, t, hold = 0) => run(asUser(`INSERT INTO person_tags (person_id, tag_id, church_id) VALUES ('${p}', '${t}', '${T1}');`, hold))
  const i1 = ins(P2, tag.Membro, 2.5); await wait(700); const i2 = ins(P2, tag.Visitante)
  const [r1, r2] = await Promise.all([i1, i2]); let t2 = await types(P2)
  ck('B. dois tipos inseridos ao mesmo tempo: 1 vence, o outro é bloqueado depois de esperar', r1.ok && !r2.ok && r2.blocked && r2.ms >= 1200 && !r2.deadlock, `1º ok=${r1.ok} | 2º bloqueado=${r2.blocked} após ${r2.ms} ms`)
  ck('B. a pessoa termina com UM tipo', t2.length === 1 && t2[0] === 'Membro', JSON.stringify(t2))
  await q(`DELETE FROM person_tags WHERE person_id = '${P2}'`)
  const tri = await Promise.all([ins(P2, tag.Membro, 0.4), ins(P2, tag.Visitante, 0.4), ins(P2, tag.Novo, 0.4)]); t2 = await types(P2)
  ck('B. três tipos no mesmo instante: 1 vence, 2 bloqueados, 1 tipo ao final, sem deadlock', tri.filter(x => x.ok).length === 1 && tri.filter(x => x.blocked).length === 2 && !tri.some(x => x.deadlock) && t2.length === 1, `ok=${tri.filter(x => x.ok).length} bloqueados=${tri.filter(x => x.blocked).length}`)

  // ── C. duas etiquetas "general" ao mesmo tempo ──
  const [g1, g2] = await Promise.all([ins(P2, tag['Geral A'], 0.5), ins(P2, tag['Geral B'], 0.5)])
  const all = await q(`SELECT t.name, t.category FROM person_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.person_id = '${P2}'`)
  ck('C. duas etiquetas general simultâneas: as duas gravam e convivem com o tipo', g1.ok && g2.ok && all.filter(x => x.category === 'general').length === 2 && all.filter(x => x.category === 'person_type').length === 1, `${all.length} etiquetas`)
} finally {
  await run(`DELETE FROM person_tags WHERE church_id = '${T1}' AND person_id IN (SELECT id FROM people WHERE name LIKE 'ZZ-CONC%')`)
  await run(`DELETE FROM people WHERE name LIKE 'ZZ-CONC%' AND church_id = '${T1}'`)
  await run(`DELETE FROM tags WHERE name LIKE 'ZZ-CONC%' AND church_id = '${T1}'`)
  const post = await q(`SELECT (SELECT count(*) FROM people WHERE name LIKE 'ZZ-CONC%')::int p, (SELECT count(*) FROM tags WHERE name LIKE 'ZZ-CONC%')::int t`)
  ck('limpeza: nenhum registro de teste ficou no banco', post[0].p === 0 && post[0].t === 0)
}
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
