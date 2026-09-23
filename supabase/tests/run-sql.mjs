// Uso: SUPABASE_PAT=... node supabase/tests/run-sql.mjs <arquivo.sql> [...]
// Executa arquivos SQL no projeto via Management API (sem MCP). Somente para
// migrations/testes já revisados. Não imprime o PAT.
import { readFileSync } from 'node:fs'

const PROJECT = 'mlqjywqnchilvgkbvicd'
const PAT = process.env.SUPABASE_PAT
if (!PAT) { console.error('SUPABASE_PAT ausente'); process.exit(2) }

for (const file of process.argv.slice(2)) {
  const sql = readFileSync(file, 'utf8')
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  console.log(res.ok ? `OK  ${file}` : `ERRO ${file}\n${body}`)
  if (!res.ok) process.exit(1)
}
