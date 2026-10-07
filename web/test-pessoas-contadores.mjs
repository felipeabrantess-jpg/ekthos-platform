import { chromium } from 'playwright';
/**
 * test-pessoas-contadores.mjs — itens 2/16/22: ESTADOS (exclusivos, somam o total) × ALERTA (separado), contadores no mesmo universo da lista.
 * Zero requisições ao banco de produção.
 */


const BASE = 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';

// JWT mínimo válido (assinatura fake — só para o SDK parsear o payload)
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({ sub: 'test-user-id', role: 'authenticated', exp: 9999999999, iss: 'supabase',
    app_metadata: { church_id: 'aaa00000-0000-0000-0000-000000000001', role: 'admin' } })).replace(/=/g,'') +
  '.fakesig';

const MOCK_SESSION = {
  access_token: FAKE_JWT,
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: 9999999999,
  refresh_token: 'fake-refresh',
  user: {
    id: 'test-user-id',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'test@local',
    app_metadata: { provider: 'email', church_id: 'aaa00000-0000-0000-0000-000000000001', role: 'admin' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  }
};

const MOCK_CHURCH = {
  id: 'aaa00000-0000-0000-0000-000000000001',
  name: 'Igreja Teste Local',
  slug: 'teste-local',
  primary_color: '#3B82F6',
  logo_url: null,
};

const MOCK_PROFILE = {
  id: 'aaa00000-0000-0000-0000-000000000002',
  user_id: 'test-user-id',
  church_id: MOCK_CHURCH.id,
  role: 'admin',
  full_name: 'Claude Test',
};

const MOCK_PEOPLE_COUNTS = {
  total: 20, aniversarios: 2, novos_visitantes: 5, novos_visitantes_30d: 3,
  novos_convertidos: 1, membros: 4, lideres: 2, em_risco: 1
};

const MOCK_PEOPLE = Array.from({ length: 10 }, (_, i) => ({
  id: `person-${i}`,
  church_id: MOCK_CHURCH.id,
  name: `Pessoa ${i + 1}`,
  phone: `5511900000${String(i).padStart(3,'0')}`,
  email: null,
  person_stage: i < 5 ? 'visitante' : 'frequentador',
  birth_date: i === 0 ? '1990-09-09' : null,
  birth_month: i === 0 ? 9 : null,
  birth_day: i === 0 ? 9 : null,
  conversion_date: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  deleted_at: null,
  left_at: null,
  unit_id: i < 3 ? '11111111-1111-4111-8111-111111111111' : null,
  source: 'manual',
  optout: false,
  person_pipeline: i < 4 ? [{
    stage_id: 'stage-membro',
    last_activity_at: '2026-08-01T00:00:00Z',
    entered_at: '2026-08-01T00:00:00Z',
    pipeline_stages: { id: 'stage-membro', name: 'Membro', slug: 'membro', order_index: 1, color: '#3B82F6' }
  }] : [],
  person_tags: [],
  acolhimento_journey: [],
}));

const ROUTES = ['/pessoas', '/dashboard', '/pipeline'];

function mockResponse(data, status = 200) {
  return {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(data),
  };
}


  const browser = await chromium.launch();
  const ctx = await browser.newContext();

  // ── Interceptar TODAS as chamadas Supabase ──────────────────────
  await ctx.route(`${SUPA}/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    let handled=false; try { handled = await custom(route, url); } catch (e) { console.log("CUSTOM ERROR", url.slice(0,100), String(e).slice(0,200)); } if (handled) return;

    // Auth: token (login)
    if (url.includes('/auth/v1/token')) {
      return route.fulfill(mockResponse(MOCK_SESSION));
    }
    // Auth: session refresh / user
    if (url.includes('/auth/v1/user') || url.includes('/auth/v1/session')) {
      return route.fulfill(mockResponse(MOCK_SESSION.user));
    }
    // RPC calls
    if (url.includes('/rest/v1/rpc/')) {
      if (url.includes('get_people_counts'))   return route.fulfill(mockResponse(MOCK_PEOPLE_COUNTS));
      if (url.includes('get_unit_counts'))     return route.fulfill(mockResponse([
        { unit_id: '11111111-1111-4111-8111-111111111111', person_stage: 'visitante', cnt: 5 },
        { unit_id: null,     person_stage: 'visitante', cnt: 3 },
      ]));
      if (url.includes('get_care_status_counts')) return route.fulfill(mockResponse({
        nao_atendida: 12, em_atendimento: 3, atendida: 2, sem_contato_48h: 15
      }));
      if (url.includes('get_dashboard_people_stats')) return route.fulfill(mockResponse({
        total: 10, sem_etapa: 6, novos_semana: 1, visitantes_30d: 2, membros: 4, novos_convertidos: 0,
        novos_convertidos_30d: 0, escola_da_fe: 0, batismos_trimestre: 0, parados: 1, consolidacao_90d: 50,
        por_etapa: [{ stage_id: 'stage-membro', stage_key: 'membro', name: 'Membro', order_index: 5, cnt: 4 }],
        evolucao_12m: [{ mes: '2026-09', novos: 10 }], visitantes_sem_consolidacao: [], membros_ausentes: [],
        celulas_ativas: 1, celulas_total: 1, celulas_por_trimestre: [], top_celulas: [], celulas_em_alerta: [],
        voluntarios_por_ministerio: [],
      }));
      if (url.includes('get_discipulado_overview')) return route.fulfill(mockResponse([
        { stage_id: 'stage-membro', stage_name: 'Membro', stage_key: 'membro', order_index: 5, total: 4, entraram: 1, avancaram: 0, parados: 1 },
      ]));
      if (url.includes('get_discipulado_stage_people')) return route.fulfill(mockResponse(
        MOCK_PEOPLE.slice(0, 4).map(p => ({ person_id: p.id, nome: p.name, telefone: p.phone, dias_na_etapa: 3, responsavel: null, atrasado: false, total_count: 4 }))));
      if (url.includes('get_people_stage_counts')) return route.fulfill(mockResponse({
        total: 10, aniversarios: 1, sem_etapa: 6,
        stages: [
          { stage_id: 'stage-visit', stage_key: 'visitante', name: 'Visitante', order_index: 1, cnt: 0 },
          { stage_id: 'stage-nc', stage_key: 'novo_convertido', name: 'Novo Convertido', order_index: 3, cnt: 0 },
          { stage_id: 'stage-membro', stage_key: 'membro', name: 'Membro', order_index: 5, cnt: 4 },
        ],
      }));
      if (url.includes('get_people_page')) {
        const body = JSON.parse(route.request().postData() || '{}');
        const rows = body.p_stage_key === 'membro' ? MOCK_PEOPLE.slice(0, 4) : body.p_stage_key ? [] : MOCK_PEOPLE;
        return route.fulfill(mockResponse(rows.map(r => ({ row_data: r, total_count: rows.length }))));
      }
      return route.fulfill(mockResponse([]));
    }
    if (url.includes('/rest/v1/user_roles')) {
      return route.fulfill(mockResponse({ role: 'admin' }));
    }
    // Profiles
    if (url.includes('/rest/v1/profiles')) {
      return route.fulfill(mockResponse([MOCK_PROFILE]));
    }
    // Churches
    if (url.includes('/rest/v1/churches')) {
      const single = (route.request().headers()['accept'] || '').includes('object');
      return route.fulfill(mockResponse(single ? { ...MOCK_CHURCH, unit_cutoff_date: null } : [MOCK_CHURCH]));
    }
    // People
    if (url.includes('/rest/v1/people')) {
      return route.fulfill(mockResponse(MOCK_PEOPLE));
    }
    // Pipeline stages
    if (url.includes('/rest/v1/pipeline_stages')) {
      return route.fulfill(mockResponse([
        { id: 'stage-membro', name: 'Membro', slug: 'membro', order_index: 1, color: '#3B82F6', church_id: MOCK_CHURCH.id },
        { id: 'stage-lider', name: 'Líder', slug: 'lider', order_index: 2, color: '#10B981', church_id: MOCK_CHURCH.id },
      ]));
    }
    // Person pipeline (pipeline view)
    if (url.includes('/rest/v1/person_pipeline')) {
      return route.fulfill(mockResponse([]));
    }
    // Church units
    if (url.includes('/rest/v1/church_units')) {
      return route.fulfill(mockResponse([
        { id: '11111111-1111-4111-8111-111111111111', name: 'Unidade Central', church_id: MOCK_CHURCH.id, is_active: true },
        { id: '22222222-2222-4222-8222-222222222222', name: 'Unidade Norte', church_id: MOCK_CHURCH.id, is_active: true },
      ]));
    }
    // Tags
    if (url.includes('/rest/v1/tags')) {
      return route.fulfill(mockResponse([]));
    }
    // QR codes
    if (url.includes('/rest/v1/qr_codes')) {
      return route.fulfill(mockResponse([{ id: 'qr-1', slug: 'test-qr', is_active: true, scanned_count: 0, unit_id: null }]));
    }
    // Catch-all: retorna array vazio para queries desconhecidas
    return route.fulfill(mockResponse([]));
  });

const results = []; const CH = MOCK_CHURCH.id;
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };
// ── Estado "do banco": pessoas com estado e alerta; contadores derivados dos MESMOS filtros da lista ──
const careOf = { p0: ['nao_atendida', true], p1: ['em_atendimento', false], p2: ['em_atendimento', true], p3: ['atendida', false], p4: ['cancelado', false], p6: ['nao_atendida', false], p7: ['em_atendimento', true] }
const stageOf = { p0: 'visitante', p1: 'visitante', p2: 'membro', p3: 'membro', p4: null, p6: null, p7: 'visitante' }
const unitOf  = { p0: '11111111-1111-4111-8111-111111111111', p1: '11111111-1111-4111-8111-111111111111', p2: null, p3: '11111111-1111-4111-8111-111111111111', p4: null, p6: null, p7: '11111111-1111-4111-8111-111111111111' }
const universe = (body) => Object.keys(careOf).filter(id =>
  (!body.p_stage_key || (body.p_stage_key === '__none' ? !stageOf[id] : stageOf[id] === body.p_stage_key))
  && (!body.p_search || id.includes(body.p_search.toLowerCase()))
  && (body.p_unit_id == null || (body.p_unit_id === 'none' ? !unitOf[id] : unitOf[id] === body.p_unit_id)))
const countCalls = [], pageCalls = []
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (u.includes('get_care_status_counts')) {
    countCalls.push(body); const ids = universe(body)
    const c = { nao_atendida: 0, em_atendimento: 0, atendida: 0, cancelado: 0, total: ids.length, sem_contato_48h: 0, alert_threshold_hours: 48 }
    for (const id of ids) { c[careOf[id][0]]++; if (careOf[id][1]) c.sem_contato_48h++ }
    return F(json(c))
  }
  if (u.includes('get_people_page')) {
    pageCalls.push(body)
    let ids = universe(body)
    if (body.p_care_status) ids = ids.filter(id => body.p_care_status === 'sem_contato_48h' ? careOf[id][1] : careOf[id][0] === body.p_care_status)
    const rows = ids.map(id => ({ ...MOCK_PEOPLE[0], id, name: `Pessoa ${id}`, person_pipeline: [], unit_id: unitOf[id], care_state: careOf[id][0], care_alert: careOf[id][1] }))
    return F(json(rows.map(x => ({ row_data: x, total_count: rows.length }))))
  }
  if (u.includes('get_people_stage_counts')) return F(json({ total: 7, aniversarios: 0, sem_etapa: 2, stages: [
    { stage_id: 'stage-visit', stage_key: 'visitante', name: 'Visitante', order_index: 1, cnt: 3 },
    { stage_id: 'stage-membro', stage_key: 'membro', name: 'Membro', order_index: 5, cnt: 2 }] }))
  if (u.includes('get_contact_counts')) return F(json([]))
  return false
}
const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch')) errs.push(m.text()); });
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break; } catch { await page.waitForTimeout(500); } }
const txt = async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();
const num = (s) => Number((s.match(/\((\d+)\)/) || [])[1])
const readCounters = async () => ({
  todos: num(await txt('[data-testid="estado-todos"]')), nao: num(await txt('[data-testid="estado-nao_atendida"]')), em: num(await txt('[data-testid="estado-em_atendimento"]')),
  at: num(await txt('[data-testid="estado-atendida"]')), can: num(await txt('[data-testid="estado-cancelado"]')), alerta: num(await txt('[data-testid="alerta-sem-contato"]')),
  header: Number(((await txt('h1 + p')).match(/^(\d+)/) || [])[1]),
})
const sameFilters = (a, b) => ['p_church_id', 'p_unit_id', 'p_stage_key', 'p_source', 'p_search', 'p_birth_month', 'p_created_from', 'p_created_to'].every(k => (a[k] ?? null) === (b[k] ?? null))
const last = (arr) => arr[arr.length - 1]

// Visão geral, todas as unidades
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1200)
let c = await readCounters()
ck('ESTADOS e ALERTA em grupos separados; "Todos (7)" mostra o total do universo', (await page.locator('[data-testid="atendimento-estados"]').count()) === 1 && (await page.locator('[data-testid="atendimento-alerta"]').count()) === 1 && c.todos === 7, JSON.stringify(c))
ck('reconciliação: Não atendida + Em atendimento + Atendida + Cancelado = Todos = cabeçalho da lista (2+3+1+1 = 7)', c.nao + c.em + c.at + c.can === c.todos && c.header === c.todos, JSON.stringify(c))
ck('alerta "Sem contato +48h (3)" fora da soma dos estados (3 ≠ 7 − 7)', c.alerta === 3 && c.nao + c.em + c.at + c.can + c.alerta !== c.todos, JSON.stringify(c))
ck('o botão do alerta não está no grupo de estados', (await page.locator('[data-testid="atendimento-estados"] [data-testid="alerta-sem-contato"]').count()) === 0 && (await page.locator('[data-testid="atendimento-alerta"] [data-testid="alerta-sem-contato"]').count()) === 1)
ck('contador chamado com os MESMOS filtros da lista (sem p_care_status/p_limit/p_offset)', sameFilters(last(countCalls), last(pageCalls)) && !('p_care_status' in last(countCalls)) && !('p_limit' in last(countCalls)), JSON.stringify(last(countCalls)))
ck('banner do alerta usa o threshold do banco (48h) e o número do alerta', /mais de 48h/.test(await txt('text=Aguardando nova tentativa')) && (await page.locator('text=(3)').count()) >= 1)

// Aba Visitante (etapa): contadores restritos à etapa
await page.locator('button:has-text("Visitante")').first().click(); await page.waitForTimeout(1200)
c = await readCounters()
ck('aba Visitante: universo p0,p1,p7 → Todos (3) = cabeçalho; 1+2+0+0 = 3; alerta 2', c.todos === 3 && c.header === 3 && c.nao === 1 && c.em === 2 && c.at === 0 && c.can === 0 && c.alerta === 2, JSON.stringify(c))
ck('aba Visitante: contador enviou p_stage_key=visitante, igual à lista', last(countCalls).p_stage_key === 'visitante' && sameFilters(last(countCalls), last(pageCalls)), JSON.stringify(last(countCalls)))

// Busca
await page.locator('input[placeholder*="Buscar"]').fill('p7'); await page.waitForTimeout(1500)
c = await readCounters()
ck('busca "p7" na aba Visitante: Todos (1) = cabeçalho; Em atendimento 1; alerta 1', c.todos === 1 && c.header === 1 && c.em === 1 && c.alerta === 1 && last(countCalls).p_search === 'p7' && sameFilters(last(countCalls), last(pageCalls)), JSON.stringify(c))
await page.locator('input[placeholder*="Buscar"]').fill(''); await page.waitForTimeout(800)

// Filtro de situação: clicar no alerta filtra a lista; contadores NÃO mudam (mesmo universo)
await page.locator('[data-testid="alerta-sem-contato"]').click(); await page.waitForTimeout(1200)
const rows = await page.locator('table tbody tr').count()
c = await readCounters()
ck('clicar em "Sem contato +48h": lista com 2 (p0, p7), contadores continuam os da aba (Todos 3)', rows === 2 && last(pageCalls).p_care_status === 'sem_contato_48h' && c.todos === 3 && !('p_care_status' in last(countCalls)), `rows=${rows} ${JSON.stringify(c)}`)
await page.locator('[data-testid="estado-em_atendimento"]').click(); await page.waitForTimeout(1200)
ck('clicar em "Em atendimento": lista com 2 (p1, p7)', (await page.locator('table tbody tr').count()) === 2 && last(pageCalls).p_care_status === 'em_atendimento')

// Unidade global
await page.locator('button:has-text("Visão geral")').first().click(); await page.waitForTimeout(800)
await page.locator('[data-testid="estado-todos"]').click(); await page.waitForTimeout(600)
const unitSel = page.locator('select[aria-label="Unidade"]:visible').first()
if (await unitSel.count()) {
  await unitSel.selectOption({ label: 'Unidade Central' }); await page.waitForTimeout(1500)
  c = await readCounters()
  ck('unidade Central (u1: p0,p1,p3,p7): Todos (4) = cabeçalho; 1+2+1+0 = 4; alerta 2; p_unit_id enviado igual à lista', c.todos === 4 && c.header === 4 && c.nao + c.em + c.at + c.can === 4 && c.alerta === 2 && last(countCalls).p_unit_id === '11111111-1111-4111-8111-111111111111' && sameFilters(last(countCalls), last(pageCalls)), JSON.stringify(c) + ' ' + JSON.stringify(last(countCalls)))
} else {
  ck('seletor de unidade presente', false, 'não encontrado')
}
await page.screenshot({ path: 'pessoas-contadores.png', fullPage: false })
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
