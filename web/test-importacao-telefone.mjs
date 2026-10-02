/**
 * test-importacao-telefone.mjs — Importação de planilha × regra "1 pessoa = 1 telefone por igreja",
 * com Supabase MOCKADO (Playwright). Zero requisições ao banco.
 *   BASE_URL=https://app.ekthoschurch.com node test-importacao-telefone.mjs   (frontend publicado)
 *   node test-importacao-telefone.mjs                                         (dev server local)
 * Planilha com 4 linhas:
 *   - telefone de pessoa ATIVA gravada em outro formato  → reconhecida como duplicada, não importada;
 *   - telefone de pessoa DESLIGADA em outro formato      → reativada (comportamento homologado), não duplicada;
 *   - telefone novo                                      → importada;
 *   - mesmo telefone novo repetido na planilha            → ignorada.
 */
import { chromium } from 'playwright';
import * as XLSX from 'xlsx';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (id, role) => {
  const meta = { church_id: CH, role, provider: 'email' };
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x';
  return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } };
};
const key = (raw) => { const d = String(raw ?? '').replace(/\D/g, '').replace(/^0+/, ''); return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d; };

// "banco": uma ativa e uma desligada, ambas gravadas em formato diferente do que a planilha traz
const db = [
  { id: 'p-ativa', church_id: CH, name: 'Marcelo Souza', phone: '5521999990000', left_at: null, deleted_at: null },
  { id: 'p-desligada', church_id: CH, name: 'Ana Lima', phone: '21988887777', left_at: '2026-05-01T00:00:00Z', deleted_at: null },
];
const dupQueries = []; const patches = []; const inserts = [];
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method(); const u = new URL(url);
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession('u-admin', 'admin')));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession('u-admin', 'admin').user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: 'admin' }));
  if (url.includes('/functions/v1/')) return route.fulfill(json({ ok: true }));
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0];
    if (name === 'get_my_tenant_context') return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }));
    if (name === 'upsert_session_token') return route.fulfill(json('tok'));
    if (name === 'get_people_stage_counts') return route.fulfill(json({ total: 0, aniversarios: 0, sem_etapa: 0, stages: [] }));
    if (name === 'get_care_status_counts') return route.fulfill(json({ nao_atendida: 0, em_atendimento: 0, atendida: 0, sem_contato_48h: 0 }));
    return route.fulfill(json([]));
  }
  if (url.includes('/rest/v1/people')) {
    const single = (route.request().headers()['accept'] || '').includes('object');
    if (method === 'GET' && (u.searchParams.get('phone_normalized') || u.searchParams.get('phone'))) {
      const byNorm = u.searchParams.get('phone_normalized');
      const list = (byNorm ?? u.searchParams.get('phone')).replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(s => s.replace(/^"|"$/g, ''));
      dupQueries.push({ col: byNorm ? 'phone_normalized' : 'phone', list });
      const hit = db.filter(p => !p.deleted_at && (byNorm ? list.includes(key(p.phone)) : list.includes(p.phone)));
      return route.fulfill(json(hit.map(p => ({ id: p.id, phone: p.phone, phone_normalized: key(p.phone), left_at: p.left_at }))));
    }
    if (method === 'PATCH') { const b = JSON.parse(route.request().postData() || '{}'); const ids = (u.searchParams.get('id') || '').replace(/^in\.\(/, '').replace(/\)$/, '').split(',').map(s => s.replace(/^"|"$/g, '')); patches.push({ ids, body: b }); db.filter(p => ids.includes(p.id)).forEach(p => Object.assign(p, b)); return route.fulfill(json([])); }
    if (method === 'POST') {
      const b = JSON.parse(route.request().postData() || '[]'); const rows = Array.isArray(b) ? b : [b]; inserts.push(rows);
      // última barreira do banco: telefone já vinculado (em qualquer formato) → 23505
      if (rows.some(r => r.phone && db.some(p => !p.deleted_at && key(p.phone) === key(r.phone)))) return route.fulfill(json({ code: '23505', message: 'PHONE_ALREADY_LINKED: Este telefone já está vinculado a uma pessoa cadastrada.' }, 409));
      const out = rows.map((r, i) => { const np = { id: 'p-new-' + (db.length + i), deleted_at: null, left_at: null, ...r }; db.push(np); return { id: np.id }; });
      return route.fulfill(json(single ? out[0] : out, 201));
    }
    return route.fulfill(json([]));
  }
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const row = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? row : [row])); }
  return route.fulfill(json([]));
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession('u-admin', 'admin') }); break; } catch { await page.waitForTimeout(500); } }
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(1500);

const ws = XLSX.utils.aoa_to_sheet([
  ['Nome', 'Telefone'],
  ['Marcelo Souza Repetido', '(21) 99999-0000'],
  ['Ana Lima', '(21) 98888-7777'],
  ['Carla Nova', '(21) 97777-1111'],
  ['Carla Nova Bis', '21 97777 1111'],
]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Membros');
const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

await page.locator('button:has-text("Importar"):visible').first().click(); await page.waitForTimeout(700);
await page.locator('input[type="file"]').first().setInputFiles({ name: 'membros.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer });
await page.getByText('Importação concluída').waitFor({ timeout: 20000 }).catch(() => {});
await page.waitForTimeout(800);
const body = await page.locator('body').innerText();
await page.screenshot({ path: 'importacao-telefone-resultado.png' });

const insertedRows = inserts.flat();
ck('importação concluída na tela', body.includes('Importação concluída'));
ck('duplicidade consultada pela forma canônica (phone_normalized)', dupQueries.length >= 1 && dupQueries[0].col === 'phone_normalized' && dupQueries[0].list.includes('21999990000'), JSON.stringify(dupQueries[0] ?? null));
ck('telefone de pessoa ativa em OUTRO formato → reconhecido, não importado', !insertedRows.some(r => key(r.phone) === '21999990000') && db.filter(p => key(p.phone) === '21999990000').length === 1 && db[0].name === 'Marcelo Souza');
ck('pessoa desligada (outro formato) → reativada como já era homologado, sem duplicar e sem mudar nome', patches.length === 1 && patches[0].ids.join() === 'p-desligada' && JSON.stringify(patches[0].body) === '{"left_at":null}' && db.filter(p => key(p.phone) === '21988887777').length === 1 && db[1].name === 'Ana Lima', JSON.stringify(patches));
ck('telefone novo → importado uma única vez (repetido na planilha é ignorado)', insertedRows.length === 1 && insertedRows[0].name === 'Carla Nova' && insertedRows[0].phone === '+5521977771111', JSON.stringify(insertedRows.map(r => [r.name, r.phone])));
ck('resumo na tela: 1 adicionada, 1 reativada, duplicadas ignoradas', /1 pessoas? adicionada/.test(body) && body.includes('1 reativadas') && /duplicadas e ignoradas/.test(body), (body.match(/\d+ pessoas? adicionadas?[^\n]*\n[^\n]*/) || [''])[0].replace(/\n/g, ' | '));
ck('nenhum erro SQL cru na tela', !/duplicate key|23505|PHONE_ALREADY_LINKED|violates/i.test(body));

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
