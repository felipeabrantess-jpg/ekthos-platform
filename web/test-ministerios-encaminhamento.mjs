/**
 * test-ministerios-encaminhamento.mjs — item 15 (ata IGV): quem pode encaminhar (política configurável),
 * recusa com motivo pelo ministério de destino e encaminhados visíveis em Ministério → Pessoas. Supabase MOCKADO.
 *   node test-ministerios-encaminhamento.mjs   (dev server local em :5173)
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
let queue, members, calls, current, policy = 'equipe_atendimento', events = [];
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
      case 'get_ministry_referral_policy': return route.fulfill(json({ policy, can_refer: policy === 'equipe_atendimento' || (policy === 'lideres_e_admins' && isAdmin()) || ministries.some(m => m.leader_user_id === current.id) }));
      case 'set_ministry_referral_policy': if (!isAdmin()) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403)); policy = body.p_policy; return route.fulfill(json(policy));
      case 'ministry_referral_decline': {
        const r = queue.find(x => x.journey_id === body.p_journey_id);
        if (!String(body.p_reason || '').trim()) return route.fulfill(json({ code: '22023', message: 'REASON_REQUIRED' }, 400));
        if (!r || !canManage(r.ministry_id)) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN: sem permissão neste ministério' }, 403));
        queue = queue.filter(x => x !== r); events.push({ journey_id: r.journey_id, reason: body.p_reason, by: current.id });
        return route.fulfill(json({ journey_id: r.journey_id }));
      }
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

const card = (name) => page.locator('[data-testid="btn-recusar-encaminhamento"]').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').filter({ hasText: name });
const recusar = (name) => card(name).locator('[data-testid="btn-recusar-encaminhamento"]');

// 1. LÍDER do ministério de destino recusa com motivo
reset(); await loginAs('u-lider', 'ministry_leader');
ck('líder vê "Recusar" nos encaminhamentos do seu ministério', (await page.locator('[data-testid="btn-recusar-encaminhamento"]').count()) === 2);
await recusar('Ana Encaminhada').click(); await page.waitForTimeout(400);
ck('janela de recusa abre sem navegar para o Atendimento', (await page.locator('[data-testid="janela-recusar"]').isVisible()) && page.url().includes('/ministerios'));
ck('sem motivo: "Recusar encaminhamento" desabilitado', await page.locator('[data-testid="btn-confirmar-recusa"]').isDisabled());
await page.locator('[data-testid="recusar-motivo"]').fill('   '); await page.waitForTimeout(100);
ck('só espaços: continua desabilitado', await page.locator('[data-testid="btn-confirmar-recusa"]').isDisabled());
await page.locator('[data-testid="recusar-motivo"]').fill('Perfil não compatível');
calls = [];
await page.locator('[data-testid="btn-confirmar-recusa"]').click(); await page.waitForTimeout(1000);
const d1 = calls.find(c => c.name === 'ministry_referral_decline');
ck('chama ministry_referral_decline com o encaminhamento e o motivo', d1?.body.p_journey_id === 'j1' && d1?.body.p_reason === 'Perfil não compatível', JSON.stringify(d1?.body));
ck('recusado sai da fila na hora; o outro continua; janela fecha; continua em Ministérios', (await names()) === 'Bruno Encaminhado' && (await page.locator('[data-testid="janela-recusar"]').count()) === 0 && page.url().includes('/ministerios'), await names());
ck('recusar NÃO inclui a pessoa no ministério', members['m-louvor'].length === 0);
await page.screenshot({ path: 'ministerios-recusa.png' });

// 2. encaminhados aparecem em Ministério → Pessoas (para quem gere o ministério)
await page.locator('button', { hasText: /^Ministérios$/ }).first().click(); await page.waitForTimeout(800);
await page.locator('h3:has-text("Louvor")').locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]').locator('button:has-text("Pessoas")').first().click(); await page.waitForTimeout(1000);
const pend = page.locator('[data-testid="encaminhados-pendentes"]');
const pendTxt = (await pend.count()) ? await pend.innerText() : 'ausente';
ck('Pessoas do ministério mostra "1 encaminhado aguardando inclusão" (Bruno)', /1 encaminhado aguardando inclusão/i.test(pendTxt) && pendTxt.includes('Bruno Encaminhado'), pendTxt.slice(0, 80));
await page.screenshot({ path: 'ministerios-pessoas-pendentes.png' });
await pend.locator('[data-testid="btn-incluir-no-ministerio"]').click(); await page.waitForTimeout(1000);
ck('incluir pela janela de Pessoas: entra no ministério e some dos pendentes', members['m-louvor'].join() === 'p2' && (await page.locator('[data-testid="encaminhados-pendentes"]').count()) === 0, members['m-louvor'].join());
await page.keyboard.press('Escape'); await page.waitForTimeout(300);

// 3. líder não vê nem configura a política
ck('líder não vê "Quem pode encaminhar"', (await page.locator('[data-testid="btn-quem-encaminha"]').count()) === 0);

// 4. ADMIN configura a política
reset(); await loginAs('u-admin', 'admin');
await page.locator('[data-testid="btn-quem-encaminha"]').click(); await page.waitForTimeout(400);
ck('admin abre "Quem pode encaminhar" com a regra atual marcada (toda a equipe)', await page.locator('[data-testid="politica-equipe_atendimento"]').isChecked());
await page.locator('[data-testid="politica-lideres_e_admins"]').check();
calls = [];
await page.locator('[data-testid="btn-salvar-politica"]').click(); await page.waitForTimeout(900);
ck('salva pela RPC set_ministry_referral_policy', calls.some(c => c.name === 'set_ministry_referral_policy' && c.body.p_policy === 'lideres_e_admins') && policy === 'lideres_e_admins');
await page.locator('[data-testid="btn-quem-encaminha"]').click(); await page.waitForTimeout(400);
ck('reabrindo, mostra a regra salva', await page.locator('[data-testid="politica-lideres_e_admins"]').isChecked());
await page.screenshot({ path: 'ministerios-quem-encaminha.png' });
await page.locator('[data-testid="janela-quem-encaminha"] button:has-text("Cancelar")').click(); await page.waitForTimeout(300);

// 5. servidor recusa → mensagem amigável; admin recusa em qualquer ministério
await recusar('Carla Kids').click(); await page.waitForTimeout(300);
await page.locator('[data-testid="recusar-motivo"]').fill('Ministério sem vaga');
current = { id: 'u-outro', role: 'ministry_leader' };
await page.locator('[data-testid="btn-confirmar-recusa"]').click(); await page.waitForTimeout(900);
const al = await page.locator('[data-testid="janela-recusar"] [role="alert"]').innerText().catch(() => '');
ck('sem autoridade no servidor → mensagem amigável, nada muda', al.includes('não tem permissão') && queue.length === 3 && !/42501/.test(al), al);
current = { id: 'u-admin', role: 'admin' };
await page.locator('[data-testid="btn-confirmar-recusa"]').click(); await page.waitForTimeout(900);
ck('admin recusa encaminhamento de ministério sem conta de líder (Kids)', events.some(e => e.journey_id === 'j3' && e.by === 'u-admin') && !(await names()).includes('Carla'), await names());

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
