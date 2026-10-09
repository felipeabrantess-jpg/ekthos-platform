import { chromium } from 'playwright';
/**
 * test-pessoas-filtros.mjs — filtros de classificação × aba × estado × unidade (Pessoas). Zero requisições ao banco de produção.
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
// ── test-pessoas-filtros.mjs — filtros de classificação × aba × estado × unidade na tela Pessoas ──
// Backend SIMULADO (zero requisições à produção) reproduzindo as regras do banco (Release 1):
//  - pipeline_stages.requires_classification: visitante→visitor; membro/lider→member; novo_convertido→NULL
//  - pessoa na etapa Visitante é no mínimo Visitante; etapa Membro só contém membros (membros identificados
//    NUNCA aparecem na aba Visitante)
//  - get_people_page / get_care_status_counts / export_people_rows filtram pelo MESMO universo
//  - get_people_stage_counts.classificacao conta só por unidade (semântica atual, preservada)
const STAGES = [
  { id: 'st-visit', stage_key: 'visitante', name: 'Visitante', order_index: 1, requires_classification: 'visitor' },
  { id: 'st-nc', stage_key: 'novo_convertido', name: 'Novo Convertido', order_index: 2, requires_classification: null },
  { id: 'st-membro', stage_key: 'membro', name: 'Membro', order_index: 3, requires_classification: 'member' },
  { id: 'st-lider', stage_key: 'lider', name: 'Líder', order_index: 4, requires_classification: 'member' },
]
const U1 = '11111111-1111-4111-8111-111111111111'
const DB = [] // pessoas da igreja mockada
const mk = (n, cls, stage, care, unit, created, name) => DB.push({ id: `p${n}`, cls, stage, care, unit, created, name: name || `Pessoa ${String(n).padStart(2, '0')} ${cls || 'nc'}` })
// 12 visitantes sem unidade (6 recentes, 6 antigos), etapa visitante
for (let i = 1; i <= 12; i++) mk(i, 'visitor', 'visitante', i % 3 === 0 ? 'em_atendimento' : i % 3 === 1 ? 'nao_atendida' : 'atendida', null, i <= 6 ? '2026-10-05' : '2026-01-10')
// 5 membros sem unidade (2 na etapa membro, 1 líder, 1 novo_convertido, 1 sem etapa)
mk(13, 'member', 'membro', 'atendida', null, '2025-03-01', 'Sidney Membro'); mk(14, 'member', 'membro', 'em_atendimento', null, '2025-03-01')
mk(15, 'member', 'lider', 'atendida', null, '2025-03-01'); mk(16, 'member', 'novo_convertido', 'nao_atendida', null, '2026-09-30'); mk(17, 'member', null, 'cancelado', null, '2025-03-01')
// 4 não classificados sem unidade (3 sem etapa, 1 novo_convertido)
mk(18, null, null, 'nao_atendida', null, '2026-02-02'); mk(19, null, null, 'em_atendimento', null, '2026-02-02'); mk(20, null, null, 'atendida', null, '2026-02-02'); mk(21, null, 'novo_convertido', 'nao_atendida', null, '2026-10-01')
// 3 pessoas na Unidade Central (não devem aparecer em "Sem unidade")
mk(22, 'visitor', 'visitante', 'nao_atendida', U1, '2026-10-06'); mk(23, 'member', 'membro', 'atendida', U1, '2025-01-01'); mk(24, null, null, 'nao_atendida', U1, '2026-02-02')
const PAGE = 10 // simula PEOPLE_PAGE_SIZE? não: o front manda p_limit; o mock respeita p_limit/p_offset reais
const matches = (p, b) => {
  if (b.p_church_id && b.p_church_id !== CH) return false
  if (b.p_unit_id === '__none' || b.p_unit_id === 'none') { if (p.unit !== null) return false } else if (b.p_unit_id && b.p_unit_id !== 'all') { if (p.unit !== b.p_unit_id) return false }
  if (b.p_stage_key === '__none') { if (p.stage) return false } else if (b.p_stage_key) { if (p.stage !== b.p_stage_key) return false }
  if (b.p_classification === 'none') { if (p.cls !== null) return false } else if (b.p_classification) { if (p.cls !== b.p_classification) return false }
  if (b.p_care_status && b.p_care_status !== 'sem_contato_48h' && p.care !== b.p_care_status) return false
  if (b.p_care_status === 'sem_contato_48h' && p.care !== 'nao_atendida') return false
  if (b.p_created_from && p.created < b.p_created_from) return false
  if (b.p_created_to && p.created > b.p_created_to) return false
  if (b.p_search && !p.name.toLowerCase().includes(String(b.p_search).toLowerCase())) return false
  return true
}
const row = (p) => ({ ...MOCK_PEOPLE[0], id: p.id, name: p.name, phone: '5521999990000', email: null, unit_id: p.unit, created_at: p.created + 'T12:00:00Z',
  person_pipeline: p.stage ? [{ stage_id: 'st-' + p.stage, entered_at: '2026-01-01T00:00:00Z', last_activity_at: '2026-01-01T00:00:00Z', pipeline_stages: { id: 'st-' + p.stage, name: STAGES.find(s => s.stage_key === p.stage).name, slug: p.stage, order_index: 1, color: '#000' } }] : [],
  care_state: p.care, care_alert: p.care === 'nao_atendida',
  classification: { classification: p.cls, source: p.cls ? 'validated' : null, roles: [], is_leader: p.stage === 'lider', is_volunteer: false, stage_key: p.stage, stage_name: p.stage ? STAGES.find(s => s.stage_key === p.stage).name : null, condition: null, label: p.cls === 'member' ? 'Membro' : p.cls === 'visitor' ? 'Visitante' : 'Não classificado' } })
const rpcCalls = []
const unitOf = (b) => b.p_unit_id
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  if (u.includes('/rest/v1/pipeline_stages')) return F(json(STAGES.map(s => ({ ...s, slug: s.stage_key, church_id: CH, is_active: true, color: '#000' }))))
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (u.includes('get_people_stage_counts')) {
    rpcCalls.push({ fn: 'stage_counts', body })
    const ub = { p_unit_id: unitOf(body) }; const inUnit = DB.filter(p => matches(p, ub))
    return F(json({ total: inUnit.length, aniversarios: 0, sem_etapa: inUnit.filter(p => !p.stage).length,
      stages: STAGES.map(s => ({ stage_id: s.id, stage_key: s.stage_key, name: s.name, order_index: s.order_index, cnt: inUnit.filter(p => p.stage === s.stage_key).length })),
      classificacao: { visitor: inUnit.filter(p => p.cls === 'visitor').length, member: inUnit.filter(p => p.cls === 'member').length, none: inUnit.filter(p => p.cls === null).length, member_only: 0, leader: 0, volunteer: 0, leader_volunteer: 0 } }))
  }
  if (u.includes('get_care_status_counts')) {
    rpcCalls.push({ fn: 'counts', body }); const b = { ...body, p_care_status: null }; const uni = DB.filter(p => matches(p, b))
    return F(json({ nao_atendida: uni.filter(p => p.care === 'nao_atendida').length, em_atendimento: uni.filter(p => p.care === 'em_atendimento').length, atendida: uni.filter(p => p.care === 'atendida').length, cancelado: uni.filter(p => p.care === 'cancelado').length, total: uni.length, sem_contato_48h: uni.filter(p => p.care === 'nao_atendida').length, alert_threshold_hours: 48 }))
  }
  if (u.includes('get_people_page')) {
    rpcCalls.push({ fn: 'page', body }); const all = DB.filter(p => matches(p, body)); const off = body.p_offset || 0; const lim = body.p_limit || 50
    return F(json(all.slice(off, off + lim).map(p => ({ row_data: row(p), total_count: all.length }))))
  }
  if (u.includes('export_people_rows')) { rpcCalls.push({ fn: 'export', body }); const all = DB.filter(p => matches(p, body)); return F(json({ total: all.length, max_contacts: 0, alert_threshold_hours: 48, rows: all.map(p => ({ id: p.id, name: p.name, phone: null, email: null, etapa: null, care_state: p.care, care_alert: false, unit_id: p.unit, unit_name: null, first_visit_date: null, created_at: p.created, source: 'manual', contact_count: 0, classification: p.cls === 'member' ? 'Membro' : p.cls === 'visitor' ? 'Visitante' : 'Não classificado', roles: '', contacts: [], ministerios: '' })) })) }
  if (u.includes('get_contact_counts')) return F(json([]))
  return false
}
const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch')) errs.push(m.text()); });
await page.setViewportSize({ width: 1400, height: 900 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break; } catch { await page.waitForTimeout(500); } }
await page.addInitScript(() => { window.__csv = []; const orig = URL.createObjectURL; URL.createObjectURL = (b) => { b.text().then(t => window.__csv.push(t)); return orig.call(URL, b) }; HTMLAnchorElement.prototype.click = function () {} })
const txt = async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();
const last = (fn) => [...rpcCalls].reverse().find(c => c.fn === fn)?.body
const names = async () => (await page.locator('table tbody tr td:first-child').allTextContents()).map(t => t.replace(/\s+/g, ' ').trim())
const rows = async () => page.locator('table tbody tr').count()
const header = async () => txt('h1 + p')
const activeTab = async () => txt('div.border-b button.border-primary')
const activeCls = async () => { for (const v of ['todas', 'visitor', 'member', 'none']) { const c = await page.locator(`[data-testid="classificacao-${v}"]`).getAttribute('class'); if (c && c.includes('border-primary')) return v } return null }
const unitSel = () => page.locator('select[aria-label="Unidade"]:visible').first()
const unitVal = async () => unitSel().inputValue()
const click = async (testid, ms = 900) => { await page.locator(`[data-testid="${testid}"]`).click(); await page.waitForTimeout(ms) }
const tab = async (label, ms = 900) => { await page.locator('div.border-b button', { hasText: label }).first().click(); await page.waitForTimeout(ms) }
const settle = () => page.waitForTimeout(700)

await page.goto(`${BASE}/pessoas?tab=visitante`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1500)
// unidade "Sem unidade definida"
const opts = await unitSel().locator('option').allTextContents()
const noneOpt = await unitSel().locator('option', { hasText: /sem unidade/i }).first().getAttribute('value')
ck('seletor de unidade tem a opção "Sem unidade definida"', !!noneOpt, opts.join('|'))
await unitSel().selectOption(noneOpt); await page.waitForTimeout(1200)
const UNIT = await unitVal()

// ── Cenário do incidente: aba Visitante (30 dias) + Sem unidade ──
ck('aba Visitante + Sem unidade + 30 dias: lista só visitantes recentes (6), unidade e período enviados à RPC', (await rows()) === 6 && last('page').p_unit_id === UNIT && !!last('page').p_created_from && (await names()).every(n => n.includes('visitor')), `rows=${await rows()} unit=${last('page').p_unit_id}`)
const chips = { v: await txt('[data-testid="classificacao-visitor"]'), m: await txt('[data-testid="classificacao-member"]'), n: await txt('[data-testid="classificacao-none"]') }
ck('chips de classificação = totais da UNIDADE (12/5/4), com tooltip explicando a semântica (não são da lista)', chips.v === 'Visitantes (12)' && chips.m === 'Membros (5)' && chips.n === 'Não classificados (4)' && ((await page.locator('[data-testid="classificacao-member"]').getAttribute('title')) || '').includes('unidade'), JSON.stringify(chips))

// 3. Membros a partir da aba Visitante → aba vai para Visão geral, lista = 5 membros, unidade mantida
await click('classificacao-member', 1200)
ck('Visitante → MEMBROS: aba passa automaticamente para "Visão geral", lista = os 5 membros da unidade, RPC sem p_stage_key e sem período', (await activeTab()).startsWith('Visão geral') && (await rows()) === 5 && (await names()).every(n => /Membro|member/.test(n)) && last('page').p_classification === 'member' && !last('page').p_stage_key && !last('page').p_created_from, `tab=${await activeTab()} rows=${await rows()} stage=${last('page').p_stage_key}`)
ck('UNIDADE permanece "Sem unidade definida" (seletor e RPC)', (await unitVal()) === UNIT && last('page').p_unit_id === UNIT, `sel=${await unitVal()} rpc=${last('page').p_unit_id}`)
ck('cabeçalho mostra o total FILTRADO (5 pessoas · Membro), distinto do chip da unidade', (await header()).startsWith('5 pessoas') && (await header()).includes('Membro'), await header())
ck('contadores de estado = universo da lista (Membros): Todos 5 · Não atendida 1 · Em atendimento 1 · Atendida 2 · Cancelado 1', (await txt('[data-testid="estado-todos"]')) === 'Todos (5)' && (await txt('[data-testid="estado-nao_atendida"]')) === 'Não atendida (1)' && (await txt('[data-testid="estado-em_atendimento"]')) === 'Em atendimento (1)' && (await txt('[data-testid="estado-atendida"]')) === 'Atendida (2)' && (await txt('[data-testid="estado-cancelado"]')) === 'Cancelado (1)', await txt('[data-testid="atendimento-estados"]'))
// 7. estados dentro da classificação
for (const [st, n] of [['nao_atendida', 1], ['em_atendimento', 1], ['atendida', 2], ['cancelado', 1], ['todos', 5]]) {
  await click(`estado-${st}`)
  const estadoAtivo = ((await page.locator(`[data-testid="estado-${st}"]`).getAttribute('class')) || '').includes('border-primary')
  ck(`Membros → ${st}: lista ${n}, botão ativo, ${st === 'todos' ? 'resultado do cache (mesma consulta Membros/Todos já feita)' : 'RPC p_classification=member + p_care_status=' + st}, unidade mantida`, (await rows()) === n && estadoAtivo && (await activeCls()) === 'member' && (st === 'todos' || (last('page').p_classification === 'member' && last('page').p_care_status === st && last('page').p_unit_id === UNIT)) && (await unitVal()) === UNIT, `rows=${await rows()} care=${last('page').p_care_status}`)
}
// 4. Não classificados
await click('classificacao-none', 1200)
ck('Membros → NÃO CLASSIFICADOS: lista = 4 não classificados, aba segue "Visão geral", unidade mantida', (await rows()) === 4 && (await names()).every(n => n.includes('nc')) && last('page').p_classification === 'none' && (await unitVal()) === UNIT, `rows=${await rows()}`)
ck('seletor de função (só Membros) não aparece em Não classificados', (await page.locator('[data-testid="funcao-filtro"]').count()) === 0)
for (const [st, n] of [['nao_atendida', 2], ['em_atendimento', 1], ['atendida', 1], ['todos', 4]]) {
  await click(`estado-${st}`)
  ck(`Não classificados → ${st}: lista ${n}`, (await rows()) === n && last('page').p_classification === 'none', `rows=${await rows()}`)
}
// 2. Visitantes (sem aba) = 12 visitantes da unidade; 1. Todas = 21
await click('classificacao-visitor', 1200)
ck('Não classificados → VISITANTES: 12 visitantes da unidade (aba Visão geral, sem período)', (await rows()) === 12 && last('page').p_classification === 'visitor' && !last('page').p_stage_key, `rows=${await rows()}`)
await click('classificacao-todas', 1200)
ck('Visitantes → TODAS: 21 pessoas da unidade (sem classificação na RPC), unidade mantida', (await rows()) === 21 && !last('page').p_classification && (await unitVal()) === UNIT, `rows=${await rows()}`)
// 5. alternância repetida em qualquer ordem
let okSeq = true, seqInfo = []
for (const v of ['member', 'none', 'visitor', 'member', 'todas', 'none', 'member', 'visitor', 'none', 'todas']) {
  await click(`classificacao-${v}`, 700); const exp = { member: 5, none: 4, visitor: 12, todas: 21 }[v]; const got = await rows()
  if (got !== exp || (await unitVal()) !== UNIT || (await activeCls()) !== v) { okSeq = false; seqInfo.push(`${v}:${got}/${exp}`) }
}
ck('alternância repetida (10 trocas em ordem arbitrária): lista, chip ativo e unidade sempre corretos', okSeq, seqInfo.join(' '))
// 8/14. aba compatível NÃO muda a aba; aba incompatível limpa só a classificação
await click('classificacao-member', 900); await tab('Novo Convertido')
ck('Membros + aba "Novo Convertido" (etapa sem exigência): classificação PRESERVADA, lista = 1 membro novo convertido', (await activeCls()) === 'member' && (await rows()) === 1 && last('page').p_stage_key === 'novo_convertido' && last('page').p_classification === 'member', `cls=${await activeCls()} rows=${await rows()}`)
await tab('Membro'); ck('Membros + aba "Membro" (exige member): classificação preservada, lista = 2', (await activeCls()) === 'member' && (await rows()) === 2, `rows=${await rows()}`)
await tab('Visitante')
ck('Membros → aba "Visitante" (exige visitor): classificação incompatível é LIMPA (volta a Todas), lista = visitantes 30 dias (6); membros identificados NÃO aparecem na aba Visitante', (await activeCls()) === 'todas' && (await rows()) === 6 && (await names()).every(n => n.includes('visitor')) && (await activeTab()).startsWith('Visitante') && (await unitVal()) === UNIT, `cls=${await activeCls()} rows=${await rows()}`)
await click('estado-em_atendimento', 900)
ck('aba Visitante + estado Em atendimento: 2 (estado preservado como filtro compatível)', (await rows()) === 2, `rows=${await rows()}`)
await click('classificacao-none', 1200)
ck('Visitante+Em atendimento → NÃO CLASSIFICADOS: vai a "Visão geral", ESTADO preservado (1 nc em atendimento), período da aba não se aplica', (await activeTab()).startsWith('Visão geral') && (await rows()) === 1 && (await names())[0].includes('nc') && ((await page.locator('[data-testid="estado-em_atendimento"]').getAttribute('class')) || '').includes('border-primary') && (await activeCls()) === 'none' && (await unitVal()) === UNIT, `rows=${await rows()}`)
// estado vazio com filtros ativos + Limpar filtros
await click('estado-cancelado', 900)
ck('lista vazia explica os FILTROS ATIVOS (Não classificado · Cancelado) e oferece "Limpar filtros"', (await rows()) === 0 && (await page.locator('text=Filtros ativos').count()) === 1 && (await txt('text=Filtros ativos')).includes('Não classificado') && (await txt('text=Filtros ativos')).includes('Cancelado') && (await page.locator('[data-testid="btn-limpar-filtros"]').count()) === 1, await txt('text=Filtros ativos'))
await click('btn-limpar-filtros', 1200)
ck('"Limpar filtros": classificação e estado limpos, aba e UNIDADE mantidas (Visão geral, 21 pessoas)', (await activeCls()) === 'todas' && (await rows()) === 21 && (await unitVal()) === UNIT && (await activeTab()).startsWith('Visão geral') && (await page.locator('[data-testid="btn-limpar-filtros"]').count()) === 0, `rows=${await rows()} unit=${await unitVal()}`)
// 8. período (aba Visitante)
await tab('Visitante'); await page.locator('button:has-text("Todos")').first().click(); await settle()
ck('aba Visitante → período "Todos": 12 visitantes, sem p_created_from', (await rows()) === 12 && !last('page').p_created_from, `rows=${await rows()}`)
await page.locator('button:has-text("7 dias")').first().click(); await settle()
ck('período "7 dias": p_created_from enviado (lista 6 recentes)', !!last('page').p_created_from && (await rows()) === 6, `from=${last('page').p_created_from}`)
// 9. busca + classificação
await click('classificacao-member', 1200); await page.locator('input[placeholder^="Buscar"]').fill('sidney'); await page.waitForTimeout(1200)
ck('busca "sidney" dentro de Membros: 1 resultado, p_search enviado, classificação mantida', (await rows()) === 1 && last('page').p_search === 'sidney' && last('page').p_classification === 'member', `rows=${await rows()}`)
await page.locator('input[placeholder^="Buscar"]').fill(''); await page.waitForTimeout(1000)
// 11. CSV respeita os filtros
await page.evaluate(() => { window.__csv = [] }); await click('btn-exportar-csv', 1500); await page.waitForFunction(() => window.__csv.length > 0, null, { timeout: 5000 }).catch(() => {})
const csv = await page.evaluate(() => window.__csv[0] || '')
ck('CSV: export_people_rows recebe p_classification=member + p_unit_id da unidade; 5 linhas de membros', last('export').p_classification === 'member' && last('export').p_unit_id === UNIT && csv.split('\n').filter(l => l.trim()).length === 6, `linhas=${csv.split('\n').filter(l => l.trim()).length}`)
// 10. paginação: page size real (50) → com 21 não pagina; simula p_limit respeitado e offset ao trocar de página
await click('classificacao-todas', 1000)
ck('paginação: p_limit = 50 e p_offset = 0 na primeira página; 21 < 50 → sem paginação', last('page').p_limit === 50 && last('page').p_offset === 0 && (await page.locator('button[title="Próxima página"]').count()) === 0)
// 12. chips continuam sendo totais da unidade (não mudam com estado/busca)
await click('estado-atendida', 900)
ck('chips NÃO mudam com o estado (continuam totais da unidade 12/5/4) e o cabeçalho mostra o filtrado (Atendida em Visão geral = 7 pessoas)', (await txt('[data-testid="classificacao-member"]')) === 'Membros (5)' && (await txt('[data-testid="classificacao-visitor"]')) === 'Visitantes (12)' && (await header()).startsWith('7 pessoas') && (await rows()) === 7, await header())
await click('estado-todos', 900)
// 15. troca de unidade: chips e lista acompanham; classificação preservada
await unitSel().selectOption(U1); await page.waitForTimeout(1200)
ck('troca de unidade (Central): chips 1/1/1, lista 3, RPC com a nova unidade — nada vaza entre unidades', (await txt('[data-testid="classificacao-visitor"]')) === 'Visitantes (1)' && (await rows()) === 3 && last('page').p_unit_id === U1, `rows=${await rows()}`)
ck('todas as RPCs da sessão foram chamadas para a igreja do token (isolamento multitenant no front)', rpcCalls.every(c => !c.body.p_church_id || c.body.p_church_id === CH))
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await page.screenshot({ path: 'pessoas-filtros.png', fullPage: false })
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
