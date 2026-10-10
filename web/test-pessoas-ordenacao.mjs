import { chromium } from 'playwright';
/**
 * test-pessoas-ordenacao.mjs — item 23 (ata IGV): ordenação por coluna em Pessoas.
 * Clique no cabeçalho: sem ordem → crescente → decrescente → padrão; espelhada na URL (?ordem=&dir=);
 * volta à 1ª página; sobrevive a Atender → Voltar; valores inválidos na URL são ignorados.
 * Backend simulado; zero requisições à produção.
 */


const BASE = 'http://localhost:5173';
let UNITS_DELAY = 0 // simula a lista de unidades chegando depois (selectedUnit='all' + isLoading=true → unidade da URL + isLoading=false)
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
      if (UNITS_DELAY) await new Promise(r => setTimeout(r, UNITS_DELAY))
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
const CLS4 = { classification: 'visitor', roles: [], stage_key: 'visitante', stage_name: 'Visitante', condition: null, is_leader: false, is_volunteer: false, label: 'Visitante' }
const N = 130
const rpcCalls = []
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  const q = new URL(u); const pid = (q.searchParams.get('person_id') || q.searchParams.get('id') || '').replace('eq.', '')
  if (u.includes('/rest/v1/people')) return F(json({ id: pid, church_id: CH, name: 'Pessoa ' + pid, phone: '5521999990000', email: null, person_stage: 'visitante', created_at: '2026-01-01T00:00:00Z' }))
  if (u.includes('/rest/v1/person_journey')) return F(json((r.request().headers()['accept'] || '').includes('object') ? null : []))
  if (u.includes('/rest/v1/pipeline_stages')) return F(json([{ id: 'stage-visit', name: 'Visitante', order_index: 1 }]))
  if (u.includes('/rest/v1/journey_events')) return F(json([]))
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  if (u.includes('get_person_contacts') || u.includes('get_person_timeline')) return F(json([]))
  if (u.includes('journey_suggest_stage')) return F(json(null))
  if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (u.includes('get_people_stage_counts')) return F(json({ total: N, aniversarios: 0, sem_etapa: 0, stages: [], classificacao: { visitor: N, member: 0, none: 0, member_only: 0, leader: 0, volunteer: 0, leader_volunteer: 0 } }))
  if (u.includes('get_care_status_counts')) return F(json({ nao_atendida: N, em_atendimento: 0, atendida: 0, cancelado: 0, total: N, sem_contato_48h: 0, alert_threshold_hours: 48 }))
  if (u.includes('get_people_page')) {
    rpcCalls.push({ fn: 'page', body })
    const off = body.p_offset || 0, lim = body.p_limit || 50
    let order = Array.from({ length: N }, (_, i) => i)   // padrão: cadastro mais recente primeiro (índice crescente = nome crescente no mock)
    if (body.p_sort_by === 'nome' || body.p_sort_by === 'telefone' || body.p_sort_by === 'contatos' || body.p_sort_by === 'atendimento') { if (body.p_sort_dir === 'desc') order = order.reverse() }
    if (body.p_sort_by === 'cadastro') { if (body.p_sort_dir !== 'desc') order = order.reverse() }
    const rows = order.slice(off, off + lim).map(i => ({ ...MOCK_PEOPLE[0], id: 'q' + i, name: `Pessoa ${String(i + 1).padStart(3, '0')}`, person_pipeline: [], unit_id: null, care_state: 'nao_atendida', care_alert: false, classification: CLS4 }))
    return F(json(rows.map(x => ({ row_data: x, total_count: N }))))
  }
  if (u.includes('get_contact_counts')) return F(json([]))
  if (u.includes('person_classification')) return F(json(CLS4))
  return false
}
const lastPage = () => [...rpcCalls].reverse().find(c => c.fn === 'page')?.body
const page = await ctx.newPage(); const errs = []
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch') && !/status of (400|403|404|406)/.test(m.text())) errs.push(m.text()) })
await page.setViewportSize({ width: 1400, height: 900 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break } catch { await page.waitForTimeout(500) } }
const U1 = '11111111-1111-4111-8111-111111111111', U2 = '22222222-2222-4222-8222-222222222222'
const go = async (qs) => { await page.goto(`${BASE}/pessoas?tab=geral${qs}`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1800) }
const pg = () => new URL(page.url()).searchParams.get('pagina')
const first = async () => (await page.locator('table tbody tr').first().innerText()).replace(/\s+/g, ' ').slice(0, 40)
const label = async () => (await page.locator('text=/Página \\d+ de \\d+/').first().innerText()).trim()
const nrows = () => page.locator('table tbody tr').count()
const next = () => page.locator('button[title="Próxima página"]'), prev = () => page.locator('button[title="Página anterior"]')
const atenderEVolta = async () => { await page.locator('table tbody tr').first().locator('button[title="Atender"]').first().click(); await page.waitForTimeout(1500); const ok = /\/atendimento/.test(page.url()); await page.goBack(); await page.waitForTimeout(2000); return ok }

// ── Ordenação por coluna ─────────────────────────────────────
const sortBtn = (k) => page.locator(`[data-testid="ordenar-${k}"]`)
const th = (k) => sortBtn(k).locator('xpath=ancestor::th')
const lastBody = () => lastPage()
await go('&unidade=none')
ck('cabeçalhos ordenáveis: Nome, Telefone, Atendimento, Contatos, Cadastro (Classificação só filtra)',
  (await page.locator('[data-testid^="ordenar-"]').count()) === 5 && (await page.locator('th:has-text("Classificação") button').count()) === 0)
ck('padrão: sem p_sort_by na consulta e sem ordem na URL', lastBody()?.p_sort_by === undefined && new URL(page.url()).searchParams.get('ordem') === null)

await sortBtn('nome').click(); await page.waitForTimeout(1200)
let u = new URL(page.url()).searchParams
ck('Nome ▲: consulta p_sort_by=nome/asc, URL ?ordem=nome, aria-sort ascending, 1ª linha Pessoa 001',
  lastBody()?.p_sort_by === 'nome' && lastBody()?.p_sort_dir === 'asc' && u.get('ordem') === 'nome' && u.get('dir') === null && (await th('nome').getAttribute('aria-sort')) === 'ascending' && (await first()).includes('Pessoa 001'))
await sortBtn('nome').click(); await page.waitForTimeout(1200)
u = new URL(page.url()).searchParams
ck('Nome ▼: p_sort_dir=desc, URL dir=desc, aria-sort descending, 1ª linha Pessoa 130',
  lastBody()?.p_sort_dir === 'desc' && u.get('dir') === 'desc' && (await th('nome').getAttribute('aria-sort')) === 'descending' && (await first()).includes('Pessoa 130'))
await sortBtn('nome').click(); await page.waitForTimeout(1200)
u = new URL(page.url()).searchParams
// (a consulta padrão já está em cache, então não há nova chamada: valida URL, indicador e a lista exibida)
ck('3º clique volta à ordem padrão (sem ordem/dir na URL, indicador neutro, lista na ordem padrão)', (await first()).includes('Pessoa 001') && u.get('ordem') === null && u.get('dir') === null && (await th('nome').getAttribute('aria-sort')) === 'none')

// ordenar volta à 1ª página
await go('&unidade=none&pagina=2')
await sortBtn('cadastro').click(); await page.waitForTimeout(1200)
ck('ordenar a partir da página 2 volta à página 1 (offset 0, sem pagina na URL)', lastBody()?.p_offset === 0 && new URL(page.url()).searchParams.get('pagina') === null && lastBody()?.p_sort_by === 'cadastro')

// link direto e atualizar
await go('&unidade=none&ordem=telefone&dir=desc')
ck('link direto ?ordem=telefone&dir=desc: consulta e indicador corretos', lastBody()?.p_sort_by === 'telefone' && lastBody()?.p_sort_dir === 'desc' && (await th('telefone').getAttribute('aria-sort')) === 'descending')
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
ck('atualizar (F5) mantém a ordenação', lastBody()?.p_sort_by === 'telefone' && new URL(page.url()).searchParams.get('ordem') === 'telefone')

// inválidos
await go('&unidade=none&ordem=senha&dir=xyz')
ck('ordem inválida na URL é ignorada (sem p_sort_by)', lastBody()?.p_sort_by === undefined)
await go('&unidade=none&ordem=classificacao')
ck('"classificacao" não é ordenável: ignorada (sem p_sort_by)', lastBody()?.p_sort_by === undefined)

// combina com filtros e com paginação; Atender → Voltar
await go('&unidade=none&ordem=nome&dir=desc&pagina=2&estado=nao_atendida')
const antes = Object.fromEntries(new URL(page.url()).searchParams)
ck('ordenação + filtro de estado + página 2 na mesma consulta', lastBody()?.p_sort_by === 'nome' && lastBody()?.p_sort_dir === 'desc' && lastBody()?.p_care_status === 'nao_atendida' && lastBody()?.p_offset === 50, JSON.stringify({ s: lastBody()?.p_sort_by, c: lastBody()?.p_care_status, o: lastBody()?.p_offset }))
await page.locator('table tbody tr').first().locator('button[title="Atender"]').first().click(); await page.waitForTimeout(1500)
await page.goBack(); await page.waitForTimeout(2000)
ck('Atender → Voltar devolve a mesma URL (ordem, filtro e página)', JSON.stringify(Object.fromEntries(new URL(page.url()).searchParams)) === JSON.stringify(antes) && lastBody()?.p_sort_by === 'nome', page.url().split('?')[1])
await page.locator('[data-testid="estado-todos"]').click(); await page.waitForTimeout(1200)
ck('trocar o filtro mantém a ordenação e volta à página 1', lastBody()?.p_sort_by === 'nome' && lastBody()?.p_offset === 0 && new URL(page.url()).searchParams.get('ordem') === 'nome')

// troca real de unidade mantém a ordem escolhida
await page.locator('select[aria-label="Unidade"]:visible').first().selectOption(U2); await page.waitForTimeout(1500)
ck('trocar de unidade mantém a coluna ordenada e volta à página 1', lastBody()?.p_sort_by === 'nome' && lastBody()?.p_unit_id === U2 && lastBody()?.p_offset === 0)

ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
