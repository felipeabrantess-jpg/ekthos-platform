/**
 * test-ministerios-fila.mjs — Fila de Encaminhamentos: governança por leader_user_id + ação
 * "Incluir no ministério" (item 15 da ata IGV), com Supabase MOCKADO (Playwright).
 *   node test-ministerios-fila.mjs            (dev server local em :5173)
 *   BASE_URL=https://app.ekthoschurch.com node test-ministerios-fila.mjs
 * O mock aplica a MESMA regra do banco: admin/admin_departments veem tudo; a conta vinculada
 * (leader_user_id) só vê o próprio ministério; ministry_member_add exige essa mesma autoridade.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (id, role) => { const meta = { church_id: CH, role, provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };

const ministries = [
  { id: 'm-louvor', church_id: CH, name: 'Louvor', slug: 'louvor', description: null, leader_id: 'p-lider', leader_user_id: 'u-lider', is_active: true, people: { name: 'Líder Louvor' } },
  { id: 'm-kids', church_id: CH, name: 'Kids', slug: 'kids', description: null, leader_id: 'p-outro', leader_user_id: null, is_active: true, people: { name: 'Líder Kids' } },
];
const mkRef = (jid, pid, name, mid, dias) => ({ journey_id: jid, journey_version: 1, person_id: pid, person_name: name, person_phone: null, etapa_nome: 'Visitante', ministry_id: mid, ministry_name: ministries.find(m => m.id === mid).name, encaminhado_em: '2026-09-30T12:00:00Z', encaminhado_por: 'Secretaria', dias_esperando: dias, anotacao: null });
let queue, members, calls, current;
const reset = () => { queue = [mkRef('j1', 'p1', 'Ana Encaminhada', 'm-louvor', 2), mkRef('j2', 'p2', 'Bruno Encaminhado', 'm-louvor', 9), mkRef('j3', 'p3', 'Carla Kids', 'm-kids', 1)]; members = { 'm-louvor': [], 'm-kids': [] }; calls = []; };
const isAdmin = () => ['admin', 'admin_departments'].includes(current.role);
const canManage = (mid) => isAdmin() || ministries.find(m => m.id === mid)?.leader_user_id === current.id;
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession(current.id, current.role)));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession(current.id, current.role).user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: current.role }));
  if (url.includes('/rest/v1/volunteers')) { calls.push({ name: 'volunteers ' + method }); return route.fulfill(json([])); }
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ name, body });
    switch (name) {
      case 'get_my_tenant_context': return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: current.role, is_ekthos_admin: false }));
      case 'upsert_session_token': return route.fulfill(json('tok'));
      case 'get_ministry_member_counts': return route.fulfill(json(Object.entries(members).filter(([k]) => canManage(k)).map(([k, v]) => ({ ministry_id: k, cnt: v.length }))));
      case 'get_my_managed_ministries': return route.fulfill(json(ministries.filter(m => canManage(m.id)).map(m => ({ ministry_id: m.id }))));
      // mesma regra do banco: can_manage_ministry + filtro opcional; e só quem ainda não é membro
      case 'get_ministry_referrals': return route.fulfill(json(queue.filter(r => canManage(r.ministry_id) && (!body.p_ministry_id || r.ministry_id === body.p_ministry_id) && !members[r.ministry_id].includes(r.person_id))));
      case 'ministry_member_add': {
        if (!canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403));
        const l = members[body.p_ministry_id]; const ins = !l.includes(body.p_person_id); if (ins) l.push(body.p_person_id);
        return route.fulfill(json({ inserted: ins }));
      }
      default: return route.fulfill(json([]));
    }
  }
  if (url.includes('/rest/v1/ministries')) return route.fulfill(json(ministries));
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const row = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? row : [row])); }
  return route.fulfill(json([]));
});
const page = await ctx.newPage();
async function loginAs(id, role) {
  current = { id, role };
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession(id, role) }); break; } catch { await page.waitForTimeout(500); } }
  await page.goto(`${BASE}/ministerios`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(1000);
  await page.locator('button:has-text("Fila de Encaminhamentos")').click(); await page.waitForTimeout(900);
}
const cards = () => page.locator('[data-testid="btn-incluir-no-ministerio"]').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
const names = async () => (await cards().locator('p.font-medium').allInnerTexts()).map(s => s.trim()).sort().join(',');
const btn = (name) => cards().filter({ hasText: name }).locator('[data-testid="btn-incluir-no-ministerio"]');

// ── ADMIN: visão global ──
reset(); await loginAs('u-admin', 'admin');
ck('1. admin vê todas as filas (Louvor e Kids)', (await names()) === 'Ana Encaminhada,Bruno Encaminhado,Carla Kids', await names());
ck('admin: cada card tem a ação "Incluir no ministério"', (await page.locator('[data-testid="btn-incluir-no-ministerio"]').count()) === 3);
await page.locator('button', { hasText: /^Kids$/ }).first().click(); await page.waitForTimeout(700);
ck('admin: filtro por ministério continua funcionando', (await names()) === 'Carla Kids', await names());
calls = [];
await btn('Carla Kids').click(); await page.waitForTimeout(900);
const add1 = calls.filter(c => c.name === 'ministry_member_add');
ck('10. admin inclui pela RPC existente ministry_member_add (ministério do card, pessoa do card)', add1.length === 1 && add1[0].body.p_ministry_id === 'm-kids' && add1[0].body.p_person_id === 'p3', JSON.stringify(add1[0]?.body));
ck('12. encaminhamento sai da fila na hora, sem F5', (await page.locator('[data-testid="btn-incluir-no-ministerio"]').count()) === 0 && (await page.getByText('Nenhum encaminhamento pendente').count()) === 1);
ck('clicar em "Incluir" NÃO navega para o Atendimento (o clique no card continua levando)', page.url().includes('/ministerios'));
await page.screenshot({ path: 'ministerios-fila-admin.png' });

// ── ADMIN_DEPARTMENTS ──
reset(); await loginAs('u-dep', 'admin_departments');
ck('2. admin_departments vê todas as filas', (await names()) === 'Ana Encaminhada,Bruno Encaminhado,Carla Kids', await names());

// ── CONTA VINCULADA (leader_user_id do Louvor) ──
reset(); await loginAs('u-lider', 'ministry_leader');
ck('3/4. conta vinculada vê SÓ a fila do seu ministério (Louvor); Kids não aparece', (await names()) === 'Ana Encaminhada,Bruno Encaminhado', await names());
ck('líder não vê o seletor global de ministérios da fila', (await page.locator('button', { hasText: /^Todos$/ }).count()) === 0);
calls = [];
await btn('Ana Encaminhada').click(); await page.waitForTimeout(900);
ck('10. líder inclui a pessoa no seu ministério', members['m-louvor'].join() === 'p1' && calls.filter(c => c.name === 'ministry_member_add').length === 1);
ck('12. card sai da fila na hora; o outro encaminhamento continua', (await names()) === 'Bruno Encaminhado', await names());
ck('fila re-sincronizada com o servidor após incluir', calls.some(c => c.name === 'get_ministry_referrals'));
ck('13. nenhuma chamada a volunteers', !calls.some(c => String(c.name).startsWith('volunteers')));
// 11. duplo clique não duplica
calls = [];
await btn('Bruno Encaminhado').dblclick(); await page.waitForTimeout(900);
ck('11. clique duplo: pessoa entra uma única vez', members['m-louvor'].filter(x => x === 'p2').length === 1 && members['m-louvor'].length === 2, members['m-louvor'].join(','));
await page.screenshot({ path: 'ministerios-fila-lider.png' });
// bidirecional: Ministério → Pessoas mostra a contagem atualizada
await page.locator('button', { hasText: /^Ministérios$/ }).first().click(); await page.waitForTimeout(900);
const louvorCount = await page.locator('h3:has-text("Louvor")').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').locator('[data-testid="member-count"]').innerText();
ck('Ministérios → card Louvor reflete as 2 pessoas incluídas (contagem atualizada)', louvorCount.trim() === '2', louvorCount);

// ── CONTA SEM VÍNCULO (mesmo perfil de líder, mas sem leader_user_id em nenhum ministério) ──
reset(); await loginAs('u-outro', 'ministry_leader');
ck('5/7. conta sem leader_user_id não vê nenhuma fila (ser a PESSOA líder não dá acesso)', (await page.locator('[data-testid="btn-incluir-no-ministerio"]').count()) === 0 && (await page.getByText('Nenhum encaminhamento pendente').count()) === 1);

// ── barreira do servidor: erro amigável ──
reset(); await loginAs('u-admin', 'admin');
current = { id: 'u-outro', role: 'ministry_leader' };   // sessão perde a autoridade antes do clique
await btn('Ana Encaminhada').click(); await page.waitForTimeout(900);
const alertTxt = (await page.locator('[role="alert"]').count()) ? await page.locator('[role="alert"]').first().innerText() : '';
ck('servidor recusa (sem autoridade) → mensagem amigável, nada incluído', alertTxt.includes('não tem permissão') && members['m-louvor'].length === 0 && !/42501|FORBIDDEN/.test(alertTxt), alertTxt);

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
