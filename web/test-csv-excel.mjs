// Teste do formato CSV para Excel pt-BR (web/src/features/people/csvFormat.ts) — lógica pura, sem banco e sem navegador.
// Uso: node test-csv-excel.mjs   (requer esbuild, já presente via vite)
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'

const src = readFileSync(new URL('./src/features/people/csvFormat.ts', import.meta.url), 'utf8')
const { code } = await transform(src, { loader: 'ts', format: 'esm' })
const { CSV_DELIMITER, CSV_NEWLINE, csvCell, protectFormula, formatPhoneForExcel, phoneCell, toCsvText } =await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

const res = []; const ck = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${i ? ' — ' + i : ''}`) }

// Leitor equivalente ao do Excel pt-BR: delimitador ";", campos entre aspas, "" = aspas, quebras dentro de aspas.
function parse(text, delim = ';') {
  const rows = []; let row = [], cur = '', q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === delim) { row.push(cur); cur = '' }
    else if (ch === '\r' && text[i + 1] === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; i++ }
    else cur += ch
  }
  row.push(cur); rows.push(row); return rows
}

ck('delimitador é ";" e fim de linha é CRLF', CSV_DELIMITER === ';' && CSV_NEWLINE === '\r\n')

// ── campos difíceis: ; , " quebra de linha, acentos, emoji ──
const dificeis = ['Zélia "Dona" Souza; da Silva', 'a,b,c', 'linha1\nlinha2', 'linha1\r\nlinha2', 'ação — coração ç ã õ ü', 'João 🙏', ';;;', '""', '', 'termina com aspas"']
const head = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9', 'c10']
const text = toCsvText([head, dificeis])
const back = parse(text)
ck('ida e volta: 10 colunas por linha e 2 linhas', back.length === 2 && back[0].length === 10 && back[1].length === 10, `${back.length}x${back[1]?.length}`)
const esperado = dificeis.map(v => v.replace(/\r\n?/g, '\n'))
ck('valores com ; , " e acentos voltam idênticos', JSON.stringify(back[1]) === JSON.stringify(esperado))
ck('quebra de linha dentro do campo não cria linha nova', back.length === 2 && /linha1\nlinha2/.test(back[1][2]))
ck('com "," como delimitador o Excel veria o arquivo inteiro numa coluna só (motivo do defeito)', !text.split('\r\n')[0].includes(','))

// ── injeção de fórmula ──
const inj = ['=HYPERLINK("http://x","clique")', '+55 11', '-2+3', '@SOMA(A1)', '\tTAB', '\rCR', 'normal', 'a=b']
const prot = inj.map(protectFormula)
ck('texto começando com = + - @ TAB CR ganha apóstrofo', prot.slice(0, 6).every(s => s.startsWith("'")), JSON.stringify(prot.slice(0, 3)))
ck('texto normal e "=" no meio ficam intactos', prot[6] === 'normal' && prot[7] === 'a=b')

// ── telefones ──
const tel = {
  '+5521966900021': '+55 (21) 96690-0021', '5521966900021': '+55 (21) 96690-0021', '21966900021': '(21) 96690-0021',
  '(21) 99000-0002': '(21) 99000-0002', '+55 21 99000-0002': '+55 (21) 99000-0002', '552133334444': '+55 (21) 3333-4444', '2133334444': '(21) 3333-4444',
  '972860835': '972860835', '02119643512': '02119643512', '+1 415 555 0100': '+1 415 555 0100', '': '', '  ': '',
}
for (const [a, b] of Object.entries(tel)) ck(`telefone ${JSON.stringify(a)} → ${JSON.stringify(b)}`, formatPhoneForExcel(a) === b, formatPhoneForExcel(a))
ck('telefone nulo/indefinido → vazio', formatPhoneForExcel(null) === '' && formatPhoneForExcel(undefined) === '')
ck('telefone formatado sobrevive à ida e volta (texto, com "+" e parênteses)', parse(toCsvText([[formatPhoneForExcel('+5521966900021')]]))[0][0] === '+55 (21) 96690-0021')

// ── telefone SEMPRE texto no Excel (phoneCell) ──
// Simula o que o Excel faz ao abrir a célula: ="..." vira o texto entre aspas; um valor iniciado em + - = @ vira fórmula;
// um valor só de dígitos vira número (perde "+" e zeros).
const excelVe = cell => {
  const m = /^="([^"]*)"$/.exec(cell); if (m) return { tipo: 'texto', valor: m[1] }
  if (/^[=+\-@]/.test(cell)) return { tipo: 'formula', valor: cell }
  if (/^\d+$/.test(cell)) return { tipo: 'numero', valor: cell }
  return { tipo: 'texto', valor: cell }
}
const fones = ['+5521966900021', '5521966900021', '21966900021', '(21) 99000-0002', '972860835', '97286083', '02119643512', '+14155550100', '+1 415 555 0100', '+351 912 345 678', '552198645974', '0800 123 4567']
for (const f of fones) {
  const c = phoneCell(f); const v = excelVe(parse(toCsvText([[c]]))[0][0])
  const dig = s => s.replace(/\D/g, '')
  ck(`telefone ${JSON.stringify(f)} → texto no Excel, mesmos dígitos`, v.tipo === 'texto' && dig(v.valor) === dig(f).replace(/^(?=\d{12,13}$)/, '') || (v.tipo === 'texto' && dig(v.valor) === dig(f)), `${v.tipo}: ${v.valor}`)
}
ck('sem DDD (9 e 8 dígitos) viram texto e conservam o valor', excelVe(phoneCell('972860835')).valor === '972860835' && excelVe(parse(toCsvText([[phoneCell('97286083')]]))[0][0]).tipo === 'texto')
ck('internacional sem formatação mantém o "+" e todos os dígitos', excelVe(parse(toCsvText([[phoneCell('+14155550100')]]))[0][0]).valor === '+14155550100')
ck('brasileiro reconhecível sai legível, com "+55"', excelVe(parse(toCsvText([[phoneCell('+5521966900021')]]))[0][0]).valor === '+55 (21) 96690-0021')
for (const mal of ['=1+1', '=HYPERLINK("http://x","a")', '@SUM(A1)', '+cmd|calc!A1', '-2+3x', '=21 99999-9999;=1']) {
  const out = excelVe(parse(toCsvText([[phoneCell(mal)]]))[0][0])
  ck(`telefone malicioso ${JSON.stringify(mal)} não vira fórmula`, out.tipo === 'texto' && out.valor.startsWith("'"), out.valor)
}
ck('telefone vazio/nulo → célula vazia', phoneCell('') === '' && phoneCell(null) === '' && phoneCell(undefined) === '')
ck('célula de telefone não carrega aspas nem operadores além de + - ( )', fones.every(f => /^="[+\d\s().\-]*"$/.test(phoneCell(f))))

// ── datas e números: texto dd/mm/aaaa e dígitos ficam como estão ──
const row = parse(toCsvText([['05/06/2026', '14/10/2026 18:34', '7', '0']]))[0]
ck('datas dd/mm/aaaa e números inalterados', row.join('|') === '05/06/2026|14/10/2026 18:34|7|0')

// ── estrutura: toda linha com o mesmo nº de colunas ──
const grande = Array.from({ length: 2000 }, (_, i) => Array.from({ length: 37 }, (_, c) => (c === 0 ? `Nome "${i}"; ç` : c === 2 ? `p${i}@x.com` : c % 5 === 0 ? 'a\nb' : String(i * c))))
const t2 = toCsvText(grande); const b2 = parse(t2)
ck('2.000 linhas × 37 colunas: contagem e conteúdo preservados', b2.length === 2000 && b2.every(r => r.length === 37) && b2[1999][0] === 'Nome "1999"; ç')
ck('csvCell: nulo/indefinido → ""', csvCell(null) === '""' && csvCell(undefined) === '""')

// ── gravação: BOM UTF-8 e tipo ──
const people = readFileSync(new URL('./src/pages/People.tsx', import.meta.url), 'utf8')
ck("arquivo é gravado com BOM UTF-8 e type 'text/csv;charset=utf-8'", /new Blob\(\['\\uFEFF' \+ csv\.text\], \{ type: 'text\/csv;charset=utf-8;' \}\)/.test(people))
const exp = readFileSync(new URL('./src/features/people/exportCsv.ts', import.meta.url), 'utf8')
ck('exportCsv usa toCsvText (delimitador único) e não junta com ","', /toCsvText\(lines\)/.test(exp) && !/\.join\(','\)/.test(exp))

const falhou = res.filter(x => !x).length
console.log(`\n=== ${res.length - falhou}/${res.length} OK ===`)
process.exit(falhou ? 1 : 0)
