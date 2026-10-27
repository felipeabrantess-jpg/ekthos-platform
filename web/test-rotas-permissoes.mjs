/**
 * test-rotas-permissoes.mjs — matriz perfil × rota (Supabase MOCKADO, Playwright).
 *   node test-rotas-permissoes.mjs            (dev server :5173)
 * A expectativa vem do próprio ROUTE_PERMISSIONS (src/hooks/useRole.ts): o teste não cria regra nova.
 * Cobre as 8 rotas protegidas nesta correção + rotas que já eram protegidas (regressão), para todos os perfis.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });

// ROUTE_PERMISSIONS lido do código-fonte
const src = readFileSync(new URL('./src/hooks/useRole.ts', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('ROUTE_PERMISSIONS'), src.indexOf('\n}', src.indexOf('ROUTE_PERMISSIONS')));
const PERM = {};
for (const m of block.matchAll(/'([^']+)':\s*\[([^\]]*)\]/g)) PERM[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map(x => x[1]);

const ROLES = ['admin', 'admin_departments', 'pastor_celulas', 'supervisor', 'cell_leader', 'secretary', 'treasurer', 'ministry_leader'];
// [url visitada, chave de permissão]
const ROUTES = [
  ['/eventos', '/eventos'], ['/cursos', '/cursos'], ['/empresarios', '/empresarios'], ['/oracao', '/oracao'],
  ['/culto/relatorios', '/culto/relatorios'], ['/campanha', '/campanha'], ['/conversas', '/conversas'], ['/conversas/abc', '/conversas'],
  ['/lideres', '/lideres'], ['/lideres/abc', '/lideres'],
  // regressão: já protegidas antes
  ['/pessoas', '/pessoas'], ['/ministerios', '/ministerios'], ['/financeiro', '/financeiro'],
];

let current;
const mkSession = (id, role) => { const meta = { church_id: CH, role, provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };
const results = []; const ck = (n, ok, info = '') => { results.push(ok); if (!ok || process.env.VERBOSE) console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession('u-' + current, current)));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession('u-' + current, current).user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: current }));
  if (url.includes('/rest/v1/rpc/get_my_tenant_context')) return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: current, is_ekthos_admin: false }));
  if (url.includes('/rest/v1/rpc/upsert_session_token')) return route.fulfill(json('tok'));
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const row = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? row : [row])); }
  if (url.includes('/functions/v1/')) return route.fulfill(json({}));
  return route.fulfill(json([]));
});
const page = await ctx.newPage();

for (const role of ROLES) {
  current = role;
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession('u-' + role, role) }); break; } catch { await page.waitForTimeout(400); } }
  for (const [url, key] of ROUTES) {
    const allowed = (PERM[key] ?? []).includes(role);
    await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('[class*="animate-spin"]') || true, null, { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(1200);
    const path = new URL(page.url()).pathname;
    const ficou = path === url;
    ck(`${role.padEnd(17)} ${url.padEnd(18)} ${allowed ? 'abre' : 'bloqueada'}`, allowed ? ficou : !ficou, path);
  }
}
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n${ROLES.length} perfis × ${ROUTES.length} rotas — esperado = ROUTE_PERMISSIONS`);
console.log(`=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
