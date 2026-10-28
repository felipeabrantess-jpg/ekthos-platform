/**
 * test-pessoas-tela-simples.mjs — tela Pessoas simplificada (28/10): Quem × Atendimento + "Mais filtros" (janela),
 * Aniversariantes no topo, mesmos números. Supabase MOCKADO (Playwright): contagens e lista saem do MESMO
 * "banco" em memória com os MESMOS filtros, como no banco real.
 *   node test-pessoas-tela-simples.mjs            (dev server :5173; BASE_URL=... para outro)
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const CH = 'aaa00000-0000-0000-0000-000000000001';
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222';
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const mkSession = () => { const meta = { church_id: CH, role: 'admin', provider: 'email' }; const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' + btoa(JSON.stringify({ sub: 'u1', role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: meta })).replace(/=/g, '') + '.x'; return { access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r', user: { id: 'u1', aud: 'authenticated', role: 'authenticated', email: 'u1@t', app_metadata: meta, user_metadata: {}, created_at: '2026-01-01' } }; };

// "Banco": 30 pessoas. Unidade 1: 20 (Visitantes 14, Membros 5, Não classif. 1); unidade 2: 10.
const STAGES = [['visitante', 'Visitante'], ['novo_convertido', 'Novo Convertido'], ['connect', 'Connect'], ['membro', 'Membro']];
const P = [];
const add = (n, o) => { for (let i = 0; i < n; i++) P.push({ id: `p${P.length}`, name: `Pessoa ${P.length}`, ...o }); };
add(8, { unit: U1, cls: 'visitor', care: 'nao_atendida', h48: true,  stage: 'visitante' });
add(1, { unit: U1, cls: 'visitor', care: 'nao_atendida', h48: false, stage: 'visitante' });
add(3, { unit: U1, cls: 'visitor', care: 'em_atendimento', h48: false, stage: 'novo_convertido' });
add(1, { unit: U1, cls: 'visitor', care: 'cancelado', h48: false, stage: 'connect' });
add(1, { unit: U1, cls: 'visitor', care: 'em_atendimento', h48: false, stage: null });
add(2, { unit: U1, cls: 'member', care: 'nao_atendida', h48: true, stage: 'membro' });
add(3, { unit: U1, cls: 'member', care: 'em_atendimento', h48: false, stage: 'membro' });
add(1, { unit: U1, cls: 'none', care: 'nao_atendida', h48: true, stage: null });
add(6, { unit: U2, cls: 'visitor', care: 'nao_atendida', h48: true, stage: 'visitante' });
add(4, { unit: U2, cls: 'none', care: 'nao_atendida', h48: true, stage: null });

// Atendidas hoje (28/10): 3 pessoas da unidade 1 com atendimento registrado hoje
const HOJE = { p9: { result: 'realizado', notes: 'conversamos', actor_name: 'Ana Secretária', registros_hoje: 2 }, p10: { result: 'sem_resposta', notes: null, actor_name: 'Ana Secretária', registros_hoje: 1 }, p13: { result: 'encaminhado', notes: 'Encaminhado para Louvor', actor_name: 'Pr. João', registros_hoje: 1 } };
const filt = (b) => P.filter(p =>
  (!b.p_unit_id || p.unit === b.p_unit_id) &&
  (!b.p_classification || p.cls === b.p_classification) &&
  (!b.p_stage_key || (b.p_stage_key === '__none' ? !p.stage : p.stage === b.p_stage_key)) &&
  (!b.p_care_status || (b.p_care_status === 'sem_contato_48h' ? p.h48 : b.p_care_status === 'atendidas_hoje' ? !!HOJE[p.id] : p.care === b.p_care_status)));
const countsOf = (b) => { const l = filt({ ...b, p_care_status: null }); const c = s => l.filter(p => p.care === s).length;
  return { total: l.length, nao_atendida: c('nao_atendida'), em_atendimento: c('em_atendimento'), atendida: c('atendida'), cancelado: c('cancelado'), sem_contato_48h: l.filter(p => p.h48).length, atendidas_hoje: l.filter(p => HOJE[p.id]).length, alert_threshold_hours: 48 }; };
const row = (p) => ({ id: p.id, church_id: CH, name: p.name, phone: '5521900000000', email: null, unit_id: p.unit, care_state: p.care, care_status: p.care, created_at: '2026-10-01T00:00:00Z', deleted_at: null, left_at: null, source: 'manual', person_tags: [], person_pipeline: [], classification: { classification: p.cls === 'none' ? null : p.cls, roles: [] }, atendimento_hoje: HOJE[p.id] ? { person_id: p.id, at: new Date().toISOString(), ...HOJE[p.id] } : null });

let calls = [];
const results = []; const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
await ctx.route(`${SUPA}/**`, async (route) => {
  const url = route.request().url(); const method = route.request().method();
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } });
  if (url.includes('/auth/v1/token')) return route.fulfill(json(mkSession()));
  if (url.includes('/auth/v1/user')) return route.fulfill(json(mkSession().user));
  if (url.includes('/rest/v1/user_roles')) return route.fulfill(json({ role: 'admin' }));
  if (url.includes('/rest/v1/rpc/')) {
    const name = url.split('/rest/v1/rpc/')[1].split('?')[0]; const b = JSON.parse(route.request().postData() || '{}');
    calls.push({ name, b });
    switch (name) {
      case 'get_my_tenant_context': return route.fulfill(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }));
      case 'upsert_session_token': return route.fulfill(json('tok'));
      case 'get_care_status_counts': return route.fulfill(json(countsOf(b)));
      case 'get_people_stage_counts': { const l = filt({ p_unit_id: b.p_unit_id }); return route.fulfill(json({ total: l.length, aniversarios: 3, sem_etapa: l.filter(p => !p.stage).length, stages: STAGES.map(([k, n], i) => ({ stage_id: 's' + i, stage_key: k, name: n, order_index: i + 1, cnt: l.filter(p => p.stage === k).length })), classificacao: { visitor: 0, member: 0, none: 0 } })); }
      case 'get_people_page': { const l = b.p_birth_month ? P.slice(0, 3) : filt(b); const pg = l.slice(b.p_offset ?? 0, (b.p_offset ?? 0) + (b.p_limit ?? 50)); return route.fulfill(json(pg.map(p => ({ row_data: row(p), total_count: l.length })))); }
      case 'get_contact_counts': return route.fulfill(json([]));
      default: return route.fulfill(json([]));
    }
  }
  if (url.includes('/rest/v1/pipeline_stages')) return route.fulfill(json(STAGES.map(([k, n], i) => ({ id: 's' + i, church_id: CH, name: n, slug: k, stage_key: k, order_index: i + 1, is_active: true }))));
  if (url.includes('/rest/v1/church_units')) return route.fulfill(json([{ id: U1, name: 'Itaipu', church_id: CH, is_active: true }, { id: U2, name: 'Trindade', church_id: CH, is_active: true }]));
  if (url.includes('/rest/v1/churches')) { const single = (route.request().headers()['accept'] || '').includes('object'); const r = { id: CH, name: 'T', slug: 't', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }; return route.fulfill(json(single ? r : [r])); }
  return route.fulfill(json([]));
});
const page = await ctx.newPage();
const errors = []; page.on('pageerror', e => errors.push(String(e)));
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => { localStorage.clear(); localStorage.setItem(k, JSON.stringify(s)); }, { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: mkSession() }); break; } catch { await page.waitForTimeout(500); } }
const open = async (qs) => { await page.goto(`${BASE}/pessoas${qs}`, { waitUntil: 'networkidle', timeout: 30000 }); await page.waitForTimeout(1200); };
const num = async (sel) => { const t = await page.locator(sel).first().innerText().catch(() => ''); const m = t.replace(/\./g, '').match(/(\d+)/); return m ? +m[1] : NaN; };
const lastNum = async (sel) => { const t = await page.locator(sel).first().innerText().catch(() => ''); const m = t.replace(/\./g, '').match(/(\d+)\s*$/); return m ? +m[1] : NaN; };
const param = (k) => new URL(page.url()).searchParams.get(k);
const bodyText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
const lastPage = () => [...calls].reverse().find(c => c.name === 'get_people_page' && !c.b.p_birth_month)?.b;
const listCount = async () => page.locator('tbody tr').count();

// 1. Tela limpa
await open(`?unidade=${U1}`);
let t = await bodyText();
ck('sem abas de etapa, sem "Classificação (total da unidade)", sem faixa amarela, sem filtro Contato',
  !/CLASSIFICA[ÇC][ÃA]O \(TOTAL/i.test(t) && !/Aguardando nova tentativa/.test(t) && (await page.locator('[data-testid="filtro-contato"]').count()) === 0 && (await page.getByRole('button', { name: /^Connect/ }).count()) === 0);
ck('"Mais filtros" fechado por padrão (nenhuma etapa visível)', (await page.locator('[data-testid="mais-filtros-janela"]').count()) === 0 && !/Novo Convertido/.test(t));

// 2. Quem fecha
const q = { todos: await num('[data-testid="classificacao-todas"]'), v: await num('[data-testid="classificacao-visitor"]'), m: await num('[data-testid="classificacao-member"]'), n: await num('[data-testid="classificacao-none"]') };
ck('Quem: Todos 20 = Visitantes 14 + Membros 5 + Não classificados 1', q.todos === 20 && q.v === 14 && q.m === 5 && q.n === 1, JSON.stringify(q));

// 3. Atendimento fecha com o Quem escolhido
await page.locator('[data-testid="classificacao-visitor"]').click(); await page.waitForTimeout(900);
const a = { na: await num('[data-testid="estado-nao_atendida"]'), ea: await num('[data-testid="estado-em_atendimento"]'), at: (await page.locator('[data-testid="estado-atendida"]').count()) ? await num('[data-testid="estado-atendida"]') : 0, ca: await num('[data-testid="estado-cancelado"]') };
ck('Visitantes: Atendimento 9 + 4 + 0 + 1 = 14 e lista com 14', a.na === 9 && a.ea === 4 && a.at === 0 && a.ca === 1 && (await listCount()) === 14, JSON.stringify(a));
ck('"Não atendida" mostra o aviso de 48h (8)', /8 sem atendimento há 48h/.test(await page.locator('[data-testid="estado-nao_atendida"]').innerText()));

// 4. Não atendida → Não atendidas | Sem atendimento há 48h
await page.locator('[data-testid="estado-nao_atendida"]').click(); await page.waitForTimeout(900);
ck('clicar Não atendida → opções "Não atendidas 9" e "Sem atendimento há 48h 8"', (await lastNum('[data-testid="nao-atendidas-todas"]')) === 9 && (await lastNum('[data-testid="alerta-sem-contato"]')) === 8, `${await lastNum('[data-testid="nao-atendidas-todas"]')}/${await lastNum('[data-testid="alerta-sem-contato"]')}`);
ck('lista = 9 não atendidas (p_care_status nao_atendida)', lastPage()?.p_care_status === 'nao_atendida' && (await listCount()) === 9);
await page.locator('[data-testid="alerta-sem-contato"]').click(); await page.waitForTimeout(900);
ck('"Sem atendimento há 48h" → lista 8 (p_care_status sem_contato_48h)', lastPage()?.p_care_status === 'sem_contato_48h' && (await listCount()) === 8);
await page.locator('[data-testid="estado-nao_atendida"]').click(); await page.waitForTimeout(900);
ck('clicar de novo em Não atendida desmarca tudo (lista volta a 14)', !param('estado') && (await listCount()) === 14 && (await page.locator('[data-testid="alerta-sem-contato"]').count()) === 0, `estado=${param('estado')} lista=${await listCount()}`);

// 5. Mais filtros → Etapa
await page.locator('[data-testid="btn-mais-filtros"]').click(); await page.waitForTimeout(700);
ck('"Mais filtros" abre a janela com as etapas e números', (await page.locator('[data-testid="mais-filtros-janela"]').isVisible()) && (await num('[data-testid="etapa-novo_convertido"]')) === 3);
await page.locator('[data-testid="etapa-novo_convertido"]').click(); await page.waitForTimeout(500);
await page.locator('[data-testid="mais-filtros-fechar"]').click(); await page.waitForTimeout(900);
ck('Etapa Novo Convertido: chip, p_stage_key na lista e nas contagens, lista 3',
  /Etapa: Novo Convertido/.test(await bodyText()) && lastPage()?.p_stage_key === 'novo_convertido' && (await listCount()) === 3 && (await num('[data-testid="classificacao-visitor"]')) === 3);
await page.locator('[data-testid="chip-etapa"]').click(); await page.waitForTimeout(900);
ck('remover o chip limpa a etapa (lista volta a 14)', !param('etapa') && (await listCount()) === 14 && !/Etapa:/.test(await bodyText()), `etapa=${param('etapa')} lista=${await listCount()}`);

// 6. Etapa incompatível: Membro + Visitantes → vazio coerente, sem trocar de tela
await page.locator('[data-testid="btn-mais-filtros"]').click(); await page.waitForTimeout(500);
await page.locator('[data-testid="etapa-membro"]').click(); await page.locator('[data-testid="mais-filtros-fechar"]').click(); await page.waitForTimeout(1000);
ck('Etapa Membro + Visitantes → Visitantes 0, Membros 5, lista vazia, Visitantes continua escolhido',
  (await num('[data-testid="classificacao-visitor"]')) === 0 && (await num('[data-testid="classificacao-member"]')) === 5 && (await listCount()) === 0 && lastPage()?.p_classification === 'visitor');

// 7. Trocar unidade recalcula tudo e volta à página 1
await open(`?unidade=${U1}&cls=visitor&pagina=2`);
calls = [];
await page.locator('select[aria-label="Unidade"]:visible').first().selectOption(U2); await page.waitForTimeout(1500);
const cc = calls.filter(c => c.name === 'get_care_status_counts');
ck('trocar unidade: todas as contagens com a nova unidade, página volta a 1',
  cc.length >= 4 && cc.every(c => c.b.p_unit_id === U2) && !new URL(page.url()).searchParams.get('pagina') && (await num('[data-testid="classificacao-visitor"]')) === 6, `${cc.length} contagens`);

// 8. Link antigo de aba de etapa
await open(`?unidade=${U1}&tab=stage:visitante`);
ck('link antigo ?tab=stage:visitante abre com chip "Etapa: Visitante" e lista filtrada (9)', /Etapa: Visitante/.test(await bodyText()) && lastPage()?.p_stage_key === 'visitante' && (await listCount()) === 9);

// 8b. (revisão I1) remover a etapa vinda de link antigo não a traz de volta no F5
await page.locator('[data-testid="chip-etapa"]').click(); await page.waitForTimeout(900);
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
ck('link antigo: etapa removida NÃO volta ao recarregar (tab antigo convertido)', !/Etapa:/.test(await bodyText()) && !param('tab') && !param('etapa') && (await listCount()) === 20, `tab=${param('tab')} etapa=${param('etapa')} lista=${await listCount()}`);

// 8c. (revisão I2) "Sem etapa" continua disponível em Mais filtros, com número
await page.locator('[data-testid="btn-mais-filtros"]').click(); await page.waitForTimeout(800);
ck('"Sem etapa" existe em Mais filtros com número (2 pessoas sem etapa na unidade 1)', (await num('[data-testid="etapa-__none"]')) === 2, String(await num('[data-testid="etapa-__none"]')));
await page.locator('[data-testid="etapa-__none"]').click(); await page.locator('[data-testid="mais-filtros-fechar"]').click(); await page.waitForTimeout(900);
ck('"Sem etapa": chip legível e lista com 2', /Etapa: Sem etapa/.test(await bodyText()) && (await listCount()) === 2 && param('etapa') === '__none');

// 9. Aniversariantes = visão de hoje
await open(`?unidade=${U1}`);
await page.locator('[data-testid="btn-aniversariantes"]').click(); await page.waitForTimeout(1200);
ck('Aniversariantes abre a visão de aniversariantes do mês (cards de contato)', /Aniversariantes de/.test(await bodyText()) && calls.some(c => c.name === 'get_people_page' && c.b.p_birth_month));

// 10. Garantias herdadas de test-pessoas-filtros.mjs (aposentado: testava abas/período/total da unidade, que saíram)
await open(`?unidade=${U1}`);
const seq = ['member', 'none', 'visitor', 'todas', 'visitor', 'member', 'todas', 'none', 'member', 'visitor'];
const esperado = { todas: 20, visitor: 14, member: 5, none: 1 };
let okSeq = true; const info = [];
for (const k of seq) {
  await page.locator(`[data-testid="classificacao-${k}"]`).click(); await page.waitForTimeout(700);
  const n = await listCount(); const b = await num(`[data-testid="classificacao-${k}"]`); const un = param('unidade');
  if (n !== esperado[k] || b !== esperado[k] || un !== U1) { okSeq = false; info.push(`${k}:${n}/${b}/${un}`); }
}
ck('alternância repetida (10 trocas): lista = número do botão, unidade mantida', okSeq, info.join(' '));
await page.locator('[data-testid="btn-mais-filtros"]').click(); await page.waitForTimeout(400);
await page.locator('[data-testid="etapa-visitante"]').click(); await page.locator('[data-testid="filtro-origem"]').selectOption('manual');
await page.locator('[data-testid="mais-filtros-fechar"]').click(); await page.waitForTimeout(900);
await page.locator('text=Limpar filtros').first().click(); await page.waitForTimeout(1000);
ck('"Limpar filtros": etapa, origem e Quem limpos; unidade mantida; lista volta a 20',
  (await page.locator('[data-testid="filtros-ligados"]').count()) === 0 && !param('etapa') && !param('origem') && !param('cls') && param('unidade') === U1 && (await listCount()) === 20);
ck('isolamento: todas as RPCs com p_church_id usam a igreja do token', calls.every(c => !c.b.p_church_id || c.b.p_church_id === CH));

// ── Atendidas hoje ─────────────────────────────────────────
await page.goto(`${BASE}/pessoas?unidade=all`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1500);
ck('não existe mais o botão "Atendida" quando ninguém está nesse estado', (await page.locator('[data-testid="estado-atendida"]').count()) === 0);
const nHoje = await num('[data-testid="estado-atendidas_hoje"]');
ck('botão "Atendidas hoje 3"', /Atendidas hoje/.test(await page.locator('[data-testid="estado-atendidas_hoje"]').innerText()) && nHoje === 3, String(nHoje));
const somaEstados = (await num('[data-testid="estado-nao_atendida"]')) + (await num('[data-testid="estado-em_atendimento"]')) + (await num('[data-testid="estado-cancelado"]'));
ck('Atendidas hoje fica FORA da soma: Não atendida + Em atendimento + Cancelado = Todos', somaEstados === (await num('[data-testid="classificacao-todas"]')), String(somaEstados));
calls = [];
await page.locator('[data-testid="estado-atendidas_hoje"]').click(); await page.waitForTimeout(1500);
const linhas = await page.locator('table tbody tr').count();
ck('clicar: lista com as 3 atendidas hoje, filtro enviado ao banco', linhas === 3 && calls.some(c => c.name === 'get_people_page' && c.b.p_care_status === 'atendidas_hoje'), String(linhas));
const det = await page.locator('table [data-testid="atendimento-hoje"]').allInnerTexts();
ck('cada linha mostra o que rolou hoje (hora, resultado, quem)', det.length === 3 && det.every(t => /^Hoje \d{2}:\d{2}/.test(t)), det.join(' | '));
ck('mostra resultado, quem atendeu, nº de registros e anotação', det.some(t => /Contato realizado · Ana Secretária · 2 registros/.test(t) && /conversamos/.test(t)) && det.some(t => /Sem resposta/.test(t)) && det.some(t => /Encaminhado · Pr\. João/.test(t) && /Louvor/.test(t)), det.join(' | '));
ck('URL guarda o filtro (?estado=atendidas_hoje)', new URL(page.url()).searchParams.get('estado') === 'atendidas_hoje');
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500);
ck('F5 mantém Atendidas hoje', (await page.locator('table tbody tr').count()) === 3);
await page.locator('[data-testid="estado-atendidas_hoje"]').click(); await page.waitForTimeout(1200);
ck('clicar de novo desmarca (lista volta ao total)', (await page.locator('table tbody tr').count()) > 3 && !new URL(page.url()).searchParams.get('estado'));

ck('sem erros de página', errors.length === 0, errors.join(' | ').slice(0, 200));
await page.screenshot({ path: 'pessoas-tela-simples.png', fullPage: true });
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
