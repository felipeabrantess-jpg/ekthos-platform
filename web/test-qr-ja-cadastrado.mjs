import { chromium } from 'playwright';
/**
 * test-qr-ja-cadastrado.mjs — formulários públicos do QR Code (VisitorLanding e IgvSejaMembroPage):
 * telefone novo → mensagem de sucesso atual; telefone já cadastrado → "USUÁRIO JÁ CADASTRADO".
 * Zero requisições à produção (a Edge Function é simulada).
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

async function fillVisitorLanding() {
  await page.goto(`${BASE}/visita/igv-teste`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
  await page.locator('input[placeholder="Seu nome"]').fill('Maria Teste')
  await page.locator('input[placeholder="(11) 98765-4321"]').fill('21977771111')
  const sel = page.locator('select').first()
  const opts = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(Boolean))
  if (opts.length) await sel.selectOption(opts[0])
  const cb = page.locator('input[type="checkbox"]'); if (await cb.count()) await cb.first().check()
  await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1200)
}
async function fillIgv() {
  await page.goto(`${BASE}/igv/seja-membro`, { waitUntil: 'networkidle' }); await page.waitForTimeout(800)
  await page.locator('input[placeholder="Seu nome completo"]').fill('Maria Teste')
  await page.locator('input[placeholder="(21) 98765-4321"]').fill('21977771111')
  const cb = page.locator('input[type="checkbox"]'); if (await cb.count()) await cb.first().check()
  await page.locator('button[type="submit"]').click(); await page.waitForTimeout(1200)
}
const body = async () => (await page.locator('body').innerText())

for (const [nome, fill, okTxt] of [['QR /visita/:slug', fillVisitorLanding, /Recebemos seu cadastro/i], ['IGV /igv/seja-membro', fillIgv, /Bem-vindo\(a\) à família|Recebemos seu cadastro/i]]) {
  efReply = { success: true, message: 'Cadastro realizado!' }; efCalls = []
  await fill()
  let t = await body()
  ck(`${nome}: cadastro novo mostra a mensagem de sucesso atual`, okTxt.test(t) && !/USUÁRIO JÁ CADASTRADO/.test(t), t.replace(/\s+/g, ' ').slice(0, 90))
  ck(`${nome}: o formulário enviou o telefone e o slug à função`, efCalls.length === 1 && !!efCalls[0].phone && !!efCalls[0].slug, JSON.stringify(efCalls[0]))
  efReply = { success: true, already_registered: true, message: 'USUÁRIO JÁ CADASTRADO' }; efCalls = []
  await fill()
  t = await body()
  ck(`${nome}: telefone já cadastrado mostra "USUÁRIO JÁ CADASTRADO"`, /USUÁRIO JÁ CADASTRADO/.test(t) && !okTxt.test(t), t.replace(/\s+/g, ' ').slice(0, 110))
}
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
