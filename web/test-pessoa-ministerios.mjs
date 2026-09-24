/**
 * test-pessoa-ministerios.mjs — Editar Pessoa → Ministérios com Supabase MOCKADO (Playwright).
 * Zero requisições ao banco. Prova a fiação do frontend:
 *   - chips refletem ministry_members (get_person_ministries); can_manage=false → chip bloqueado 🔒;
 *   - salvar → sync_person_ministries com a seleção gerível (manter/adicionar/remover); bloqueados imutáveis;
 *   - bidirecional: Ministérios → Pessoas ⇄ Editar Pessoa;
 *   - usuário sem permissão: tudo bloqueado e sync NÃO é chamado;
 *   - criação: cria pessoa → sync com o id real; falha do sync é exibida (modal não fecha);
 *   - PATCH/POST em people NÃO envia ministry_interest; nada em volunteers.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const M = { louvor: 'm-louvor', mulheres: 'm-mulheres', intercessao: 'm-intercessao', kids: 'm-kids' };
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (id, role) => {
  const meta = { church_id: CH, role, provider: 'email' };
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x';
  return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } };
};

// ── estado "do banco" ─────────────────────────────────────────
const basePerson = (id, name) => ({ id, church_id: CH, name, phone: '5521999990000', email: null, person_stage: 'frequentador', birth_date: null, birth_month: null, birth_day: null, conversion_date: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z', deleted_at: null, left_at: null, unit_id: null, source: 'manual', optout: false, person_pipeline: [], person_tags: [], acolhimento_journey: [], ministry_interest: ['Legado'], name_sort: name.toLowerCase() });
const people = [basePerson('p1', 'Fernanda Silva'), basePerson('p6', 'Carlos Souza')];
const ministries = Object.entries({ louvor: 'Louvor', mulheres: 'Mulheres', intercessao: 'Intercessão', kids: 'Kids' }).map(([k, name]) => ({ id: M[k], church_id: CH, name, slug: k, description: null, leader_id: null, leader_user_id: k === 'louvor' ? 'u-leader' : null, is_active: true, people: null }));
const members = { [M.louvor]: ['p1'], [M.mulheres]: [], [M.intercessao]: [], [M.kids]: ['p1'] };   // Fernanda: Louvor + Kids
const volunteers = []; const volunteersTouched = [];
const rpcCalls = []; const peopleWrites = [];
let current = { id: 'u-admin', role: 'admin' };
let failNextSync = false;
const isAdmin = () => ['admin', 'admin_departments'].includes(current.role);
const canManage = (mid) => isAdmin() || ministries.find(m => m.id === mid)?.leader_user_id === current.id;
const linksOf = (pid) => Object.entries(members).filter(([, l]) => l.includes(pid)).map(([mid]) => mid);

const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method();
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession(current.id, current.role)));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession(current.id, current.role).user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: current.role }));
  if (url.includes('/rest/v1/volunteers')) { volunteersTouched.push(method); return route.fulfill(json(volunteers)); }
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    rpcCalls.push({ name, body, who: current.id });
    switch (name) {
      case 'get_my_tenant_context': return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: current.role, is_ekthos_admin: false }));
      case 'upsert_session_token': return route.fulfill(json('tok'));
      case 'get_people_page': { const rows = people.filter(p => !body.p_search || p.name_sort.includes(body.p_search.toLowerCase())); return route.fulfill(json(rows.map(r => ({ row_data: r, total_count: rows.length })))); }
      case 'get_people_stage_counts': return route.fulfill(json({ total: people.length, aniversarios: 0, sem_etapa: people.length, stages: [] }));
      case 'get_care_status_counts': return route.fulfill(json({ nao_atendida: 0, em_atendimento: 0, atendida: 0, sem_contato_48h: 0 }));
      case 'get_unit_counts': return route.fulfill(json([]));
      case 'get_contact_counts': return route.fulfill(json([]));
      case 'get_ministry_member_counts': return route.fulfill(json(Object.entries(members).filter(([k]) => canManage(k)).map(([k, v]) => ({ ministry_id: k, cnt: v.length }))));
      case 'get_my_managed_ministries': return route.fulfill(json(ministries.filter(m => canManage(m.id)).map(m => ({ ministry_id: m.id }))));
      case 'get_church_accounts': return route.fulfill(json([]));
      case 'get_ministry_members': if (!canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403));
        return route.fulfill(json(members[body.p_ministry_id].map(pid => ({ person_id: pid, name: people.find(x => x.id === pid).name, phone: null, email: null, role: 'membro', since: '2026-09-24' }))));
      case 'ministry_member_add': { if (!canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403)); const l = members[body.p_ministry_id]; const ins = !l.includes(body.p_person_id); if (ins) l.push(body.p_person_id); return route.fulfill(json({ inserted: ins })); }
      case 'ministry_member_remove': { if (!canManage(body.p_ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403)); const l = members[body.p_ministry_id]; const i = l.indexOf(body.p_person_id); if (i >= 0) l.splice(i, 1); return route.fulfill(json({ removed: i >= 0 })); }
      case 'get_person_ministries': return route.fulfill(json(linksOf(body.p_person_id).map(mid => ({ ministry_id: mid, ministry_name: ministries.find(m => m.id === mid).name, can_manage: canManage(mid), since: '2026-09-24' }))));
      case 'sync_person_ministries': {
        if (failNextSync) { failNextSync = false; return route.fulfill(json({ code: 'P0001', message: 'SIMULATED_FAILURE' }, 400)); }
        const pid = body.p_person_id; const desired = new Set(body.p_ministry_ids || []); const res = { person_id: pid, added: [], removed: [], kept: [], skipped: [] };
        for (const m of ministries) {
          const cur = members[m.id].includes(pid); const want = desired.has(m.id);
          if (!cur && !want) continue;
          if (!canManage(m.id)) { res.skipped.push(m.id); continue; }
          if (want && !cur) { members[m.id].push(pid); res.added.push(m.id); }
          else if (cur && !want) { members[m.id] = members[m.id].filter(x => x !== pid); res.removed.push(m.id); }
          else res.kept.push(m.id);
        }
        return route.fulfill(json(res));
      }
      default: return route.fulfill(json([]));
    }
  }
  if (url.includes('/rest/v1/ministries')) return route.fulfill(json(ministries));
  if (url.includes('/rest/v1/people')) {
    const single = (route.request().headers()['accept'] || '').includes('object');
    if (method === 'PATCH') { const b = JSON.parse(route.request().postData() || '{}'); peopleWrites.push({ method, body: b }); const id = new URL(url).searchParams.get('id')?.replace('eq.', ''); const p = people.find(x => x.id === id); Object.assign(p, b); return route.fulfill(json(single ? p : [p])); }
    if (method === 'POST') { const b = JSON.parse(route.request().postData() || '{}'); peopleWrites.push({ method, body: b }); const np = basePerson('p-new-' + (people.length + 1), b.name); np.ministry_interest = null; people.push(np); return route.fulfill(json(single ? np : [np])); }
    const q = new URL(url).searchParams; const id = q.get('id'); const like = q.get('name_sort');
    if (id) { const one = people.find(x => x.id === id.replace('eq.', '')) ?? null; return route.fulfill(json(single ? one : (one ? [one] : []))); }
    if (like) { const term = like.replace('ilike.', '').replace(/[%*]/g, ''); return route.fulfill(json(people.filter(p => p.name_sort.includes(term)))); }
    return route.fulfill(json(people));
  }
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const row = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? row : [row])); }
  if (url.includes('/rest/v1/church_units') || url.includes('/rest/v1/tags') || url.includes('/rest/v1/groups') || url.includes('/rest/v1/pipeline_stages') || url.includes('/rest/v1/family') || url.includes('/rest/v1/person_')) return route.fulfill(json([]));
  return route.fulfill(json([]));
});

const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch') && !m.text().includes('403') && !m.text().includes('400')) errs.push(m.text()); });
async function loginAs(id, role, path = '/pessoas') {
  current = { id, role };
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession(id, role) }); break; } catch { await page.waitForTimeout(500); } }
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1200);
}
async function openEdit(name) {
  const row = page.locator('table tbody tr', { hasText: name }).first(); await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.locator('button[title="Editar"]').first().click(); await page.waitForTimeout(700);
  await page.locator('button:has-text("Eclesiástico")').first().click(); await page.waitForTimeout(900);
}
const chip = (key) => page.locator(`[data-testid="ministry-chip-${M[key]}"]`);
const chipState = async (key) => (await chip(key).count()) ? await chip(key).getAttribute('data-state') : 'absent';
const states = async () => ({ louvor: await chipState('louvor'), mulheres: await chipState('mulheres'), intercessao: await chipState('intercessao'), kids: await chipState('kids') });
const save = async () => { await page.locator('button[type="submit"]:visible').last().click(); await page.waitForTimeout(1200); };
const lastSync = () => [...rpcCalls].reverse().find(c => c.name === 'sync_person_ministries');

// ── ADMIN: edição ──────────────────────────────────────────────
await loginAs('u-admin', 'admin');
await openEdit('Fernanda Silva');
let st = await states();
ck('admin: chips refletem ministry_members (Louvor ✓, Kids ✓ selecionados; Mulheres/Intercessão off; nenhum bloqueado)', st.louvor === 'selected' && st.kids === 'selected' && st.mulheres === 'off' && st.intercessao === 'off', JSON.stringify(st));
ck('admin: campo NÃO usa people.ministry_interest ("Legado" não aparece marcado)', (await page.locator('[data-testid="ministry-chips"] button:has-text("Legado")').count()) === 0);
await page.screenshot({ path: 'pessoa-ministerios-admin-antes.png' });
await chip('louvor').click(); await chip('intercessao').click(); await page.waitForTimeout(200);
rpcCalls.length = 0; peopleWrites.length = 0;
await save();
const s1 = lastSync();
ck('admin: Salvar → sync_person_ministries([Kids, Intercessão]) (Louvor removido da seleção)', !!s1 && s1.body.p_person_id === 'p1' && [...s1.body.p_ministry_ids].sort().join() === [M.intercessao, M.kids].sort().join(), JSON.stringify(s1?.body));
ck('resultado: MANTER Kids, ADICIONAR Intercessão, REMOVER Louvor', linksOf('p1').sort().join() === [M.intercessao, M.kids].sort().join(), linksOf('p1').join());
ck('PATCH people não envia ministry_interest', peopleWrites.length === 1 && peopleWrites[0].method === 'PATCH' && !('ministry_interest' in peopleWrites[0].body), Object.keys(peopleWrites[0]?.body ?? {}).join(','));
ck('modal fechou após salvar com sucesso', (await page.locator('[data-testid="ministry-chips"]').count()) === 0);
// reabrir: chips refletem o novo estado
await openEdit('Fernanda Silva'); st = await states();
ck('reabrir: Kids ✓ e Intercessão ✓; Louvor off', st.kids === 'selected' && st.intercessao === 'selected' && st.louvor === 'off', JSON.stringify(st));
// sem alteração nos ministérios → salvar NÃO chama sync
rpcCalls.length = 0; await save();
ck('salvar sem mudar ministérios → sync NÃO chamado', !lastSync());
// bidirecional: Ministérios → Intercessão → Pessoas lista Fernanda
await loginAs('u-admin', 'admin', '/ministerios');
const card = (name) => page.locator('h3:has-text("' + name + '")').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
await card('Intercessão').locator('[data-testid="btn-pessoas"]').click(); await page.waitForTimeout(700);
ck('bidirecional: Ministérios → Intercessão → Pessoas lista Fernanda Silva', (await page.locator('[data-testid="pessoa-item"]:has-text("Fernanda Silva")').count()) === 1);
await page.screenshot({ path: 'pessoa-ministerios-bidirecional.png' });
await page.locator('button:has-text("Fechar")').click({ force: true }); await page.waitForTimeout(300);
// bidirecional inverso: incluir em Louvor pela tela de Ministérios → chip Louvor selecionado no Editar
await card('Louvor').locator('[data-testid="btn-pessoas"]').click(); await page.waitForTimeout(600);
await page.locator('[data-testid="pessoas-ministerio"] input').first().fill('fernanda'); await page.waitForTimeout(900);
await page.locator('button:has-text("Fernanda Silva")').first().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="btn-incluir"]').click(); await page.waitForTimeout(800);
await page.locator('button:has-text("Fechar")').click({ force: true }); await page.waitForTimeout(300);
await loginAs('u-admin', 'admin'); await openEdit('Fernanda Silva'); st = await states();
ck('bidirecional inverso: incluída em Louvor por Ministérios → chip Louvor ✓ no Editar Pessoa', st.louvor === 'selected' && st.kids === 'selected' && st.intercessao === 'selected', JSON.stringify(st));
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

// ── LÍDER (gere só Louvor) ─────────────────────────────────────
await loginAs('u-leader', 'cell_leader');   // conta vinculada ao Louvor; papel com acesso a /pessoas
await openEdit('Fernanda Silva'); st = await states();
ck('líder: Louvor editável (selected); Kids e Intercessão bloqueados 🔒; Mulheres oculto (não gere e não vinculado)', st.louvor === 'selected' && st.kids === 'locked' && st.intercessao === 'locked' && st.mulheres === 'absent', JSON.stringify(st));
ck('líder: chips bloqueados estão disabled', (await chip('kids').isDisabled()) && (await chip('intercessao').isDisabled()));
await page.screenshot({ path: 'pessoa-ministerios-lider-bloqueado.png' });
await chip('louvor').click(); rpcCalls.length = 0; await save();
const s2 = lastSync();
ck('líder: desmarcar Louvor → sync([]) só com seleção gerível; Kids/Intercessão permanecem (imutáveis)', !!s2 && s2.body.p_ministry_ids.length === 0 && linksOf('p1').sort().join() === [M.intercessao, M.kids].sort().join(), JSON.stringify(s2?.body) + ' → ' + linksOf('p1').join());

// ── USUÁRIO COMUM ──────────────────────────────────────────────
await loginAs('u-common', 'secretary');
await openEdit('Fernanda Silva'); st = await states();
ck('comum: todos os vínculos visíveis e bloqueados; nada editável; aviso exibido', st.kids === 'locked' && st.intercessao === 'locked' && st.louvor === 'absent' && (await page.locator('[data-testid="ministry-readonly-hint"]').count()) === 1, JSON.stringify(st));
await page.locator('button:has-text("Pessoal")').first().click(); await page.waitForTimeout(300);
await page.locator('input[placeholder*="Telefone"], input[name="phone"]').first().fill('5521988887777').catch(() => {});
rpcCalls.length = 0; await save();
ck('comum: salvar outros campos → sync_person_ministries NÃO é chamado; vínculos intactos', !lastSync() && linksOf('p1').sort().join() === [M.intercessao, M.kids].sort().join());

// ── CRIAÇÃO (admin) ────────────────────────────────────────────
await loginAs('u-admin', 'admin');
await page.locator('button:has-text("+ Nova Pessoa"):visible').first().click(); await page.waitForTimeout(700);
await page.locator('input[placeholder*="Nome"], input[name="name"]').first().fill('Nova Pessoa Teste');
await page.locator('button:has-text("Eclesiástico")').first().click(); await page.waitForTimeout(500);
await chip('louvor').click(); await chip('mulheres').click();
rpcCalls.length = 0; peopleWrites.length = 0; await save();
const s3 = lastSync();
ck('criação: POST people (sem ministry_interest) e depois sync com o id REAL retornado', peopleWrites[0]?.method === 'POST' && !('ministry_interest' in peopleWrites[0].body) && String(s3?.body.p_person_id).startsWith('p-new') && [...s3.body.p_ministry_ids].sort().join() === [M.louvor, M.mulheres].sort().join(), JSON.stringify(s3?.body));
ck('criação: pessoa nova vinculada a Louvor e Mulheres', linksOf(s3?.body.p_person_id).sort().join() === [M.louvor, M.mulheres].sort().join(), linksOf(s3?.body.p_person_id).join());
// criação com falha no sync → erro visível, modal não fecha
await loginAs('u-admin', 'admin');
await page.locator('button:has-text("+ Nova Pessoa"):visible').first().click(); await page.waitForTimeout(700);
await page.locator('input[placeholder*="Nome"], input[name="name"]').first().fill('Pessoa Falha Sync');
await page.locator('button:has-text("Eclesiástico")').first().click(); await page.waitForTimeout(500);
await chip('kids').click(); failNextSync = true; await save();
ck('criação com falha no sync: erro exibido e modal permanece aberto (não afirma vínculo)', (await page.locator('[data-testid="ministry-sync-error"]').count()) === 1 && /não foram vinculados/.test(await page.locator('[data-testid="ministry-sync-error"]').textContent()), await page.locator('[data-testid="ministry-sync-error"]').textContent().catch(() => ''));
await page.screenshot({ path: 'pessoa-ministerios-falha-sync.png' });

ck('volunteers: nenhum acesso em todo o fluxo', volunteersTouched.length === 0);
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
