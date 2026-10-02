/**
 * test-atendimento-estado.mjs — itens 10 + 13 + reabertura, com Supabase MOCKADO (Playwright).
 *   node test-atendimento-estado.mjs                                  (dev server :5173)
 *   BASE_URL=https://app.ekthoschurch.com node test-atendimento-estado.mjs
 * Cobre: escolha explícita "Houve contato?", salvar sem contato (zero pastoral_contact),
 * registrar contato (1), reabertura com motivo (histórico preservado), estado único na lista.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = () => { const meta = { church_id: CH, role: 'admin', provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: 'u1', role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'u1@t', app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };

// "banco": p1 em atendimento (1 contato), p2 encerrada (cancelado), p3 nunca atendida
const people = {
  p1: { name: 'Ana Em Atendimento', city: null, journey: { id: 'j1', closed_at: null, outcome: null, version: 1, stage_id: 's1' }, contacts: 1, events: [] },
  p2: { name: 'Bruno Cancelado', city: null, journey: { id: 'j2', closed_at: '2026-09-20T10:00:00Z', outcome: 'nao_quer_contato', version: 3, stage_id: 's1' }, contacts: 2, events: [] },
  p3: { name: 'Carla Nunca', city: null, journey: null, contacts: 0, events: [] },
};
const careState = (p) => !p.journey ? 'nao_atendida' : !p.journey.closed_at ? 'em_atendimento' : ['nao_quer_contato', 'mudou_de_igreja'].includes(p.journey.outcome) ? 'cancelado' : 'atendida';
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
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: 'admin' }));
  if (url.includes('/functions/v1/')) return route.fulfill(json({ ok: true }));
  const pid = (u.searchParams.get('person_id') || u.searchParams.get('id') || '').replace('eq.', '');
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ name, body });
    switch (name) {
      case 'get_my_tenant_context': return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }));
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

// ── ITEM 10 ──
await open('p1');
ck('intenção obrigatória: sem escolher "Houve contato?", Salvar fica desabilitado com aviso', await saveBtn().isDisabled() && (await page.locator('[data-testid="aviso-escolha-contato"]').count()) === 1 && (await page.locator('[data-testid="bloco-registrar-contato"]').count()) === 0);
await page.locator('[data-testid="houve-contato-nao"]').click(); await page.waitForTimeout(200);
ck('"Não": campos de canal/resultado/anotações do contato ficam ocultos', (await page.locator('[data-testid="bloco-registrar-contato"]').count()) === 0);
ck('"Não" sem nenhuma alteração: nada a salvar', await saveBtn().isDisabled());
await cityInput().fill('Niterói'); await page.waitForTimeout(200);
calls.length = 0;
await saveBtn().click(); await page.waitForTimeout(1200);
ck('salvar correção SEM contato → RPC com p_register_contact=false e cidade enviada', lastReg()?.body.p_register_contact === false && lastReg()?.body.p_people_updates?.city === 'Niterói', JSON.stringify(lastReg()?.body?.p_people_updates));
ck('… e zero contato novo (continua 1 contato; "Próximo: 2º contato")', people.p1.contacts === 1 && (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 2º contato', await txt('[data-testid="proximo-contato"]'));
ck('mensagem: "Alterações salvas (sem novo contato)"', (await page.locator('text=Alterações salvas (sem novo contato)').count()) === 1);
ck('após salvar, a intenção volta a vazia (não há regravação sem nova escolha)', await saveBtn().isDisabled() && (await page.locator('[data-testid="aviso-escolha-contato"]').count()) === 1);
await page.locator('[data-testid="houve-contato-sim"]').click(); await page.waitForTimeout(200);
ck('"Sim": aparece "Registrar 2º contato" com canal/resultado e Salvar habilita', /registrar 2º contato/i.test(await txt('[data-testid="titulo-registrar"]')) && !(await saveBtn().isDisabled()), (await txt('[data-testid="titulo-registrar"]')) + ' | disabled=' + (await saveBtn().isDisabled()));
await page.locator('textarea[placeholder*="Anotações"]').fill('conversa real'); calls.length = 0;
await saveBtn().click(); await page.waitForTimeout(1200);
ck('registrar contato real → RPC com p_register_contact=true; exatamente 1 contato novo (2 no total)', lastReg()?.body.p_register_contact === true && lastReg()?.body.p_contact_notes === 'conversa real' && people.p1.contacts === 2 && (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 3º contato');
ck('resultado que encerra só vale quando houve contato (aviso de encerramento oculto sem "Sim")', (await page.locator('text=encerrar a jornada').count()) === 0);
await page.screenshot({ path: 'atendimento-houve-contato.png', fullPage: true });

// ── REABERTURA ──
await open('p2');
ck('atendimento encerrado: status ENCERRADO e botão "Reabrir atendimento"', (await txt('[data-testid="status-jornada"]')).startsWith('STATUS: ENCERRADO') && (await page.locator('[data-testid="btn-reabrir"]').count()) === 1);
await open('p1');
ck('atendimento em andamento: botão "Reabrir" não aparece', (await page.locator('[data-testid="btn-reabrir"]').count()) === 0);
await open('p2');
await page.locator('[data-testid="btn-reabrir"]').click(); await page.waitForTimeout(200);
ck('reabrir pede confirmação e motivo; confirmar fica desabilitado sem motivo', (await page.locator('[data-testid="reabrir-motivo"]').count()) === 1 && await page.locator('[data-testid="btn-confirmar-reabrir"]').isDisabled());
await page.locator('[data-testid="reabrir-motivo"]').fill('   '); await page.waitForTimeout(100);
ck('motivo só com espaços não libera', await page.locator('[data-testid="btn-confirmar-reabrir"]').isDisabled());
await page.locator('[data-testid="reabrir-motivo"]').fill('Encerrado por engano'); calls.length = 0;
await page.locator('[data-testid="btn-confirmar-reabrir"]').click(); await page.waitForTimeout(1300);
const ro = calls.find(c => c.name === 'journey_reopen');
ck('confirmar → RPC journey_reopen(jornada, motivo)', ro?.body.p_journey_id === 'j2' && ro?.body.p_reason === 'Encerrado por engano', JSON.stringify(ro?.body));
ck('status volta a EM ATENDIMENTO na hora; botão Reabrir some', (await txt('[data-testid="status-jornada"]')) === 'STATUS: EM ATENDIMENTO' && (await page.locator('[data-testid="btn-reabrir"]').count()) === 0);
ck('contatos preservados (2) e numeração intacta', people.p2.contacts === 2 && (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 3º contato');
ck('histórico mostra "Atendimento reaberto" com motivo e responsável', (await page.locator('text=Atendimento reaberto').count()) >= 1 && (await page.locator('text=Motivo: Encerrado por engano').count()) >= 1);
ck('toast de sucesso', (await page.locator('text=Atendimento reaberto. A pessoa voltou').count()) === 1);
await page.screenshot({ path: 'atendimento-reaberto.png', fullPage: true });

// ── ITEM 13: lista ──
people.p2.journey = { ...people.p2.journey, closed_at: '2026-09-20T10:00:00Z', outcome: 'nao_quer_contato' };   // volta a encerrada para testar a etiqueta
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(1200);
const rowOf = (name) => page.locator('table tbody tr', { hasText: name }).first();
ck('etiqueta da lista vem de care_state: Em atendimento / Cancelado / sem etiqueta para Não atendida',
  /Em atendimento/.test(await rowOf('Ana Em Atendimento').innerText()) && /Cancelado/.test(await rowOf('Bruno Cancelado').innerText()) && !/Atendida|Em atendimento|Cancelad/.test(await rowOf('Carla Nunca').innerText()));
const chipTxt = await page.locator('button:has-text("Cancelado (")').first().innerText().catch(() => '');
ck('filtro "Cancelado (1)" existe e os contadores somam o total (1+1+0+1 = 3)', /Cancelado \(1\)/.test(chipTxt) && (await page.locator('button:has-text("Não atendida (1)")').count()) === 1 && (await page.locator('button:has-text("Em atendimento (1)")').count()) === 1, chipTxt);
calls.length = 0;
await page.locator('button:has-text("Cancelado (")').first().click(); await page.waitForTimeout(900);
const pg = [...calls].reverse().find(c => c.name === 'get_people_page');
ck('filtro Cancelado → get_people_page com p_care_status=cancelado e lista só com Bruno', pg?.body.p_care_status === 'cancelado' && (await page.locator('table tbody tr').count()) === 1 && /Bruno/.test(await page.locator('table tbody tr').first().innerText()));

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
