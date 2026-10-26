// Uso: SUPABASE_ACCESS_TOKEN=... node supabase/tests/run-regression.mjs <teste.sql> [migration.sql]
// Envia o teste (com a migration injetada em --@@MIGRATION@@) numa única transação. O teste termina com
// exceção proposital: nada persiste. Imprime as linhas do resultado. Não imprime o token.
import { readFileSync } from 'node:fs'
const [test, mig] = process.argv.slice(2)
let sql = readFileSync(test, 'utf8')
if (mig) sql = sql.replace('--@@MIGRATION@@', readFileSync(mig, 'utf8'))
const r = await fetch('https://api.supabase.com/v1/projects/mlqjywqnchilvgkbvicd/database/query', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + process.env.SUPABASE_ACCESS_TOKEN, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
})
const text = await r.text()
let msg = text
try { msg = JSON.parse(text).message ?? text } catch { /* resposta não-JSON */ }
const i = msg.indexOf('RESULTADO:')
if (i < 0) { console.log('SEM RESULTADO — resposta:', msg.slice(0, 2000)); process.exit(2) }
const start = msg.indexOf('[', i)
let end = msg.indexOf('\nCONTEXT:', start); if (end < 0) end = msg.length
const rows = JSON.parse(msg.slice(start, end).trim())
let fail = 0
for (const x of rows) { if (!x.ok) fail++; console.log(`${x.ok ? '✅' : '❌'} ${x.n}. ${x.teste}${x.info ? ' — ' + x.info : ''}`) }
console.log(`\n=== ${rows.length - fail}/${rows.length} OK ===`)
process.exit(fail ? 1 : 0)
