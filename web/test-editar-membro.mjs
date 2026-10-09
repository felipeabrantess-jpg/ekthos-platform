import { chromium } from 'playwright';
/**
 * test-editar-membro.mjs — Editar Membro: salvar dados cadastrais não escreve na etapa (PIPELINE_DIRECT_WRITE). Zero requisições à produção.
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
// ── Editar Membro: salvar dados cadastrais NÃO escreve na etapa; etapa só pelo fluxo autorizado e só se mudou ──
const results_ = null
const ST_M = { id: 'stage-membro', name: 'Membro', slug: 'membro', order_index: 5, color: '#3B82F6' }
const ST_V = { id: 'stage-visit', name: 'Visitante', slug: 'visitante', order_index: 1, color: '#10B981' }
const PEOPLE = { p1: { stage: ST_M, cls: 'member' }, p2: { stage: ST_M, cls: 'member' }, p3: { stage: ST_V, cls: 'visitor' }, p4: { stage: null, cls: null } }
const calls = { patch: [], rpc: [], directPipeline: [] }
let forbidStage = false
const rowOf = (id) => ({ ...MOCK_PEOPLE[0], id, name: `Pessoa ${id}`, phone: '5521999990000', city: 'Rio', state: 'RJ', unit_id: null,
  person_pipeline: PEOPLE[id].stage ? [{ stage_id: PEOPLE[id].stage.id, entered_at: '2026-01-01T00:00:00Z', last_activity_at: '2026-01-01T00:00:00Z', pipeline_stages: PEOPLE[id].stage }] : [],
  care_state: 'nao_atendida', care_alert: false,
  classification: { classification: PEOPLE[id].cls, source: PEOPLE[id].cls ? 'validated' : null, roles: [], is_leader: false, is_volunteer: false, stage_key: PEOPLE[id].stage?.slug ?? null, stage_name: PEOPLE[id].stage?.name ?? null, condition: null, label: PEOPLE[id].cls === 'member' ? 'Membro' : PEOPLE[id].cls === 'visitor' ? 'Visitante' : 'Não classificado' } })
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  const method = r.request().method()
  if (u.includes('/rest/v1/person_pipeline') && method !== 'GET') { calls.directPipeline.push({ method, body: r.request().postData() }); return F(json({ code: '42501', message: 'PIPELINE_DIRECT_WRITE: use person_set_stage' }, 403)) }
  if (u.includes('/rest/v1/pipeline_stages')) return F(json([{ ...ST_V, church_id: CH, is_active: true }, { ...ST_M, church_id: CH, is_active: true }]))
  if (u.includes('/rest/v1/people') && method === 'PATCH') { const b = JSON.parse(r.request().postData() || '{}'); calls.patch.push(b); return F(json({ id: 'p1', church_id: CH, ...b }, 200)) }
  if (u.includes('/rest/v1/people')) return F(json((r.request().headers()['accept'] || '').includes('object') ? { id: 'p1', church_id: CH, name: 'Pessoa p1' } : [], 200))
  if (u.includes('/rest/v1/person_journey') || u.includes('/rest/v1/journey_events') || u.includes('/rest/v1/ministry_members') || u.includes('/rest/v1/volunteers')) return F(json((r.request().headers()['accept'] || '').includes('object') ? null : []))
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  const fn = u.split('/rpc/')[1].split('?')[0]
  if (fn === 'get_my_tenant_context') return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (fn === 'get_people_stage_counts') return F(json({ total: 4, aniversarios: 0, sem_etapa: 1, stages: [{ stage_id: 'stage-membro', stage_key: 'membro', name: 'Membro', order_index: 5, cnt: 2 }], classificacao: { visitor: 1, member: 2, none: 1, member_only: 2, leader: 0, volunteer: 0, leader_volunteer: 0 } }))
  if (fn === 'get_care_status_counts') return F(json({ nao_atendida: 4, em_atendimento: 0, atendida: 0, cancelado: 0, total: 4, sem_contato_48h: 0, alert_threshold_hours: 48 }))
  if (fn === 'get_people_page') { const ids = Object.keys(PEOPLE); return F(json(ids.map(id => ({ row_data: rowOf(id), total_count: ids.length })))) }
  if (fn === 'get_contact_counts') return F(json([]))
  if (fn === 'person_set_stage') { calls.rpc.push({ fn, body }); return forbidStage ? F(json({ code: '42501', message: 'FORBIDDEN: sem permissão para alterar a etapa desta pessoa' }, 403)) : F(json({ person_id: body.p_person_id, changed: true })) }
  if (fn === 'person_set_classification') { calls.rpc.push({ fn, body }); return F(json({ changed: true })) }
  if (fn === 'sync_person_ministries') { calls.rpc.push({ fn, body }); return F(json({ person_id: body.p_person_id, added: [], removed: [], kept: [], skipped: [] })) }
  if (fn === 'person_classification') return F(json({ classification: PEOPLE[body.p_person_id]?.cls ?? null, roles: [] }))
  return false
}
const page = await ctx.newPage(); const errs = []
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch') && !/status of (403|406)/.test(m.text())) errs.push(m.text()) })
await page.setViewportSize({ width: 1400, height: 900 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break } catch { await page.waitForTimeout(500) } }
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1500)
const openEdit = async (id) => { const row = page.locator('table tbody tr', { hasText: `Pessoa ${id}` }).first(); await row.locator('button[title="Editar"]').first().click(); await page.waitForTimeout(900) }
const modalOpen = async () => (await page.locator('button:has-text("Salvar")').count()) > 0
const reset = () => { calls.patch.length = 0; calls.rpc.length = 0; calls.directPipeline.length = 0 }
const setCity = async (v) => { const inp = page.locator('label:has-text("Cidade") + input, label:has-text("Cidade") ~ input').first(); await inp.fill(v) }

// 1. Membro: edita cidade e salva, etapa inalterada
await openEdit('p1'); ck('modal "Editar" abre para o membro', await modalOpen())
await setCity('Niterói'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1500)
ck('Membro: salva dados cadastrais (PATCH people com a cidade nova)', calls.patch.length === 1 && calls.patch[0].city === 'Niterói', JSON.stringify(calls.patch[0] || {}).slice(0, 120))
ck('Membro: payload cadastral NÃO contém campos de pipeline (stage_id / pipeline_stage_id / person_stage)', calls.patch.every(p => !('stage_id' in p) && !('pipeline_stage_id' in p) && !('person_stage' in p)))
ck('Membro: etapa inalterada → person_set_stage NÃO é chamada e nenhuma escrita direta em person_pipeline', !calls.rpc.some(c => c.fn === 'person_set_stage') && calls.directPipeline.length === 0)
ck('Membro: modal fecha após salvar', !(await modalOpen()))

// 2. Perfil sem escopo de etapa (líder de célula): salvar dados NÃO pode falhar por FORBIDDEN da etapa
forbidStage = true
await openEdit('p2'); await setCity('Maricá'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1500)
ck('Perfil sem escopo de etapa: salva e fecha (a etapa não é reenviada)', calls.patch.length === 1 && !calls.rpc.some(c => c.fn === 'person_set_stage') && !(await modalOpen()))

// 3. Mudança LEGÍTIMA de etapa por perfil sem escopo: dados salvos, erro claro, sem escrita direta
await openEdit('p3'); await setCity('Saquarema')
const stageSel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Membro' }) }).last()
await page.locator('button:has-text("Eclesiástico")').first().click().catch(() => {}); await page.waitForTimeout(300)
const sel = page.locator('label:has-text("Etapa do discipulado") + select, label:has-text("Etapa do discipulado") ~ select').first()
await sel.selectOption('stage-membro'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1500)
ck('Mudança de etapa sem permissão: person_set_stage chamada UMA vez, dados salvos, mensagem clara, nenhuma escrita direta',
  calls.patch.length === 1 && calls.rpc.filter(c => c.fn === 'person_set_stage').length === 1 && calls.directPipeline.length === 0 && (await page.locator('text=dados cadastrais foram salvos').count()) === 1)
await page.keyboard.press('Escape'); await page.waitForTimeout(500)

// 4. Mudança legítima de etapa com permissão: usa SOMENTE person_set_stage
forbidStage = false
await openEdit('p3')
await page.locator('button:has-text("Eclesiástico")').first().click().catch(() => {}); await page.waitForTimeout(300)
await sel.selectOption('stage-membro'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1500)
const ss = calls.rpc.filter(c => c.fn === 'person_set_stage')
ck('Mudança de etapa autorizada: person_set_stage(p3, stage-membro) uma vez; sem escrita direta; modal fecha', ss.length === 1 && ss[0].body.p_person_id === 'p3' && ss[0].body.p_stage_id === 'stage-membro' && calls.directPipeline.length === 0 && !(await modalOpen()))

// 5. Não classificado (sem etapa) e Visitante: salvam sem tocar na etapa
await openEdit('p4'); await setCity('Cabo Frio'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1500)
ck('Pessoa não classificada (sem etapa): salva sem chamar person_set_stage', calls.patch.length === 1 && !calls.rpc.some(c => c.fn === 'person_set_stage') && !(await modalOpen()))
await openEdit('p3'); await setCity('Búzios'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1500)
ck('Visitante: salva sem chamar person_set_stage (etapa inalterada)', calls.patch.length === 1 && !calls.rpc.some(c => c.fn === 'person_set_stage') && !(await modalOpen()))

// 6. Alterações sucessivas: nenhuma duplicação (1 PATCH por salvamento; nenhum POST/INSERT)
await openEdit('p1'); await setCity('A'); reset()
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1200)
await openEdit('p1'); await setCity('B')
await page.locator('button:has-text("Salvar")').last().click(); await page.waitForTimeout(1200)
ck('Salvamentos sucessivos: exatamente 1 PATCH por salvamento, sem criar registros nem escrever em pipeline', calls.patch.length === 2 && calls.patch[1].city === 'B' && calls.directPipeline.length === 0 && !calls.rpc.some(c => c.fn === 'person_set_stage'))
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
