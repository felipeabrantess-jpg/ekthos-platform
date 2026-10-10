import { chromium } from 'playwright';
/**
 * test-pessoas-paginacao.mjs - a pagina (?pagina=N) sobrevive a Atender, Voltar, atualizar e link direto; reseta so em mudanca real de unidade ou filtro.
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
    const rows = Array.from({ length: N }, (_, i) => i).slice(off, off + lim).map(i => ({ ...MOCK_PEOPLE[0], id: 'q' + i, name: `Pessoa ${String(i + 1).padStart(3, '0')}`, person_pipeline: [], unit_id: null, care_state: 'nao_atendida', care_alert: false, classification: CLS4 }))
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

// A. link direto
await go(`&unidade=none&pagina=2`)
ck('A: ?pagina=2 abre a página 2 (offset 50, rótulo, 1ª linha, URL, 50 linhas)', lastPage()?.p_offset === 50 && /Página 2 de 3/.test(await label()) && (await first()).includes('Pessoa 051') && pg() === '2' && (await nrows()) === 50, `${lastPage()?.p_offset} ${await label()} ${await first()} ${pg()}`)
// B. atualizar
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
ck('B: atualizar mantém a página 2', pg() === '2' && /Página 2 de 3/.test(await label()) && (await first()).includes('Pessoa 051'))
// C. página 2 → Atender → Voltar
ck('C: Atender abre o atendimento', await atenderEVolta())
ck('C: Voltar restaura a página 2 (URL, offset, linhas)', pg() === '2' && lastPage()?.p_offset === 50 && /Página 2 de 3/.test(await label()) && (await first()).includes('Pessoa 051'), `${pg()} ${lastPage()?.p_offset}`)
// D/H. última página → Atender → Voltar
await go(`&unidade=none&pagina=3`)
ck('D/H: última página tem 30 linhas e "Próxima" desabilitada', pg() === '3' && (await nrows()) === 30 && await next().isDisabled() && /Página 3 de 3/.test(await label()))
await atenderEVolta()
ck('D: Voltar restaura a página 3', pg() === '3' && (await nrows()) === 30 && /Página 3 de 3/.test(await label()))
// G. Próxima / Anterior
await go(`&unidade=none`)
ck('G: sem pagina na URL = página 1', pg() === null && /Página 1 de 3/.test(await label()) && await prev().isDisabled())
await next().click(); await page.waitForTimeout(1200)
ck('G: Próxima → página 2 (URL e linhas)', pg() === '2' && (await first()).includes('Pessoa 051'))
await next().click(); await page.waitForTimeout(1200)
ck('G: Próxima → página 3', pg() === '3' && (await nrows()) === 30)
await prev().click(); await page.waitForTimeout(1200); await prev().click(); await page.waitForTimeout(1200)
ck('G: Anterior ×2 → página 1 sem parâmetro', pg() === null && (await first()).includes('Pessoa 001'))
// E. troca real de unidade reseta
await go(`&unidade=${U1}&pagina=3`)
ck('E: abre a página 3 da unidade 1', pg() === '3' && lastPage()?.p_unit_id === U1)
await page.locator('select[aria-label="Unidade"]:visible').first().selectOption(U2); await page.waitForTimeout(1500)
ck('E: trocar de unidade volta à página 1 (URL e consulta)', pg() === null && lastPage()?.p_offset === 0 && lastPage()?.p_unit_id === U2 && new URL(page.url()).searchParams.get('unidade') === U2, `${pg()} ${lastPage()?.p_offset}`)
// F. mudança de filtro reseta
await go(`&unidade=none&pagina=2`)
await page.locator('[data-testid="estado-nao_atendida"]').click(); await page.waitForTimeout(1200)
ck('F: alterar estado volta à página 1', pg() === null && lastPage()?.p_offset === 0 && lastPage()?.p_care_status === 'nao_atendida')
await go(`&unidade=none&pagina=2`)
await page.locator('input[placeholder^="Buscar"]').fill('Pessoa'); await page.waitForTimeout(1200)
ck('F: digitar na busca volta à página 1', pg() === null && lastPage()?.p_offset === 0 && lastPage()?.p_search === 'Pessoa')
// Filtros combinados + página, direto e Atender → Voltar
await go(`&unidade=${U2}&cls=visitor&estado=nao_atendida&origem=qr_code&q=Pessoa&de=2026-01-01&ate=2026-12-31&pagina=3`)
const lp = lastPage()
ck('combinado: consulta mantém todos os filtros e a página 3', lp?.p_unit_id === U2 && lp?.p_classification === 'visitor' && lp?.p_care_status === 'nao_atendida' && lp?.p_source === 'qr_code' && lp?.p_search === 'Pessoa' && !!lp?.p_created_from && lp?.p_offset === 100, JSON.stringify(lp && { u: lp.p_unit_id, c: lp.p_classification, s: lp.p_care_status, o: lp.p_source, q: lp.p_search, f: lp.p_created_from, off: lp.p_offset }))
const antes = Object.fromEntries(new URL(page.url()).searchParams)
await atenderEVolta()
const depois = Object.fromEntries(new URL(page.url()).searchParams)
ck('combinado: Atender → Voltar devolve exatamente a mesma URL e a página 3', JSON.stringify(antes) === JSON.stringify(depois) && lastPage()?.p_offset === 100, JSON.stringify(depois))
// ── Reload frio / carregamento lento da lista de unidades: a unidade passa de 'all' (carregando) para a da URL ──
UNITS_DELAY = 1500
await go(`&unidade=${U2}&pagina=2`)
ck('J1: link direto com unidades lentas mantém a página 2 e a unidade', pg() === '2' && lastPage()?.p_offset === 50 && /Página 2 de 3/.test(await label()) && new URL(page.url()).searchParams.get('unidade') === U2, `${pg()} ${lastPage()?.p_offset} ${await label()}`)
await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(3000)
ck('J2: F5 com unidades lentas mantém a página 2', pg() === '2' && lastPage()?.p_offset === 50 && /Página 2 de 3/.test(await label()), `${pg()} ${lastPage()?.p_offset}`)
await go(`&unidade=${U1}&cls=visitor&estado=nao_atendida&origem=qr_code&q=Pessoa&de=2026-01-01&ate=2026-12-31&pagina=3`)
await page.waitForTimeout(1500)
const lq = lastPage()
ck('J3: filtros combinados + página 3 sobrevivem ao carregamento lento', pg() === '3' && lq?.p_offset === 100 && lq?.p_unit_id === U1 && lq?.p_search === 'Pessoa' && lq?.p_care_status === 'nao_atendida', JSON.stringify({ p: pg(), off: lq?.p_offset, u: lq?.p_unit_id }))
await page.locator('select[aria-label="Unidade"]:visible').first().selectOption(U2); await page.waitForTimeout(2500)
ck('J4: depois de resolvido, trocar a unidade ainda volta à página 1', pg() === null && lastPage()?.p_offset === 0 && lastPage()?.p_unit_id === U2, `${pg()} ${lastPage()?.p_offset}`)
await next().click(); await page.waitForTimeout(1200)
ck('J5: Próxima continua funcionando após o carregamento lento', pg() === '2')
UNITS_DELAY = 0
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
