import { chromium } from 'playwright';
/**
 * test-qr-telefone-ddi.mjs — VisitorLanding: máscara de telefone com DDI +55 (achado da homologação do QR).
 * Número com +55 / 55 colado é normalizado para (DD) NNNNN-NNNN; número digitado normalmente segue igual;
 * DDD 55 (RS) digitado com 11 dígitos não é confundido com DDI. Backend simulado; zero produção.
 */
const BASE = 'http://localhost:5173';
const results = []
const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }
const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext()
let efReply = { success: true, message: 'Cadastro realizado!' }
let efCalls = []
await ctx.route('**/*', async (r) => {
  const u = r.request().url()
  if (!u.includes('.supabase.co')) return r.continue()
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' }
  if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cors })
  if (u.includes('/functions/v1/church-public')) return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ found: true, name: 'Igreja Teste', logo_url: null, primary_color: '#4F46E5', whatsapp_number_display: null }) })
  if (u.includes('/functions/v1/visitor-capture')) { efCalls.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(efReply) }) }
  return r.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: '[]' })
})
const page = await ctx.newPage()
await page.setViewportSize({ width: 420, height: 900 })


const errs = []
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch') && !/status of (400|403|404|406)/.test(m.text())) errs.push(m.text()) })
async function open() {
  await page.goto(`${BASE}/visita/igv-teste`, { waitUntil: 'networkidle' }); await page.waitForTimeout(700)
}
const phoneInput = () => page.locator('input[placeholder="(11) 98765-4321"]')
async function fillRest(name = 'Maria Teste') {
  await page.locator('input[placeholder="Seu nome"]').fill(name)
  const sel = page.locator('select').first()
  const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean))
  await sel.selectOption(opts.includes('visitante') ? 'visitante' : opts[0])
  const cb = page.locator('input[type="checkbox"]'); if (await cb.count()) await cb.first().check()
}
const submit = async () => { await page.locator('button[type="submit"]').click(); await page.waitForTimeout(900) }

// ── Máscara: entradas → valor exibido ───────────────────────
const casos = [
  ['+55 21 99000-0002',   '(21) 99000-0002', 'com +55 e espaços'],
  ['+5521990000002',      '(21) 99000-0002', 'com +55 colado, só dígitos'],
  ['5521990000002',       '(21) 99000-0002', 'com 55 sem +'],
  ['+55 (21) 99000-0002', '(21) 99000-0002', 'com +55 e máscara'],
  ['+55 21 9000-0002',    '(21) 9000-0002',  'fixo/8 dígitos com +55'],
  ['(21) 99000-0002',     '(21) 99000-0002', 'já mascarado, sem +55'],
  ['21990000002',         '(21) 99000-0002', 'só dígitos, sem +55'],
  ['2190000002',          '(21) 9000-0002',  '10 dígitos, sem +55'],
  ['55999998888',         '(55) 99999-8888', 'DDD 55 (RS) com 11 dígitos NÃO é DDI'],
  ['+55 55 99999-8888',   '(55) 99999-8888', 'DDI + DDD 55'],
]
for (const [entrada, esperado, rotulo] of casos) {
  await open()
  await phoneInput().fill(entrada); await page.waitForTimeout(150)
  const v = await phoneInput().inputValue()
  ck(`máscara — ${rotulo}: "${entrada}" → "${esperado}"`, v === esperado, v)
}
// digitação tecla a tecla (como o usuário), com +55
await open()
await phoneInput().pressSequentially('+5521990000002', { delay: 15 }); await page.waitForTimeout(150)
ck('digitado tecla a tecla com +55 → (21) 99000-0002', (await phoneInput().inputValue()) === '(21) 99000-0002', await phoneInput().inputValue())
await open()
await phoneInput().pressSequentially('21990000002', { delay: 15 }); await page.waitForTimeout(150)
ck('digitado tecla a tecla sem +55 → (21) 99000-0002', (await phoneInput().inputValue()) === '(21) 99000-0002', await phoneInput().inputValue())

// ── Fluxos: o que é enviado à função ────────────────────────
efReply = { success: true, message: 'Cadastro realizado!' }; efCalls = []
await open(); await fillRest('Novo Com DDI'); await phoneInput().fill('+55 21 99000-0002'); await submit()
let t = await page.locator('body').innerText()
ck('cadastro novo com +55: envia (21) 99000-0002 e mostra o sucesso', efCalls.length === 1 && efCalls[0].phone === '(21) 99000-0002' && /Recebemos seu cadastro/i.test(t), JSON.stringify(efCalls[0]))
efCalls = []
await open(); await fillRest('Novo Sem DDI'); await phoneInput().fill('21990000003'); await submit()
ck('cadastro novo sem +55: envia (21) 99000-0003', efCalls.length === 1 && efCalls[0].phone === '(21) 99000-0003', JSON.stringify(efCalls[0]))
// telefone já cadastrado: com e sem +55 chegam como o MESMO número → a função responde "já cadastrado"
efReply = { success: true, already_registered: true, message: 'USUÁRIO JÁ CADASTRADO' }; efCalls = []
await open(); await fillRest('Outro Nome'); await phoneInput().fill('+55 21 99000-0002'); await submit()
t = await page.locator('body').innerText()
ck('telefone já cadastrado com +55: mostra "USUÁRIO JÁ CADASTRADO"', /USUÁRIO JÁ CADASTRADO/.test(t) && efCalls[0].phone === '(21) 99000-0002', JSON.stringify(efCalls[0]))
const c1 = efCalls[0].phone; efCalls = []
await open(); await fillRest('Outro Nome 2'); await phoneInput().fill('21990000002'); await submit()
ck('proteção contra duplicidade: o mesmo número com e sem +55 gera a MESMA entrada para a função', efCalls.length === 1 && efCalls[0].phone === c1, c1 + ' / ' + efCalls[0]?.phone)
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
