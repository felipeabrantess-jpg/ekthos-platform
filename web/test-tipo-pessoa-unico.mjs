/**
 * test-tipo-pessoa-unico.mjs — "Tipos de pessoa" com no máximo UM tipo + atualização imediata da tela,
 * com Supabase MOCKADO (Playwright). Zero requisições ao banco.
 *   node test-tipo-pessoa-unico.mjs                                   (dev server local)
 *   BASE_URL=https://app.ekthoschurch.com node test-tipo-pessoa-unico.mjs   (frontend publicado)
 * Cobre: itens 6 e 9 da ata IGV (troca de tipo, lista/modal atualizados sem F5, sem dois tipos),
 * etiquetas de outra categoria continuam múltiplas, e troca de etapa no painel de detalhe.
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = (id, role) => { const meta = { church_id: CH, role, provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: id, role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@t`, app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };

const TAGS = [
  { id: 't-vis', church_id: CH, name: 'Visitante', color: '#2563eb', sort_order: 1, icon: null, created_at: '2026-07-01', category: 'person_type' },
  { id: 't-mem', church_id: CH, name: 'Membro', color: '#16a34a', sort_order: 2, icon: null, created_at: '2026-07-01', category: 'person_type' },
  { id: 't-nc', church_id: CH, name: 'Novo Convertido', color: '#9333ea', sort_order: 3, icon: null, created_at: '2026-07-01', category: 'person_type' },
  { id: 't-rec', church_id: CH, name: 'Reconciliado', color: '#ea580c', sort_order: 4, icon: null, created_at: '2026-07-01', category: 'person_type' },
  { id: 't-ina', church_id: CH, name: 'Inativos', color: '#6b7280', sort_order: 5, icon: null, created_at: '2026-07-01', category: 'person_type' },
  { id: 'g-coral', church_id: CH, name: 'Coral', color: '#0891b2', sort_order: 20, icon: null, created_at: '2026-07-01', category: 'general' },
  { id: 'g-jovens', church_id: CH, name: 'Jovens', color: '#be185d', sort_order: 21, icon: null, created_at: '2026-07-01', category: 'general' },
];
const STAGES = [
  { id: 's-vis', church_id: CH, name: 'Visitante', slug: 'visitante', stage_key: 'visitante', order_index: 1, is_active: true, color: '#2563eb' },
  { id: 's-mem', church_id: CH, name: 'Membro', slug: 'membro', stage_key: 'membro', order_index: 5, is_active: true, color: '#16a34a' },
];
// estado REAL do "banco"
const db = {
  p1: { name: 'Ana Itaipu', unit: 'u-ita', tags: ['t-mem'], stage: 's-mem', left_at: null },
  p2: { name: 'Bruno Trindade', unit: 'u-tri', tags: ['t-vis'], stage: 's-vis', left_at: null },
  p3: { name: 'Carla Sem Unidade', unit: null, tags: ['t-nc'], stage: null, left_at: null },
  p4: { name: 'Davi Reconciliado', unit: 'u-ita', tags: ['t-rec'], stage: null, left_at: null },
  p5: { name: 'Eva Legado', unit: 'u-ita', tags: ['t-vis', 't-mem'], stage: 's-mem', left_at: null },   // registro legado com 2 tipos
};
const row = (id) => { const p = db[id]; const st = STAGES.find(s => s.id === p.stage); return { id, church_id: CH, name: p.name, phone: '+55219999' + id.slice(1).padStart(5, '0'), email: null, person_stage: 'visitante', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', deleted_at: null, left_at: p.left_at, unit_id: p.unit, source: 'manual', optout: false, acolhimento_journey: [], ministry_interest: null, name_sort: p.name.toLowerCase(),
  person_pipeline: st ? [{ id: 'pp-' + id, stage_id: st.id, pipeline_stages: st }] : [],
  person_tags: p.tags.map(t => ({ tag_id: t, tags: TAGS.find(x => x.id === t) })) }; };
const calls = []; let failNext = null;
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1360, height: 950 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method(); const u = new URL(url);
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession('u1', 'admin')));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession('u1', 'admin').user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: 'admin' }));
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const body = JSON.parse(route.request().postData() || '{}');
    calls.push({ name, body });
    if (name === 'get_my_tenant_context') return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }));
    if (name === 'upsert_session_token') return route.fulfill(json('tok'));
    if (name === 'get_people_page') return route.fulfill(json(Object.keys(db).map(id => ({ row_data: row(id), total_count: Object.keys(db).length }))));
    if (name === 'get_people_stage_counts') return route.fulfill(json({ total: 5, aniversarios: 0, sem_etapa: 2, stages: STAGES.map(s => ({ stage_id: s.id, stage_key: s.stage_key, name: s.name, order_index: s.order_index, cnt: Object.values(db).filter(p => p.stage === s.id).length })) }));
    if (name === 'get_care_status_counts') return route.fulfill(json({ nao_atendida: 5, em_atendimento: 0, atendida: 0, sem_contato_48h: 0 }));
    if (name === 'set_person_tags') {
      if (failNext) { const f = failNext; failNext = null; return route.fulfill(json(f, 400)); }
      const ids = body.p_tag_ids ?? [];
      // mesma regra do banco: no máximo um tipo
      if (ids.filter(i => TAGS.find(t => t.id === i)?.category === 'person_type').length > 1) return route.fulfill(json({ code: '23514', message: 'PERSON_TYPE_SINGLE: Uma pessoa só pode ter um tipo.' }, 400));
      db[body.p_person_id].tags = ids; return route.fulfill(json({ person_id: body.p_person_id, tag_ids: ids }));
    }
    return route.fulfill(json([]));
  }
  if (url.includes('/rest/v1/person_tags')) { calls.push({ name: method + ' person_tags (caminho antigo)' }); return route.fulfill(json([])); }
  if (url.includes('/rest/v1/person_pipeline')) {
    const pid = (u.searchParams.get('person_id') || '').replace('eq.', '');
    if (method === 'GET') { const p = db[pid]; const single = (route.request().headers()['accept'] || '').includes('object'); const r = p?.stage ? { id: 'pp-' + pid, stage_id: p.stage } : null; return route.fulfill(json(single ? r : (r ? [r] : []))); }
    const b = JSON.parse(route.request().postData() || '{}'); const target = pid || b.person_id; calls.push({ name: method + ' person_pipeline', body: b });
    db[target].stage = b.stage_id; return route.fulfill(json([{ id: 'pp-' + target }]));
  }
  if (url.includes('/rest/v1/pipeline_history')) return route.fulfill(json([], 201));
  if (url.includes('/rest/v1/pipeline_stages')) return route.fulfill(json(STAGES));
  if (url.includes('/rest/v1/tags')) return route.fulfill(json(TAGS));
  if (url.includes('/rest/v1/church_units')) return route.fulfill(json([{ id: 'u-ita', church_id: CH, name: 'Itaipu', is_active: true }, { id: 'u-tri', church_id: CH, name: 'Trindade', is_active: true }]));
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const r = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? r : [r])); }
  return route.fulfill(json([]));
});

const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession('u1', 'admin') }); break; } catch { await page.waitForTimeout(500); } }
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(1500);

const tr = (name) => page.locator('table tbody tr', { hasText: name }).first();
const pill = (name) => tr(name).locator('button[aria-label="Editar tipos desta pessoa"]');
const pillText = async (name) => (await pill(name).innerText()).replace(/\s+/g, ' ').trim();
const dlg = page.locator('[role="dialog"]');
const opt = (id) => dlg.locator(`[data-testid="tag-option-${id}"]`);
const checked = async () => (await dlg.locator('[data-testid^="tag-option-"][aria-checked="true"]').evaluateAll(els => els.map(e => e.getAttribute('data-testid').replace('tag-option-', '')))).sort().join(',');
const save = async () => { await dlg.locator('button:has-text("Salvar")').click(); };
const lastSet = () => [...calls].reverse().find(c => c.name === 'set_person_tags');
const pageCalls = () => calls.filter(c => c.name === 'get_people_page').length;
const tagNames = (id) => db[id].tags.map(t => TAGS.find(x => x.id === t).name).join('+');

// ── 1. Membro → Visitante (Itaipu) ──
await pill('Ana Itaipu').click(); await page.waitForTimeout(400);
ck('modal abre com o tipo atual marcado (Membro) e opções de tipo como seleção única', (await checked()) === 't-mem' && (await opt('t-mem').getAttribute('role')) === 'radio');
await opt('t-vis').click(); await page.waitForTimeout(150);
ck('8/9. clicar em Visitante SUBSTITUI Membro na seleção (nunca os dois)', (await checked()) === 't-vis', await checked());
calls.length = 0;
await save(); await page.waitForTimeout(350);
ck('1. Membro → Visitante: uma única gravação atômica com 1 tipo', lastSet()?.body.p_person_id === 'p1' && JSON.stringify(lastSet()?.body.p_tag_ids) === '["t-vis"]' && !calls.some(c => String(c.name).includes('caminho antigo')), JSON.stringify(lastSet()?.body));
ck('5. lista mostra o novo tipo IMEDIATAMENTE, sem F5', (await pillText('Ana Itaipu')) === 'Visitante', await pillText('Ana Itaipu'));
await page.waitForTimeout(1200);
ck('5. lista foi re-sincronizada com o servidor uma vez (sem fetch duplicado)', pageCalls() === 1, `${pageCalls()} chamada(s) get_people_page`);
ck('banco ficou com um único tipo', tagNames('p1') === 'Visitante', tagNames('p1'));
await page.screenshot({ path: 'tipo-pessoa-lista-atualizada.png' });

// ── 6/7. reabrir: mostra o novo valor; 2ª edição não ressuscita o anterior ──
await pill('Ana Itaipu').click(); await page.waitForTimeout(400);
ck('6. reabrir o modal mostra o NOVO tipo (Visitante)', (await checked()) === 't-vis', await checked());
ck('6. botão Salvar fica desabilitado sem mudança (nenhuma regravação acidental)', await dlg.locator('button:has-text("Salvar")').isDisabled());
await opt('t-mem').click(); await opt('t-vis').click(); await page.waitForTimeout(150);
// (ida e volta termina em "Visitante" = sem mudança → Salvar desabilitado; nada é regravado)
const semMudanca = await dlg.locator('button:has-text("Salvar")').isDisabled();
await dlg.locator('button:has-text("Cancelar")').click(); await page.waitForTimeout(300);
ck('7. segunda edição não ressuscita o tipo anterior', semMudanca && tagNames('p1') === 'Visitante' && (await pillText('Ana Itaipu')) === 'Visitante', tagNames('p1'));

// ── 2/3/4 + unidades ──
for (const [n, nome, id, alvo, esperado] of [[2, 'Bruno Trindade', 'p2', 't-mem', 'Membro'], [3, 'Carla Sem Unidade', 'p3', 't-mem', 'Membro'], [4, 'Davi Reconciliado', 'p4', 't-mem', 'Membro']]) {
  const antes = tagNames(id);
  await pill(nome).click(); await page.waitForTimeout(350); await opt(alvo).click(); await save(); await page.waitForTimeout(450);
  ck(`${n}. ${antes} → ${esperado} (${nome}): substitui, lista atualizada`, tagNames(id) === esperado && (await pillText(nome)) === esperado, `banco=${tagNames(id)} tela=${await pillText(nome)}`);
}

// ── sem tipo ──
await pill('Davi Reconciliado').click(); await page.waitForTimeout(350); await opt('t-mem').click(); await page.waitForTimeout(100);
ck('clicar no tipo marcado deixa a pessoa SEM tipo (permitido)', (await checked()) === '');
await dlg.locator('button:has-text("Cancelar")').click(); await page.waitForTimeout(250);

// ── 10. outras categorias continuam multi-seleção ──
await pill('Bruno Trindade').click(); await page.waitForTimeout(350);
await opt('g-coral').click(); await opt('g-jovens').click(); await page.waitForTimeout(100);
ck('10. etiquetas de outra categoria: várias ao mesmo tempo, junto com o tipo', (await checked()) === 'g-coral,g-jovens,t-mem' && (await opt('g-coral').getAttribute('role')) === 'checkbox', await checked());
await opt('t-vis').click(); await page.waitForTimeout(100);
ck('10. trocar o tipo não desmarca as etiquetas gerais', (await checked()) === 'g-coral,g-jovens,t-vis', await checked());
await save(); await page.waitForTimeout(500);
ck('10. gravado: 1 tipo + 2 etiquetas gerais', db.p2.tags.slice().sort().join(',') === 'g-coral,g-jovens,t-vis', db.p2.tags.join(','));

// ── registro legado com 2 tipos ──
ck('legado: lista mostra os dois tipos como estão (não alterado automaticamente)', /Visitante/.test(await pillText('Eva Legado')) && /Membro/.test(await pillText('Eva Legado')), await pillText('Eva Legado'));
await pill('Eva Legado').click(); await page.waitForTimeout(350);
ck('legado: modal abre com os dois marcados e Salvar desabilitado (nada é escolhido sozinho)', (await checked()) === 't-mem,t-vis' && await dlg.locator('button:has-text("Salvar")').isDisabled(), await checked());
await opt('t-mem').click(); await page.waitForTimeout(100);
const c1 = await checked();
await dlg.locator('button:has-text("Cancelar")').click(); await page.waitForTimeout(250);
ck('legado: a decisão é humana — desmarcar um deixa o outro; cancelar não grava nada', c1 === 't-vis' && tagNames('p5') === 'Visitante+Membro', `seleção=${c1} banco=${tagNames('p5')}`);

// ── barreira do banco → mensagem amigável, sem escrita parcial ──
await pill('Carla Sem Unidade').click(); await page.waitForTimeout(350); await opt('t-vis').click();
failNext = { code: '23514', message: 'PERSON_TYPE_SINGLE: Uma pessoa só pode ter um tipo. Remova o tipo atual antes de escolher outro.' };
await save(); await page.waitForTimeout(700);
const errTxt = (await dlg.count()) ? await dlg.innerText() : '';
ck('erro do banco → mensagem amigável, modal continua aberto', errTxt.includes('Uma pessoa só pode ter um tipo') && !/PERSON_TYPE_SINGLE|23514/.test(errTxt));
await dlg.locator('button:has-text("Cancelar")').click(); await page.waitForTimeout(600);
ck('erro do banco → lista volta ao valor real (sem tipo fantasma)', (await pillText('Carla Sem Unidade')) === 'Membro' && tagNames('p3') === 'Membro', await pillText('Carla Sem Unidade'));

// ── 20–22. ETAPA no painel de detalhe ──
await tr('Ana Itaipu').locator('td').nth(0).click(); await page.waitForTimeout(700);
const stageBtn = page.locator('button[aria-label^="Etapa atual:"]').first();
ck('painel de detalhe abre com a etapa atual (Membro)', (await stageBtn.getAttribute('aria-label'))?.startsWith('Etapa atual: Membro'), await stageBtn.getAttribute('aria-label'));
calls.length = 0;
await stageBtn.click(); await page.waitForTimeout(250);
await stageBtn.locator('xpath=..').locator('button', { hasText: 'Visitante' }).last().click(); await page.waitForTimeout(1500);
ck('20. trocar etapa: painel mostra a NOVA etapa sem F5', (await page.locator('button[aria-label^="Etapa atual:"]').first().getAttribute('aria-label'))?.startsWith('Etapa atual: Visitante'), await page.locator('button[aria-label^="Etapa atual:"]').first().getAttribute('aria-label'));
ck('21. lista e badges das abas foram recarregados', pageCalls() >= 1 && calls.some(c => c.name === 'get_people_stage_counts'), `people_page=${pageCalls()} stage_counts=${calls.filter(c => c.name === 'get_people_stage_counts').length}`);
ck('22. trocar ETAPA não alterou o TIPO (nenhuma gravação de tipo)', !lastSet() && tagNames('p1') === 'Visitante' && db.p1.stage === 's-vis');
// tipo no painel também reflete na hora
const panelPill = page.locator('button[aria-label="Editar tipos desta pessoa"]').last();
await panelPill.click(); await page.waitForTimeout(350); await opt('t-mem').click(); calls.length = 0; await save(); await page.waitForTimeout(500);
ck('painel de detalhe: tipo trocado aparece na hora (painel e lista)', /Membro/.test((await panelPill.innerText())) && (await pillText('Ana Itaipu')) === 'Membro', await panelPill.innerText());
ck('22. trocar TIPO não alterou a ETAPA', db.p1.stage === 's-vis' && !calls.some(c => String(c.name).includes('person_pipeline')));
await page.screenshot({ path: 'tipo-pessoa-painel.png' });

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
