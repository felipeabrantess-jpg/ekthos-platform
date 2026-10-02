// Uso (SOMENTE depois da migration 20261003100000 aplicada):
//   SUPABASE_PAT=... node supabase/tests/phone_unique_concurrency.mjs
// Duas conexões cadastram o MESMO telefone sintético (DDD 20, inexistente) ao mesmo tempo.
// A transação A insere e segura 3s; a B (outro formato) tem de ESPERAR a A (advisory lock)
// e, com A ainda não desfeita, ser bloqueada. As duas terminam em ROLLBACK: nada persiste.
const PROJECT = 'mlqjywqnchilvgkbvicd', PAT = process.env.SUPABASE_PAT
if (!PAT) { console.error('SUPABASE_PAT ausente'); process.exit(2) }
const CHURCH = '6c127559-874a-4748-8fce-55d4079613a5'
const run = async (sql) => {
  const t0 = Date.now()
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  })
  return { ms: Date.now() - t0, body: await r.text() }
}
const tx = (phone, hold) => `
DO $$
DECLARE r text;
BEGIN
  BEGIN
    INSERT INTO people (church_id, name, phone, source) VALUES ('${CHURCH}', 'ZZ-TESTE Concorrência', '${phone}', 'manual');
    r := 'CRIADO';
  EXCEPTION WHEN unique_violation THEN r := 'BLOQUEADO'; END;
  PERFORM pg_sleep(${hold});
  RAISE EXCEPTION 'RESULTADO=% (rollback)', r;
END $$;`
const a = run(tx('+5520911112222', 3))
await new Promise(r => setTimeout(r, 700))
const b = run(tx('(20) 91111-2222', 0))
const [ra, rb] = await Promise.all([a, b])
const res = (x) => (x.body.match(/RESULTADO=(\w+)/) || [])[1]
console.log(`A: ${res(ra)} em ${ra.ms} ms | B: ${res(rb)} em ${rb.ms} ms`)
// A é desfeita ao final; B só prossegue depois que A termina. Como A fez rollback, B então cria
// (e também é desfeita). O que prova a serialização é B ter esperado A (~2s+).
const ok = res(ra) === 'CRIADO' && rb.ms >= 1800
console.log(ok ? 'OK — a 2ª transação esperou a 1ª (lock por igreja+telefone); com COMMIT da 1ª, a 2ª é bloqueada (teste 4 da regressão SQL)' : 'FALHOU')
process.exit(ok ? 0 : 1)
