/**
 * test-ministerios-pessoas.mjs — /ministerios com Supabase MOCKADO (Playwright).
 * Zero requisições ao banco. Prova a fiação do frontend:
 *   - lista "Pessoas do Ministério" vem de get_ministry_members (ministry_members);
 *   - Incluir → ministry_member_add; Remover → ministry_member_remove; nada em volunteers;
 *   - busca no PersonSelect: fernanda/FERNANDA/joao/conceicao (normalizeSearch → name_sort), excludeIds;
 *   - admin gere todos; líder (conta vinculada) só o seu (outros: sem botão, RPC 403); usuário comum: nada;
 *   - card mostra "Pessoas: N" de get_ministry_member_counts; select de conta do líder (admin).
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const M_LOUVOR = 'm-louvor', M_INFANTIL = 'm-infantil';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (id, role) => {
  const meta = { church_id: CH, role, provider: 'email' };
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x';
  return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } };
};
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ── estado "do banco" ─────────────────────────────────────────
const people = [
  { id: 'p1', name: 'Fernanda Silva' }, { id: 'p2', name: 'FERNANDA COSTA' }, { id: 'p3', name: 'João Pedro' },
  { id: 'p4', name: 'Maria da Conceição' }, { id: 'p5', name: 'Ana Karolina Conceição' }, { id: 'p6', name: 'Carlos Souza' },
].map(p => ({ ...p, name_sort: norm(p.name), email: null }));
const ministries = [
  { id: M_LOUVOR, church_id: CH, name: 'Louvor', slug: 'louvor', description: null, leader_id: null, leader_user_id: 'u-leader', is_active: true, people: { id: 'p6', name: 'Carlos Souza', phone: null, email: null } },
  { id: M_INFANTIL, church_id: CH, name: 'Infantil', slug: 'infantil', description: null, leader_id: null, leader_user_id: null, is_active: true, people: null },
];
const members = { [M_LOUVOR]: [], [M_INFANTIL]: [] };
const volunteers = [{ id: 'v1', church_id: CH, ministry_id: M_LOUVOR, person_id: 'p6', is_active: true }];
const volunteersSnapshot = JSON.stringify(volunteers);
const rpcCalls = [];
let current = { id: 'u-admin', role: 'admin' };
const isAdmin = () => ['admin', 'admin_departments'].includes(current.role);
const canManage = (mid) => isAdmin() || ministries.find(m => m.id === mid)?.leader_user_id === current.id;
const volunteersTouched = [];

const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method();
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession(current.id, current.role)));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession(current.id, current.role).user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: current.role }));
  if (url.includes('/rest/v1/volunteers')) { volunteersTouched.push(method + ' ' + url.slice(0, 80)); return route.fulfill(json(method === 'GET' ? volunteers : {})); }
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    rpcCalls.push({ name, body });
    if (name === 'get_my_tenant_context') return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: current.role, is_ekthos_admin: false }));
    if (name === 'upsert_session_token') return route.fulfill(json('tok'));
    if (name === 'get_ministry_member_counts') return route.fulfill(json(Object.entries(members).filter(([k]) => canManage(k)).map(([k, v]) => ({ ministry_id: k, cnt: v.length }))));
    if (name === 'get_my_managed_ministries') return route.fulfill(json(ministries.filter(m => canManage(m.id)).map(m => ({ ministry_id: m.id }))));
    if (name === 'get_church_accounts') return isAdmin() ? route.fulfill(json([{ user_id: 'u-leader', email: 'lider@t', name: 'Carlos Souza', role: 'cell_leader' }, { user_id: 'u-admin', email: 'admin@t', name: 'Admin', role: 'admin' }])) : route.fulfill(json({ message: 'FORBIDDEN' }, 403));
    if (name === 'get_ministry_members' && !canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403));
    if (name === 'get_ministry_members') return route.fulfill(json(members[body.p_ministry_id].map(pid => { const p = people.find(x => x.id === pid); return { person_id: pid, name: p.name, phone: null, email: null, role: 'membro', since: '2026-09-24' }; })));
    if (name === 'ministry_member_add') { if (!canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403)); const l = members[body.p_ministry_id]; const ins = !l.includes(body.p_person_id); if (ins) l.push(body.p_person_id); return route.fulfill(json({ inserted: ins })); }
    if (name === 'ministry_member_remove') { if (!canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403)); const l = members[body.p_ministry_id]; const i = l.indexOf(body.p_person_id); if (i >= 0) l.splice(i, 1); return route.fulfill(json({ removed: i >= 0 })); }
    return route.fulfill(json([]));
  }
  if (url.includes('/rest/v1/ministries')) return route.fulfill(json(ministries));
  if (url.includes('/rest/v1/people')) {
    const q = new URL(url).searchParams; const like = q.get('name_sort'); const id = q.get('id');
    if (id) { const p = people.find(x => x.id === id.replace('eq.', '')); return route.fulfill(json(p ?? null)); }
    let rows = people; if (like) { const term = like.replace('ilike.', '').replace(/%/g, '').replace(/\*/g, ''); rows = people.filter(p => p.name_sort.includes(term)); }
    return route.fulfill(json(rows.slice(0, 40)));
  }
  if (url.includes('/rest/v1/churches')) return route.fulfill(json({ id: CH, name: 'T', status: 'configured', enabled_modules: { ministerios: true }, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }));
  return route.fulfill(json([]));
});

const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch') && !m.text().includes('403')) errs.push(m.text()); }); // 403 esperado no teste de RPC direta do líder
async function loginAs(id, role) {
  current = { id, role };
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession(id, role) }); break; } catch { await page.waitForTimeout(500); } }
  await page.goto(`${BASE}/ministerios`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1200);
}
const card = (name) => page.locator('h3:has-text("' + name + '")').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
const txt = async (loc) => ((await loc.first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

// ── ADMIN ────────────────────────────────────────────────────
await loginAs('u-admin', 'admin');
ck('admin: /ministerios abre com 2 cards', (await page.locator('[data-testid="btn-pessoas"]').count()) === 2);
ck('admin: cards mostram "Pessoas: 0" (ministry_members) e não "Voluntários"', (await txt(card('Louvor').locator('[data-testid="member-count"]'))) === '0' && (await page.locator('text=Voluntários:').count()) === 0);
ck('admin: botão "Pessoas" (gestão) em todos os cards', (await page.locator('[data-testid="btn-pessoas"]:has-text("Pessoas")').count()) === 2 && (await page.locator('text=Ver pessoas').count()) === 0);
await card('Louvor').locator('[data-testid="btn-pessoas"]').click(); await page.waitForTimeout(600);
ck('modal "Pessoas do Ministério — Louvor" aberto', (await page.locator('text=Pessoas do Ministério — Louvor').count()) > 0);
const input = page.locator('[data-testid="pessoas-ministerio"] input').first();
for (const [term, expectNames] of [['FERNANDA', ['Fernanda Silva', 'FERNANDA COSTA']], ['joao', ['João Pedro']], ['conceicao', ['Maria da Conceição', 'Ana Karolina Conceição']]]) {
  await input.fill(term); await page.waitForTimeout(900);
  const shown = await page.locator('[data-testid="pessoas-ministerio"] ul li button span:first-child').allTextContents();
  ck(`busca "${term}" → ${expectNames.join(' + ')}`, expectNames.every(n => shown.includes(n)) && shown.length === expectNames.length, shown.join(' | '));
}
await input.fill('fernanda'); await page.waitForTimeout(900);
await page.locator('button:has-text("Fernanda Silva")').first().click(); await page.waitForTimeout(300);
await page.locator('[data-testid="btn-incluir"]').click(); await page.waitForTimeout(800);
ck('Incluir → RPC ministry_member_add (Louvor, Fernanda Silva)', rpcCalls.some(c => c.name === 'ministry_member_add' && c.body.p_ministry_id === M_LOUVOR && c.body.p_person_id === 'p1'));
ck('lista "1 pessoa do ministério" com Fernanda Silva + botão Remover', (await txt(page.locator('[data-testid="pessoas-total"]'))) === '1 pessoa do ministério' && (await page.locator('[data-testid="pessoa-item"]:has-text("Fernanda Silva") [data-testid="btn-remover"]').count()) === 1);
await input.fill('fernanda'); await page.waitForTimeout(900);
const shown2 = await page.locator('[data-testid="pessoas-ministerio"] ul li button span:first-child').allTextContents();
ck('excludeIds: Fernanda Silva não aparece mais na busca', !shown2.includes('Fernanda Silva') && shown2.includes('FERNANDA COSTA'), shown2.join(' | '));
await page.locator('text=Pessoas do Ministério — Louvor').first().click(); await page.waitForTimeout(200);
await page.locator('button:has-text("Fechar")').click({ force: true }); await page.waitForTimeout(600);
ck('card Louvor → "Pessoas: 1" após incluir', (await txt(card('Louvor').locator('[data-testid="member-count"]'))) === '1');
await page.screenshot({ path: 'ministerios-admin-cards.png' });
await card('Louvor').locator('[data-testid="btn-pessoas"]').click(); await page.waitForTimeout(600);
await page.screenshot({ path: 'ministerios-pessoas-modal.png' });
await page.locator('[data-testid="btn-remover"]').first().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="btn-confirmar-remover"]').click(); await page.waitForTimeout(800);
ck('Remover → RPC ministry_member_remove e lista vazia', rpcCalls.some(c => c.name === 'ministry_member_remove' && c.body.p_person_id === 'p1') && (await txt(page.locator('[data-testid="pessoas-total"]'))) === '0 pessoas do ministério');
await page.locator('button:has-text("Fechar")').click(); await page.waitForTimeout(400);
// admin: editar ministério mostra select de conta do líder
await card('Louvor').locator('button:has-text("Editar")').click(); await page.waitForTimeout(800);
const sel = page.locator('[data-testid="leader-account-select"]');
ck('admin: Editar mostra "Conta de acesso do líder" com contas da igreja (get_church_accounts)', (await sel.count()) === 1 && (await sel.locator('option').count()) === 3 && (await sel.inputValue()) === 'u-leader');
await page.screenshot({ path: 'ministerios-editar-conta-lider.png' });
await page.locator('button:has-text("Cancelar")').click(); await page.waitForTimeout(300);

// ── LÍDER (conta vinculada só ao Louvor) ─────────────────────
members[M_LOUVOR] = []; members[M_INFANTIL] = ['p3'];
await loginAs('u-leader', 'ministry_leader');
ck('líder: Louvor com "Pessoas" (gestão) e Infantil SEM botão (nem "Ver pessoas")', (await txt(card('Louvor').locator('[data-testid="btn-pessoas"]'))) === 'Pessoas' && (await card('Infantil').locator('[data-testid="btn-pessoas"]').count()) === 0 && (await page.locator('text=Ver pessoas').count()) === 0);
ck('líder: sem Editar/Excluir/Novo Ministério', (await page.locator('button:has-text("Editar")').count()) === 0 && (await page.locator('button:has-text("+ Novo Ministério")').count()) === 0);
await card('Louvor').locator('[data-testid="btn-pessoas"]').click(); await page.waitForTimeout(600);
await page.locator('[data-testid="pessoas-ministerio"] input').first().fill('joao'); await page.waitForTimeout(900);
await page.locator('button:has-text("João Pedro")').first().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="btn-incluir"]').click(); await page.waitForTimeout(800);
ck('líder: inclui no próprio ministério (Louvor)', members[M_LOUVOR].includes('p3') && (await page.locator('[data-testid="pessoa-item"]:has-text("João Pedro")').count()) === 1);
await page.screenshot({ path: 'ministerios-lider-proprio.png' });
await page.locator('button:has-text("Fechar")').click(); await page.waitForTimeout(400);
await page.screenshot({ path: 'ministerios-lider-outro.png' });
const directList = await page.evaluate(async ({ supa, jwt }) => { const r = await fetch(`${supa}/rest/v1/rpc/get_ministry_members`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt, apikey: 'x' }, body: JSON.stringify({ p_ministry_id: 'm-infantil' }) }); return r.status; }, { supa: SUPA, jwt: mkSession('u-leader', 'ministry_leader').access_token });
ck('líder: listar pessoas de outro ministério via RPC direta → 403 (mock do backend)', directList === 403);
// backend também bloqueia: chamada direta da RPC como líder para o Infantil
const direct = await page.evaluate(async ({ supa, jwt }) => { const r = await fetch(`${supa}/rest/v1/rpc/ministry_member_add`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt, apikey: 'x' }, body: JSON.stringify({ p_ministry_id: 'm-infantil', p_person_id: 'p1' }) }); return r.status; }, { supa: SUPA, jwt: mkSession('u-leader', 'ministry_leader').access_token });
ck('líder: RPC direta em outro ministério → 403 FORBIDDEN (mock do backend)', direct === 403 && !members[M_INFANTIL].includes('p1'));

// ── USUÁRIO COMUM (sem conta vinculada) ───────────────────────
await loginAs('u-common', 'ministry_leader');
ck('comum: nenhum card tem botão "Pessoas"/"Ver pessoas"', (await page.locator('[data-testid="btn-pessoas"]').count()) === 0 && (await page.locator('text=Ver pessoas').count()) === 0);
ck('comum: cards visíveis, sem contador de pessoas nem botão', (await page.locator('h3:has-text("Louvor")').count()) === 1 && (await page.locator('[data-testid="member-count"]').count()) === 0);
await page.screenshot({ path: 'ministerios-comum.png' });

// ── volunteers nunca tocada por escrita ───────────────────────
ck('volunteers: nenhuma escrita (POST/PATCH/DELETE) em todo o fluxo', volunteersTouched.every(x => x.startsWith('GET')) && JSON.stringify(volunteers) === volunteersSnapshot, volunteersTouched.join(' | ') || 'nenhum acesso');
ck('nenhuma RPC/tabela de voluntários usada pela tela', !rpcCalls.some(c => /volunteer/i.test(c.name)) && volunteersTouched.length === 0);
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
