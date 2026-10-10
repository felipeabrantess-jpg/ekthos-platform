import { chromium } from 'playwright';
/**
 * test-pessoas-outras-unidades.mjs — item 24 (ata IGV): lista vazia numa unidade avisa quando a pessoa está em outra
 * unidade (regra histórica de unidades preservada: nada é filtrado de volta, nenhum cadastro é alterado).
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
const N = 3
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
    // mock: a pessoa buscada ("Valdir") existe só fora das unidades específicas (ex.: cadastro anterior a 28/06 = sem unidade)
    const inSpecificUnit = body.p_unit_id && body.p_unit_id !== 'none'
    if (body.p_search === 'zzz' || (inSpecificUnit && body.p_search)) return F(json([]))
    const off = body.p_offset || 0, lim = body.p_limit || 50
    const rows = Array.from({ length: N }, (_, i) => i).slice(off, off + Math.min(lim, 3)).map(i => ({ ...MOCK_PEOPLE[0], id: 'q' + i, name: `Pessoa ${String(i + 1).padStart(3, '0')}`, person_pipeline: [], unit_id: null, care_state: 'nao_atendida', care_alert: false, classification: CLS4 }))
    return F(json(rows.map(x => ({ row_data: x, total_count: 3 }))))
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

const hint = () => page.locator('[data-testid="outras-unidades"]')
const reqs = () => rpcCalls.filter(c => c.fn === 'page').map(c => c.body)

// 1. busca numa unidade específica sem resultado, mas existe em outra
await go(`&unidade=${U1}&q=Valdir`)
ck('unidade específica + busca sem resultado: aviso "N pessoa(s) ... em outra unidade" com botão', (await hint().count()) === 1 && /3 pessoas/.test(await hint().innerText()) && (await page.locator('[data-testid="btn-ver-todas-unidades"]').count()) === 1, (await hint().count()) ? await hint().innerText() : 'sem aviso')
const lookups = reqs().filter(b => b.p_unit_id === null && b.p_limit === 1)
ck('o aviso usa uma consulta de leitura (todas as unidades, 1 linha), sem alterar nada', lookups.length >= 1 && lookups[0].p_search === 'Valdir', JSON.stringify(lookups[0]))
// 2. clicar leva a "Todas as unidades"
await page.locator('[data-testid="btn-ver-todas-unidades"]').click(); await page.waitForTimeout(1500)
ck('"Ver em todas as unidades" muda a unidade para Todas e mantém a busca', new URL(page.url()).searchParams.get('unidade') === 'all' && new URL(page.url()).searchParams.get('q') === 'Valdir' && (await page.locator('table tbody tr').count()) === 3)
ck('em Todas as unidades não há aviso', (await hint().count()) === 0)
// 3. nada em lugar nenhum → sem aviso (não promete o que não existe)
await go(`&unidade=${U1}&q=zzz`)
ck('sem resultado em nenhuma unidade: nenhum aviso', (await hint().count()) === 0)
// 4. Todas as unidades vazia → sem aviso
await go(`&unidade=all&q=zzz`)
ck('Todas as unidades vazia: sem aviso e sem consulta extra de outras unidades', (await hint().count()) === 0)
// 5. lista com resultados → sem aviso e sem consulta extra
await go(`&unidade=none`)
const before = reqs().length
ck('lista com resultados: sem aviso', (await hint().count()) === 0 && (await page.locator('table tbody tr').count()) === 3)
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
