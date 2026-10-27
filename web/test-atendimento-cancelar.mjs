/**
 * test-atendimento-cancelar.mjs — ação "Cancelar atendimento" (reunião IGV 26/10), Supabase MOCKADO (Playwright).
 *   node test-atendimento-cancelar.mjs          (dev server :5173)
 * Cobre: botão visível só para perfis autorizados, janela com motivo obrigatório, "Outro motivo" exige observação,
 * chamada journey_cancel com motivo/observação, STATUS CANCELADO na tela, Reabrir com justificativa.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
let ROLE = 'admin';
const mkSession = () => { const meta = { church_id: CH, role: ROLE, provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: 'u1', role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'u1@t', app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };

// "banco": p1 em atendimento (1 contato), p2 encerrada (cancelado), p3 nunca atendida
const people = {
  p1: { name: 'Ana Em Atendimento', city: null, journey: { id: 'j1', closed_at: null, outcome: null, version: 1, stage_id: 's1' }, contacts: 1, events: [] },
  p2: { name: 'Bruno Cancelado', city: null, journey: { id: 'j2', closed_at: '2026-09-20T10:00:00Z', outcome: 'nao_quer_contato', version: 3, stage_id: 's1' }, contacts: 2, events: [] },
  p3: { name: 'Carla Nunca', city: null, journey: null, contacts: 0, events: [] },
};
const careState = (p) => !p.journey ? 'nao_atendida' : !p.journey.closed_at ? 'em_atendimento' : ['nao_quer_contato', 'mudou_de_igreja', 'outro_motivo'].includes(p.journey.outcome) ? 'cancelado' : 'atendida';
const counts = () => { const c = { nao_atendida: 0, em_atendimento: 0, atendida: 0, cancelado: 0 }; for (const p of Object.values(people)) c[careState(p)]++; return { ...c, total: Object.keys(people).length, sem_contato_48h: 0 }; };
const contactsOf = (p) => Array.from({ length: p.contacts }, (_, i) => ({ event_id: `ev${i + 1}`, ordinal: i + 1, event_at: `2026-09-1${i}T10:00:00Z`, contact_date: `2026-09-1${i}T10:00:00Z`, actor_id: 'u1', actor_name: 'João', channel: 'whatsapp', result: 'realizado', notes: `c${i + 1}`, journey_id: p.journey?.id, journey_closed_at: p.journey?.closed_at ?? null, journey_outcome: p.journey?.outcome ?? null }));
const row = (id) => ({ id, church_id: CH, name: people[id].name, phone: '+55219999' + id.slice(1).padStart(5, '0'), email: null, person_stage: 'visitante', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', deleted_at: null, left_at: null, unit_id: null, source: 'manual', optout: false, person_pipeline: [], person_tags: [], acolhimento_journey: [], name_sort: people[id].name.toLowerCase(), care_state: careState(people[id]) });
const calls = [];
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method(); const u = new URL(url);
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession()));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession().user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: ROLE }));
  if (url.includes('/functions/v1/')) return route.fulfill(json({ ok: true }));
  const pid = (u.searchParams.get('person_id') || u.searchParams.get('id') || '').replace('eq.', '');
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ name, body });
    switch (name) {
      case 'get_my_tenant_context': return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: ROLE, is_ekthos_admin: false }));
      case 'upsert_session_token': return route.fulfill(json('tok'));
      case 'get_people_page': { const ids = Object.keys(people).filter(id => !body.p_care_status || careState(people[id]) === body.p_care_status); return route.fulfill(json(ids.map(id => ({ row_data: row(id), total_count: ids.length })))); }
      case 'get_people_stage_counts': return route.fulfill(json({ total: 3, aniversarios: 0, sem_etapa: 3, stages: [] }));
      case 'get_care_status_counts': return route.fulfill(json(counts()));
      case 'get_contact_counts': return route.fulfill(json(Object.entries(people).map(([id, p]) => ({ person_id: id, cnt: p.contacts }))));
      case 'get_person_contacts': return route.fulfill(json(contactsOf(people[body.p_person_id])));
      case 'get_person_timeline': return route.fulfill(json(people[body.p_person_id].events));
      case 'journey_suggest_stage': return route.fulfill(json({ stage_id: 's1', stage_name: 'Visitante', reason: 'mock' }));
      case 'journey_register_attendance': {
        const p = people[body.p_person_id];
        if (!p.journey && !body.p_new_stage_id) return route.fulfill(json({ code: 'P0001', message: 'JOURNEY_REQUIRED' }, 400));
        if (!p.journey) p.journey = { id: body.p_person_id + '-j', closed_at: null, outcome: null, version: 1, stage_id: body.p_new_stage_id };
        if (body.p_people_updates?.city) p.city = body.p_people_updates.city;
        if (body.p_register_contact !== false) p.contacts += 1;    // mesma regra da função nova
        return route.fulfill(json({ ok: true }));
      }
      case 'journey_cancel': {
        const p = people[body.p_person_id];
        if (!['nao_quer_contato', 'mudou_de_igreja', 'outro_motivo'].includes(body.p_reason)) return route.fulfill(json({ code: '22023', message: 'REASON_REQUIRED' }, 400));
        if (body.p_reason === 'outro_motivo' && !String(body.p_notes || '').trim()) return route.fulfill(json({ code: '22023', message: 'NOTES_REQUIRED' }, 400));
        if (!p.journey) p.journey = { id: body.p_person_id + '-j', closed_at: null, outcome: null, version: 1, stage_id: 's1' };
        p.journey = { ...p.journey, closed_at: new Date().toISOString(), outcome: body.p_reason, version: p.journey.version + 1 };
        p.events.push({ event_at: new Date().toISOString(), source: 'journey_event', actor_type: 'human', actor_name: 'João', event_kind: 'journey_cancelled', summary: 'Atendimento cancelado', raw_payload: { reason: body.p_reason, notes: body.p_notes } });
        return route.fulfill(json({ journey_id: p.journey.id, care_state: 'cancelado', acolhimento_cancelado: body.p_reason === 'nao_quer_contato' ? 1 : 0, fila_cancelada: 0 }));
      }
      case 'journey_reopen': {
        const p = Object.values(people).find(x => x.journey?.id === body.p_journey_id);
        if (!String(body.p_reason || '').trim()) return route.fulfill(json({ code: '22023', message: 'REASON_REQUIRED' }, 400));
        if (!p.journey.closed_at) return route.fulfill(json({ code: 'P0001', message: 'JOURNEY_NOT_CLOSED' }, 400));
        p.events.push({ event_at: new Date().toISOString(), source: 'journey_event', actor_type: 'human', actor_name: 'João', event_kind: 'journey_reopened', summary: `Atendimento reaberto — Motivo: ${body.p_reason}`, raw_payload: { reason: body.p_reason, previous_outcome: p.journey.outcome } });
        p.journey = { ...p.journey, closed_at: null, outcome: null, version: p.journey.version + 1 };
        return route.fulfill(json({ journey_id: p.journey.id, version: p.journey.version, care_state: 'em_atendimento' }));
      }
      default: return route.fulfill(json([]));
    }
  }
  if (url.includes('/rest/v1/people')) { const p = people[pid]; const single = (route.request().headers()['accept'] || '').includes('object'); const r = p ? { ...row(pid), city: p.city, neighborhood: null, birth_date: null, como_conheceu: null, marital_status: null, first_visit_date: null, conversion_date: null, celula_id: null, responsible_id: null, observacoes_pastorais: null, avatar_url: null, first_name: null, last_name: null } : null; return route.fulfill(json(single ? r : (r ? [r] : []), r ? 200 : 406)); }
  if (url.includes('/rest/v1/person_journey')) {
    const p = people[pid]; const j = p?.journey ?? null; const single = (route.request().headers()['accept'] || '').includes('object');
    const openOnly = u.searchParams.get('closed_at') === 'is.null';
    const r = j && !(openOnly && j.closed_at) ? { id: j.id, stage_id: j.stage_id, owner_id: 'u1', version: j.version, next_step: null, next_step_due_at: null, opened_at: '2026-09-01', ministry_id: null, outcome: j.outcome, closed_at: j.closed_at, notes: null } : null;
    return route.fulfill(json(single ? r : (r ? [r] : [])));
  }
  if (url.includes('/rest/v1/pipeline_stages')) return route.fulfill(json([{ id: 's1', church_id: CH, name: 'Visitante', slug: 'visitante', stage_key: 'visitante', order_index: 1, is_active: true }]));
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const r = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? r : [r])); }
  return route.fulfill(json([]));
});
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession() }); break; } catch { await page.waitForTimeout(500); } }
const open = async (id) => { await page.goto(`${BASE}/pessoas/${id}/atendimento`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(900); };
const txt = async (sel) => (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ').trim();
const saveBtn = () => page.locator('button:has-text("Salvar atendimento"):visible').first();
const lastReg = () => [...calls].reverse().find(c => c.name === 'journey_register_attendance');
const cityInput = () => page.locator('input[placeholder*="Cidade"], label:has-text("Cidade") input').first();


const cancelCalls = () => calls.filter(c => c.name === 'journey_cancel');
const btnCancel = () => page.locator('[data-testid="btn-cancelar-atendimento"]');
const confirmar = () => page.locator('[data-testid="btn-confirmar-cancelamento"]');

// 1. pessoa sem atendimento (Não atendida): botão visível, janela abre, motivo obrigatório
await open('p3');
ck('"Cancelar atendimento" visível em pessoa Não atendida (admin)', await btnCancel().isVisible());
await btnCancel().click(); await page.waitForTimeout(300);
const opcoes = await page.locator('[data-testid^="cancelar-motivo-"]').evaluateAll(es => es.map(e => e.value));
ck('janela de confirmação com os 3 motivos', (await page.locator('[data-testid="janela-cancelar"]').isVisible()) && JSON.stringify(opcoes) === JSON.stringify(['nao_quer_contato', 'mudou_de_igreja', 'outro_motivo']), JSON.stringify(opcoes));
ck('sem motivo escolhido: "Confirmar cancelamento" desabilitado', await confirmar().isDisabled());
await page.locator('[data-testid="cancelar-motivo-outro_motivo"]').check(); await page.waitForTimeout(150);
ck('"Outro motivo" sem observação: continua desabilitado', await confirmar().isDisabled());
await page.locator('[data-testid="cancelar-observacao"]').fill('Faleceu'); await page.waitForTimeout(150);
ck('"Outro motivo" com observação: habilita', !(await confirmar().isDisabled()));
await page.locator('button:has-text("Voltar")').click(); await page.waitForTimeout(200);
ck('"Voltar" fecha sem chamar o banco', (await page.locator('[data-testid="janela-cancelar"]').count()) === 0 && cancelCalls().length === 0);

// 2. cancelar com "Não quer contato" + observação
await btnCancel().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="cancelar-motivo-nao_quer_contato"]').check();
await page.locator('[data-testid="cancelar-observacao"]').fill('Pediu para não receber mensagens');
await confirmar().click(); await page.waitForTimeout(1500);
const c1 = cancelCalls()[0];
ck('chama journey_cancel com pessoa, motivo e observação', c1?.body.p_person_id === 'p3' && c1?.body.p_reason === 'nao_quer_contato' && c1?.body.p_notes === 'Pediu para não receber mensagens', JSON.stringify(c1?.body));
ck('aviso: mensagens automáticas pendentes também canceladas', (await page.locator('text=mensagens automáticas de acolhimento pendentes também foram canceladas').count()) === 1);
ck('STATUS na tela: CANCELADO · Não quer contato', /STATUS: CANCELADO · Não quer contato/.test(await txt('[data-testid="status-jornada"]')), await txt('[data-testid="status-jornada"]'));
ck('cancelado: some o "Cancelar", aparece "Reabrir atendimento"', (await btnCancel().count()) === 0 && (await page.locator('[data-testid="btn-reabrir"]').isVisible()));

// 3. reabrir com justificativa
await page.locator('[data-testid="btn-reabrir"]').click(); await page.waitForTimeout(200);
ck('Reabrir exige justificativa', await page.locator('[data-testid="btn-confirmar-reabrir"]').isDisabled());
await page.locator('[data-testid="reabrir-motivo"]').fill('Cancelado por engano');
await page.locator('[data-testid="btn-confirmar-reabrir"]').click(); await page.waitForTimeout(1500);
const ro = [...calls].reverse().find(c => c.name === 'journey_reopen');
ck('reabre com o motivo informado e volta a mostrar "Cancelar atendimento"', ro?.body.p_reason === 'Cancelado por engano' && (await btnCancel().isVisible()), JSON.stringify(ro?.body));

// 4. "Mudou de igreja" em pessoa em atendimento (observação opcional)
await open('p1');
await btnCancel().click(); await page.waitForTimeout(200);
await page.locator('[data-testid="cancelar-motivo-mudou_de_igreja"]').check();
ck('"Mudou de igreja": observação opcional (habilita sem observação)', !(await confirmar().isDisabled()));
await confirmar().click(); await page.waitForTimeout(1500);
ck('STATUS: CANCELADO · Mudou de igreja', /STATUS: CANCELADO · Mudou de igreja/.test(await txt('[data-testid="status-jornada"]')), await txt('[data-testid="status-jornada"]'));

// 5. perfil sem permissão (voluntário): botão não aparece
ROLE = 'volunteer';
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession() });
await open('p3');
ck('perfil não autorizado (voluntário): "Cancelar atendimento" não aparece', (await btnCancel().count()) === 0);

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
