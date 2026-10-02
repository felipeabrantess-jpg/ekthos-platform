/**
 * test-ministerios-documentacao.mjs — botão "Documentação" em /ministerios (item 14 da ata IGV),
 * com Supabase MOCKADO (Playwright). Zero requisições ao banco.
 *   node test-ministerios-documentacao.mjs
 * Usa dois dev servers locais:
 *   :5173 → sem VITE_IGV_MINISTERIOS_DOCS_URL (link não configurado)
 *   :5174 → VITE_IGV_MINISTERIOS_DOCS_URL=https://example.com/pasta-de-teste   (opcional; pula se não estiver no ar)
 */
import { chromium } from 'playwright';

const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const IGV = '6c127559-874a-4748-8fce-55d4079613a5', OUTRA = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (church, role) => { const meta = { church_id: church, role, provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: 'u1', role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'u1@t', app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch();
async function open(base, church, role) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ministries = [{ id: 'm1', church_id: church, name: 'Louvor', slug: 'louvor', description: null, leader_id: null, leader_user_id: role === 'admin' ? null : 'u1', is_active: true, people: null }];
  const writes = [];
  await ctx.route(`${SUPA}/**`, async (route) => {
    const url = route.request().url(); const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
    if (method !== 'GET' && !url.includes('/rpc/') && !url.includes('/auth/')) writes.push(method + ' ' + url);
    if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession(church, role)));
    if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession(church, role).user));
    if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role }));
    if (url.includes('/rest/v1/rpc/')) {
      const name = url.split('/rest/v1/rpc/')[1].split('?')[0];
      if (name === 'get_my_tenant_context') return route.fulfill(json({ effective_church_id: church, church_name: 'T', church_status: 'configured', is_impersonating: false, role, is_ekthos_admin: false }));
      if (name === 'upsert_session_token') return route.fulfill(json('tok'));
      if (name === 'get_ministry_member_counts') return route.fulfill(json([{ ministry_id: 'm1', cnt: 3 }]));
      if (name === 'get_my_managed_ministries') return route.fulfill(json([{ ministry_id: 'm1' }]));
      return route.fulfill(json([]));
    }
    if (url.includes('/rest/v1/ministries')) return route.fulfill(json(ministries));
    if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const row = { id: church, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? row : [row])); }
    return route.fulfill(json([]));
  });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession(church, role) }); break; } catch { await page.waitForTimeout(500); } }
  await page.goto(`${base}/ministerios`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(1200);
  return { ctx, page, writes };
}
const up = async (base) => { try { return (await fetch(base)).ok; } catch { return false; } };
const doc = (page) => page.locator('[data-testid="btn-documentacao"]');

// ── A. IGV sem link configurado (:5173) ──
{
  const { ctx, page } = await open('http://localhost:5173', IGV, 'admin');
  ck('IGV sem link: botão "Documentação" aparece ao lado de "Fila de Encaminhamentos"', (await doc(page).count()) === 1 && (await doc(page).innerText()).includes('Documentação')
    && await doc(page).evaluate((el) => { const fila = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Fila de Encaminhamentos'); const a = el.getBoundingClientRect(), b = fila.getBoundingClientRect(); return Math.abs(a.top - b.top) < 16 && a.left > b.right; }));
  ck('IGV sem link: botão desabilitado, com aviso de que falta configurar o link; não abre nada', await doc(page).isDisabled() && (await doc(page).getAttribute('title')) === 'Link da documentação ainda não configurado' && (await doc(page).getAttribute('href')) === null);
  await page.locator('button:has-text("Fila de Encaminhamentos")').click(); await page.waitForTimeout(500);
  ck('aba "Fila de Encaminhamentos" continua funcionando e o botão segue visível', (await doc(page).count()) === 1 && (await page.locator('button:has-text("Fila de Encaminhamentos")').getAttribute('class')).includes('shadow-sm'));
  await page.locator('button', { hasText: /^Ministérios$/ }).first().click(); await page.waitForTimeout(400);
  ck('cards de ministério, "Pessoas" e "+ Novo Ministério" intactos', (await page.locator('h3:has-text("Louvor")').count()) === 1 && (await page.locator('[data-testid="btn-pessoas"]').count()) === 1 && (await page.locator('button:has-text("+ Novo Ministério")').count()) === 1);
  await page.screenshot({ path: 'ministerios-documentacao-sem-link.png' });
  await ctx.close();
}
// ── B. outra igreja: botão não existe ──
{
  const { ctx, page } = await open('http://localhost:5173', OUTRA, 'admin');
  ck('outra igreja: botão "Documentação" NÃO aparece; abas normais', (await doc(page).count()) === 0 && (await page.locator('button:has-text("Fila de Encaminhamentos")').count()) === 1);
  await ctx.close();
}
// ── C. IGV com link configurado (:5174) ──
if (await up('http://localhost:5174')) {
  for (const role of ['admin', 'admin_departments']) {
    const { ctx, page, writes } = await open('http://localhost:5174', IGV, role);
    const ok = (await doc(page).count()) === 1 && (await doc(page).getAttribute('href')) === 'https://example.com/pasta-de-teste' && (await doc(page).getAttribute('target')) === '_blank' && (await doc(page).getAttribute('rel')) === 'noopener noreferrer';
    ck(`IGV com link (${role}): botão é link https, abre em nova aba (noopener)`, ok, page.url());
    if (role === 'admin') {
      const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null), doc(page).click()]);
      if (popup) await popup.waitForURL(/example.com/, { timeout: 10000 }).catch(() => {});
      ck('clicar abre a documentação em NOVA aba; a tela de Ministérios permanece', !!popup && popup.url().startsWith('https://example.com/pasta-de-teste') && page.url().includes('/ministerios'), popup?.url());
      ck('clicar não grava nada no sistema', writes.length === 0, writes.join(','));
      await page.screenshot({ path: 'ministerios-documentacao-com-link.png' });
    }
    await ctx.close();
  }
} else console.log('(servidor :5174 fora do ar — cenário "com link" não executado)');

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
