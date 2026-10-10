import { chromium } from 'playwright';
/**
 * test-pessoas-contexto.mjs — contexto da lista de Pessoas (filtros na URL): Atender → Voltar preserva tudo. Zero requisições à produção.
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
// ── Mock: classificação única (Release 1). Backend simulado; regras simuladas como no banco. ──
const CLS = {
  p1: { classification: 'member',  roles: [{ role: 'leader', basis: 'ministry_leader', ref_id: 'm1', ref_name: 'Louvor' }, { role: 'volunteer', basis: 'volunteer_active', ref_id: 'v1', ref_name: 'Louvor' }], stage_key: 'membro', stage_name: 'Membro', condition: null },
  p2: { classification: 'member',  roles: [{ role: 'volunteer', basis: 'volunteer_active', ref_id: 'v2', ref_name: 'Mídia' }], stage_key: 'membro', stage_name: 'Membro', condition: null },
  p3: { classification: 'member',  roles: [], stage_key: 'membro_afastado', stage_name: 'Membro afastado', condition: 'afastado' },
  p4: { classification: 'visitor', roles: [], stage_key: 'visitante', stage_name: 'Visitante', condition: null },
  p5: { classification: null,      roles: [], stage_key: null, stage_name: null, condition: null },
  p6: { classification: 'member',  roles: [{ role: 'leader', basis: 'cell_co_leader', ref_id: 'g1', ref_name: 'Célula Norte' }], stage_key: 'membro', stage_name: 'Membro', condition: null },
}
const labelOf = (c) => c.classification === 'member' ? (c.roles.some(r => r.role === 'leader') ? 'Membro · Líder' : c.roles.some(r => r.role === 'volunteer') ? 'Membro · Voluntário' : 'Membro') : c.classification === 'visitor' ? 'Visitante' : 'Não classificado'
const full = (id) => ({ ...CLS[id], is_leader: CLS[id].roles.some(r => r.role === 'leader'), is_volunteer: CLS[id].roles.some(r => r.role === 'volunteer'), label: labelOf(CLS[id]) })
const inRole = (id, role) => { const c = CLS[id]; if (c.classification !== 'member') return false; const L = c.roles.some(r => r.role === 'leader'), V = c.roles.some(r => r.role === 'volunteer')
  return role === 'member_only' ? !L && !V : role === 'leader' ? L : role === 'volunteer' ? V : role === 'leader_volunteer' ? L && V : true }
const universe = (b) => Object.keys(CLS).filter(id => (!b.p_classification || (b.p_classification === 'none' ? CLS[id].classification === null : CLS[id].classification === b.p_classification)) && (!b.p_role || inRole(id, b.p_role)))
const rpcCalls = []
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  const q = new URL(u); const pid = (q.searchParams.get('person_id') || q.searchParams.get('id') || '').replace('eq.', '')
  if (u.includes('/rest/v1/people')) { const c = CLS[pid]; return F(json(c ? { id: pid, church_id: CH, name: 'Pessoa ' + pid, first_name: null, last_name: null, phone: '5521999990000', email: null, neighborhood: null, city: null, birth_date: null, como_conheceu: null, marital_status: null, first_visit_date: null, conversion_date: null, person_stage: null, celula_id: null, responsible_id: null, observacoes_pastorais: null, avatar_url: null } : null, c ? 200 : 406)) }
  if (u.includes('/rest/v1/person_journey')) return F(json((r.request().headers()['accept'] || '').includes('object') ? null : []))
  if (u.includes('/rest/v1/pipeline_stages')) return F(json([{ id: 'stage-visit', name: 'Visitante', order_index: 1 }, { id: 'stage-membro', name: 'Membro', order_index: 5 }]))
  if (u.includes('/rest/v1/journey_events')) return F(json([]))
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  if (u.includes('get_person_contacts') || u.includes('get_person_timeline')) return F(json([]))
  if (u.includes('journey_suggest_stage')) return F(json(null))
  if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (u.includes('get_people_stage_counts')) return F(json({ total: 6, aniversarios: 0, sem_etapa: 1, stages: [{ stage_id: 'stage-membro', stage_key: 'membro', name: 'Membro', order_index: 5, cnt: 4 }],
    classificacao: { visitor: 1, member: 4, none: 1, member_only: 1, leader: 2, volunteer: 2, leader_volunteer: 1 } }))
  if (u.includes('get_care_status_counts')) { rpcCalls.push({ fn: 'counts', body }); return F(json({ nao_atendida: 6, em_atendimento: 0, atendida: 0, cancelado: 0, total: universe(body).length, sem_contato_48h: 0, alert_threshold_hours: 48 })) }
  if (u.includes('get_people_page')) { rpcCalls.push({ fn: 'page', body }); const ids = universe(body); const rows = ids.map(id => ({ ...MOCK_PEOPLE[0], id, name: `Pessoa ${id}`, person_pipeline: [], unit_id: null, care_state: 'nao_atendida', care_alert: false, classification: full(id) })); return F(json(rows.map(x => ({ row_data: x, total_count: rows.length })))) }
  if (u.includes('get_contact_counts')) return F(json([]))
  if (u.includes('person_set_classification')) {
    rpcCalls.push({ fn: 'set_classification', body })
    if (!body.p_confirmed) return F(json({ code: 'P0001', message: 'CONFIRMATION_REQUIRED' }, 400))
    if (body.p_person_id === 'p1' && body.p_value !== 'member') return F(json({ code: 'P0001', message: 'HAS_ROLES: [{"role":"leader","basis":"ministry_leader","ref_id":"m1","ref_name":"Louvor"},{"role":"volunteer","basis":"volunteer_active","ref_id":"v1","ref_name":"Louvor"}]' }, 400))
    if (body.p_person_id === 'p4' && body.p_value === 'none') return F(json({ code: '42501', message: 'FORBIDDEN: sem permissão para classificar esta pessoa' }, 403))
    CLS[body.p_person_id].classification = body.p_value === 'none' ? null : body.p_value
    return F(json({ ...full(body.p_person_id), changed: true, person_id: body.p_person_id }))
  }
  if (u.includes('person_set_stage')) { rpcCalls.push({ fn: 'set_stage', body }); if (body.p_person_id === 'p4' && body.p_stage_id === 'stage-membro') return F(json({ code: 'P0001', message: 'CLASSIFICATION_REQUIRED: a etapa "Membro" é só para Membro' }, 400)); return F(json({ ...full(body.p_person_id), changed: true })) }
  if (u.includes('person_classification')) return F(json(full(body.p_person_id)))
  if (u.includes('export_people_rows')) { rpcCalls.push({ fn: 'export', body }); const ids = universe(body); return F(json({ total: ids.length, max_contacts: 0, alert_threshold_hours: 48, rows: ids.map(id => ({ id, name: `Pessoa ${id}`, phone: null, email: null, etapa: CLS[id].stage_name, care_state: 'nao_atendida', care_alert: false, unit_id: null, unit_name: null, first_visit_date: null, created_at: '2026-09-01T12:00:00Z', source: 'manual', ministerios: '', contacts_count: 0, contacts: [], classification: full(id) })) })) }
  return false
}
// ── Contexto da lista de Pessoas preservado ao ir ao Atendimento e voltar (filtros espelhados na URL) ──
const lastPage = () => [...rpcCalls].reverse().find(c => c.fn === 'page')?.body
const page = await ctx.newPage(); const errs = []
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch') && !/status of (400|403|404|406)/.test(m.text())) errs.push(m.text()) })
await page.setViewportSize({ width: 1400, height: 900 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {})
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break } catch { await page.waitForTimeout(500) } }
await page.goto(`${BASE}/pessoas?tab=geral&unidade=none`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1500)
const isOn = async (tid) => ((await page.locator(`[data-testid="${tid}"]`).getAttribute('class')) || '').includes('border-primary')

await page.locator('[data-testid="classificacao-member"]').click(); await page.waitForTimeout(900)
await page.locator('[data-testid="estado-nao_atendida"]').click(); await page.waitForTimeout(900)
await page.locator('input[placeholder^="Buscar"]').fill('Pessoa'); await page.waitForTimeout(1000)
await page.locator('select').filter({ has: page.locator('option', { hasText: 'Importação' }) }).first().selectOption('manual'); await page.waitForTimeout(900)
const u1 = new URL(page.url()).searchParams
ck('filtros espelhados na URL (cls, estado, q, origem) e unidade preservada', u1.get('cls') === 'member' && u1.get('estado') === 'nao_atendida' && u1.get('q') === 'Pessoa' && u1.get('origem') === 'manual' && u1.get('unidade') === 'none', page.url().split('?')[1])

// Atender → Voltar
const row = page.locator('table tbody tr').first(); await row.locator('button[title="Atender"]').first().click(); await page.waitForTimeout(1500)
ck('Atender abre /pessoas/:id/atendimento', /\/pessoas\/[^/]+\/atendimento/.test(page.url()), page.url())
await page.goBack(); await page.waitForTimeout(1800)
ck('Voltar: classificação Membros continua ativa', await isOn('classificacao-member'))
ck('Voltar: estado "Não atendida" continua ativo', await isOn('estado-nao_atendida'))
ck('Voltar: busca e origem preservadas', (await page.locator('input[placeholder^="Buscar"]').inputValue()) === 'Pessoa' && (await page.locator('select').filter({ has: page.locator('option', { hasText: 'Importação' }) }).first().inputValue()) === 'manual')
const lp = lastPage()
ck('Voltar: a consulta usa exatamente os mesmos filtros e a mesma unidade', lp?.p_classification === 'member' && lp?.p_care_status === 'nao_atendida' && lp?.p_search === 'Pessoa' && lp?.p_source === 'manual' && lp?.p_unit_id === 'none', JSON.stringify({ c: lp?.p_classification, s: lp?.p_care_status, q: lp?.p_search, o: lp?.p_source, u: lp?.p_unit_id }))
ck('Voltar: unidade continua "Sem unidade definida" na URL', new URL(page.url()).searchParams.get('unidade') === 'none')

// Limpar filtros esvazia a URL; filtros inválidos na URL são ignorados
await page.locator('[data-testid="classificacao-todas"]').click(); await page.locator('[data-testid="estado-todos"]').click(); await page.locator('input[placeholder^="Buscar"]').fill(''); await page.waitForTimeout(1000)
const u2 = new URL(page.url()).searchParams
ck('limpar filtros remove os parâmetros da URL', !u2.has('cls') && !u2.has('estado') && !u2.has('q') && u2.get('origem') === 'manual')
await page.goto(`${BASE}/pessoas?tab=geral&unidade=none&cls=valor_invalido&estado=xyz&origem=xx&de=2026-13-99&pagina=abc`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1500)
const lp2 = lastPage()
ck('parâmetros inválidos na URL são ignorados (sem filtro oculto)', !lp2?.p_classification && !lp2?.p_care_status && !lp2?.p_source && !lp2?.p_created_from && lp2?.p_offset === 0, JSON.stringify(lp2 && { c: lp2.p_classification, s: lp2.p_care_status, o: lp2.p_source, off: lp2.p_offset }))
// Paginação mantida no retorno
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close()
const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
