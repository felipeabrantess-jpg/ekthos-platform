/**
 * test-telefone-unico.mjs — regra "1 pessoa = 1 telefone por igreja" no PersonModal,
 * com Supabase MOCKADO (Playwright). Zero requisições ao banco. Prova a fiação do frontend:
 *   - Novo cadastro com telefone de outra pessoa → bloqueia ANTES de gravar, mensagem amigável,
 *     botão "Localizar cadastro existente"; nenhum POST/PATCH em people;
 *   - Erro 23505 vindo do banco (corrida) → mesma mensagem, nunca o erro SQL cru;
 *   - Edição trocando para telefone de outra pessoa → bloqueada, nenhum PATCH;
 *   - Edição sem mudar o telefone → salva normalmente (sem consulta de duplicidade);
 *   - Telefone novo → cria normalmente.
 * Requer o dev server em http://localhost:5173.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const MSG = 'Este telefone já está vinculado a uma pessoa cadastrada.';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (id, role) => {
  const meta = { church_id: CH, role, provider: 'email' };
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x';
  return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } };
};
// mesma forma canônica do banco (normalize_phone_br)
const key = (raw) => { const d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, ''); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };

const basePerson = (id, name, phone) => ({ id, church_id: CH, name, phone, email: null, person_stage: 'frequentador', birth_date: null, birth_month: null, birth_day: null, conversion_date: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z', deleted_at: null, left_at: null, unit_id: null, source: 'manual', optout: false, person_pipeline: [], person_tags: [], acolhimento_journey: [], ministry_interest: null, name_sort: name.toLowerCase() });
const people = [basePerson('p-marcelo', 'Marcelo Souza', '+5521999990000'), basePerson('p-ana', 'Ana Lima', '+5521988887777')];
const rpcCalls = []; const peopleWrites = [];
let dbRaceOnNextInsert = false;   // simula a barreira do banco quando a pré-verificação não pegou
let hideOwnerOnce = false;

const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession('u-admin', 'admin')));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession('u-admin', 'admin').user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: 'admin' }));
  if (url.includes('/functions/v1/')) return route.fulfill(json({ ok: true }));
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    rpcCalls.push({ name, body });
    switch (name) {
      case 'get_my_tenant_context': return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }));
      case 'upsert_session_token': return route.fulfill(json('tok'));
      case 'get_people_page': return route.fulfill(json(people.map(r => ({ row_data: r, total_count: people.length }))));
      case 'get_people_stage_counts': return route.fulfill(json({ total: people.length, aniversarios: 0, sem_etapa: people.length, stages: [] }));
      case 'get_care_status_counts': return route.fulfill(json({ nao_atendida: 0, em_atendimento: 0, atendida: 0, sem_contato_48h: 0 }));
      case 'find_person_by_phone': {
        if (hideOwnerOnce) { hideOwnerOnce = false; return route.fulfill(json([])); }
        const k = key(body.p_phone);
        return route.fulfill(json(people.filter(p => k && key(p.phone) === k && p.id !== body.p_exclude_id).map(p => ({ id: p.id, name: p.name }))));
      }
      default: return route.fulfill(json([]));
    }
  }
  if (url.includes('/rest/v1/people')) {
    const single = (route.request().headers()['accept'] || '').includes('object');
    if (method === 'PATCH' || method === 'POST') {
      const b = JSON.parse(route.request().postData() || '{}'); peopleWrites.push({ method, body: b });
      if (dbRaceOnNextInsert && method === 'POST') {
        dbRaceOnNextInsert = false;
        return route.fulfill(json({ code: '23505', details: null, hint: null, message: 'PHONE_ALREADY_LINKED: Este telefone já está vinculado a uma pessoa cadastrada.' }, 409));
      }
      if (method === 'PATCH') { const id = new URL(url).searchParams.get('id')?.replace('eq.', ''); const p = people.find(x => x.id === id); Object.assign(p, b); return route.fulfill(json(single ? p : [p])); }
      const np = basePerson('p-new-' + (people.length + 1), b.name, b.phone); people.push(np); return route.fulfill(json(single ? np : [np]));
    }
    const id = new URL(url).searchParams.get('id');
    if (id) { const one = people.find(x => x.id === id.replace('eq.', '')) ?? null; return route.fulfill(json(single ? one : (one ? [one] : []))); }
    return route.fulfill(json(people));
  }
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const row = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? row : [row])); }
  return route.fulfill(json([]));
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession('u-admin', 'admin') }); break; } catch { await page.waitForTimeout(500); } }
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1200);

const nameInput = () => page.locator('label:has-text("Nome completo")').locator('xpath=following::input[1]').first();
const phoneInput = () => page.locator('input[type="tel"]:visible').first();
const save = async () => { await page.locator('button[type="submit"]:visible').last().click(); await page.waitForTimeout(1300); };
const alertText = async () => (await page.locator('[role="alert"]').count()) ? (await page.locator('[role="alert"]').first().innerText()) : '';
const openNew = async () => { await page.locator('button:has-text("+ Nova Pessoa"):visible').first().click(); await page.waitForTimeout(700); };
const closeModal = async () => { await page.locator('button:has-text("Cancelar"):visible').first().click().catch(() => {}); await page.waitForTimeout(400); };
const lastFind = () => [...rpcCalls].reverse().find(c => c.name === 'find_person_by_phone');

// ── 1. Novo cadastro com telefone do Marcelo (outro formato) → bloqueado antes de gravar ──
await openNew();
await nameInput().fill('João Pereira'); await phoneInput().fill('(21) 99999-0000');
peopleWrites.length = 0; rpcCalls.length = 0;
await save();
let txt = await alertText();
ck('novo cadastro com telefone existente → mensagem amigável', txt.includes(MSG), txt.replace(/\n/g, ' | '));
ck('mostra o cadastro existente e a ação "Localizar cadastro existente"', txt.includes('Marcelo Souza') && (await page.locator('button:has-text("Localizar cadastro existente")').count()) === 1);
ck('NENHUMA gravação em people (João não criado, Marcelo não alterado)', peopleWrites.length === 0 && people.length === 2 && people[0].name === 'Marcelo Souza' && people[0].phone === '+5521999990000', JSON.stringify(peopleWrites));
ck('pré-verificação usa find_person_by_phone com o telefone informado', !!lastFind() && key(lastFind().body.p_phone) === '21999990000' && lastFind().body.p_exclude_id === null, JSON.stringify(lastFind()?.body));
ck('não exibe erro SQL cru', !/duplicate key|23505|violates|PHONE_ALREADY_LINKED|people_church/i.test(txt));
await page.screenshot({ path: 'telefone-unico-novo-bloqueado.png' });

// ── 2. "Localizar cadastro existente" abre o cadastro do dono do telefone ──
await page.locator('button:has-text("Localizar cadastro existente")').click(); await page.waitForTimeout(900);
ck('"Localizar cadastro existente" navega para o cadastro do Marcelo', page.url().includes('/pessoas/p-marcelo/atendimento'), page.url());
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1000);

// ── 3. Corrida: pré-verificação não acha, o BANCO bloqueia (23505) → mesma mensagem ──
await openNew();
await nameInput().fill('João Pereira'); await phoneInput().fill('21 99999 0000');
hideOwnerOnce = true; dbRaceOnNextInsert = true; peopleWrites.length = 0;
await save();
txt = await alertText();
ck('erro 23505 do banco → mensagem amigável (sem SQL cru)', txt.includes(MSG) && !/duplicate key|23505|violates|PHONE_ALREADY_LINKED/i.test(txt), txt.replace(/\n/g, ' | '));
ck('o banco recusou: nenhuma pessoa nova na lista', people.length === 2);
ck('modal continua aberto para o usuário corrigir', (await phoneInput().count()) === 1);
await closeModal();

// ── 4. Telefone novo → cria normalmente ──
await openNew();
await nameInput().fill('Carla Nova'); await phoneInput().fill('(21) 97777-1111');
peopleWrites.length = 0;
await save();
ck('telefone novo → pessoa criada (POST) e modal fechado', peopleWrites.length === 1 && peopleWrites[0].method === 'POST' && people.length === 3 && (await page.locator('[role="alert"]').count()) === 0, JSON.stringify(peopleWrites[0]?.body?.phone));

// ── 5. Edição: trocar o telefone da Ana para o do Marcelo → bloqueado ──
const openEdit = async (name) => { const row = page.locator('table tbody tr', { hasText: name }).first(); await row.waitFor({ state: 'visible', timeout: 15000 }); await row.locator('button[title="Editar"]').first().click(); await page.waitForTimeout(800); };
await openEdit('Ana Lima');
await phoneInput().fill('+55 21 99999-0000');
peopleWrites.length = 0; rpcCalls.length = 0;
await save();
txt = await alertText();
ck('edição para telefone de outra pessoa → bloqueada com mensagem amigável', txt.includes(MSG) && txt.includes('Marcelo Souza'), txt.replace(/\n/g, ' | '));
ck('edição bloqueada: nenhum PATCH; Ana e Marcelo intactos', peopleWrites.length === 0 && people[1].phone === '+5521988887777' && people[0].phone === '+5521999990000');
ck('edição: a própria pessoa é excluída da busca (p_exclude_id)', lastFind()?.body.p_exclude_id === 'p-ana', JSON.stringify(lastFind()?.body));
await page.screenshot({ path: 'telefone-unico-edicao-bloqueada.png' });
await closeModal();

// ── 6. Edição sem mexer no telefone → salva normalmente, sem consulta de duplicidade ──
await openEdit('Ana Lima');
await nameInput().fill('Ana Lima Santos');
peopleWrites.length = 0; rpcCalls.length = 0;
await save();
ck('edição sem mudar telefone → salva (PATCH) e não consulta duplicidade', peopleWrites.length === 1 && peopleWrites[0].method === 'PATCH' && !lastFind() && people[1].name === 'Ana Lima Santos', JSON.stringify({ writes: peopleWrites.length, find: !!lastFind() }));

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
