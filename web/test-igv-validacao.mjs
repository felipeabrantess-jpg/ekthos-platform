// Teste de igv-validacao (node puro): compila o .ts com esbuild e testa os casos.
import { buildSync } from 'esbuild'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const out = buildSync({ entryPoints: [join(here, 'src/lib/igv-validacao.ts')], bundle: true, format: 'esm', write: false, platform: 'neutral' })
const file = join(mkdtempSync(join(tmpdir(), 'igv-val-')), 'igv-validacao.mjs')
writeFileSync(file, out.outputFiles[0].text)
const { nomeCompleto, telefoneBR } = await import(pathToFileURL(file).href)

const casos = [
  ['tel', '211111111111111', false],
  ['tel', '21111111111', false],
  ['tel', '(21) 97464-6794', true],
  ['tel', '2132345678', true],
  ['tel', '00999999999', false],
  ['tel', '+55 21 97464-6794', true],
  ['tel', '21999999999', false],
  ['tel', '21123456789', false],
  ['tel', '21874646794', false],
  ['nome', 'Felipe', false],
  ['nome', 'Felipe Abrantes', true],
  ['nome', 'Felipe A', false],
  ['nome', 'asdfgh qwerty', false],
  ['nome', 'Kkkkk Aaaa', false],
  ['nome', 'Teste Fernanda', false],
  ['nome', 'Aparecida (favorita do pastor Valdir)', false],
  ['nome', 'Joao 123', false],
  ['nome', 'Brbrbr Silva', false],
  ['nome', 'Mxyzt Silva', false],
  ['nome', 'Maria da Silva', true],
  ['nome', 'Maria de', false],
  ['nome', 'José de Souza', true],
  ['nome', "Ana D'Ávila", true],
  ['nome', 'Ana-Maria Costa', true],
  ['nome', 'HÉLIO RICARDO BRASIL LIRA', true],
  ['nome', 'Rosy Paula Pereira de Freitas', true],
  ['nome', 'Lu Silva', true],
  ['nome', 'ALEX S M MANHÃES', true],
  ['nome', 'A. MARCOS B. DE SOUZA', true],
  ['nome', 'ALESSANDRA Q.R. SOARES', true],
  ['nome', 'BRUNA B', false],
  ['nome', 'Schmidt Oliveira', true],
]
let falhas = 0
for (const [tipo, v, esperado] of casos) {
  const r = tipo === 'tel' ? telefoneBR(v) : nomeCompleto(v)
  const ok = r === esperado
  if (!ok) falhas++
  console.log(`${ok ? 'OK  ' : 'FALHA'} ${tipo} ${JSON.stringify(v)} -> ${r} (esperado ${esperado})`)
}
if (falhas) { console.error(`${falhas} falha(s)`); process.exit(1) }
console.log('Todos os casos passaram.')
