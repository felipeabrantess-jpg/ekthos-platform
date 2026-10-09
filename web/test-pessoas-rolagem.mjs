import { chromium } from 'playwright';
/**
 * test-pessoas-rolagem.mjs — rolagem horizontal da tabela de Pessoas: trilho fixo na base da área visível, sincronizado (uma barra só).
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
// ── Mock: 50 pessoas (tabela alta) com nomes longos (tabela larga) ──
const ROWS = Array.from({ length: 50 }, (_, i) => ({ ...MOCK_PEOPLE[0], id: `r${i}`, name: `Pessoa Número ${i + 1} Com Nome Bastante Comprido Para Alargar`, phone: `55219999${String(i).padStart(5, '0')}`, email: `pessoa${i}@exemplo-dominio-longo.com.br`, person_pipeline: [{ stage_id: 'stage-membro', last_activity_at: '2026-08-01T00:00:00Z', entered_at: '2026-08-01T00:00:00Z', pipeline_stages: { id: 'stage-membro', name: 'Membro', slug: 'membro', order_index: 1, color: '#3B82F6' } }], care_state: 'em_atendimento', care_alert: false, classification: { classification: 'member', source: 'validated', roles: [{ role: 'leader', basis: 'ministry_leader', ref_id: 'm', ref_name: 'Louvor' }], is_leader: true, is_volunteer: false, stage_key: 'membro', stage_name: 'Membro', condition: null, label: 'Membro · Líder' } }))
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (u.includes('get_people_page')) { const rows = body.p_stage_key && body.p_stage_key !== 'membro' ? [] : ROWS.slice(body.p_offset || 0, (body.p_offset || 0) + (body.p_limit || 50)); return F(json(rows.map(x => ({ row_data: x, total_count: ROWS.length })))) }
  if (u.includes('get_people_stage_counts')) return F(json({ total: 50, aniversarios: 0, sem_etapa: 0, stages: [{ stage_id: 'stage-membro', stage_key: 'membro', name: 'Membro', order_index: 5, cnt: 50 }], classificacao: { visitor: 0, member: 50, none: 0, member_only: 0, leader: 50, volunteer: 0, leader_volunteer: 0 } }))
  if (u.includes('get_care_status_counts')) return F(json({ nao_atendida: 0, em_atendimento: 50, atendida: 0, cancelado: 0, total: 50, sem_contato_48h: 0, alert_threshold_hours: 48 }))
  if (u.includes('get_contact_counts')) return F(json((body.p_person_ids || []).map(id => ({ person_id: id, cnt: 3 }))))
  return false
}
const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch')) errs.push(m.text()); });
await page.setViewportSize({ width: 1100, height: 700 })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break; } catch { await page.waitForTimeout(500); } }
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1500)

const state = () => page.evaluate(() => {
  const main = document.querySelector('main'); const rail = document.querySelector('[data-testid="sticky-hscroll"]'); const content = document.querySelector('[data-testid="sticky-hscroll-content"]')
  const mr = main.getBoundingClientRect(); const rr = rail?.getBoundingClientRect()
  return { rail: !!rail, railVisibleInMain: !!rr && rr.bottom <= mr.bottom + 1 && rr.top >= mr.top && rr.height > 0, railBottomGap: rr ? Math.round(mr.bottom - rr.bottom) : null,
    contentScrollLeft: content.scrollLeft, railScrollLeft: rail?.scrollLeft ?? null, overflow: content.scrollWidth - content.clientWidth,
    mainScrollTop: main.scrollTop, mainMax: main.scrollHeight - main.clientHeight, nativeBarHidden: getComputedStyle(content).scrollbarWidth === 'none', rows: document.querySelectorAll('table tbody tr').length }
})
let s = await state()
ck('tabela larga: overflow horizontal > 0, barra nativa oculta, trilho fixo presente e visível na base da área útil (topo da página)', s.overflow > 50 && s.nativeBarHidden && s.rail && s.railVisibleInMain && s.railBottomGap === 0 && s.rows === 50, JSON.stringify(s))
// meio e fim da página
await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = Math.round((m.scrollHeight - m.clientHeight) / 2) }); await page.waitForTimeout(300)
s = await state(); ck('meio da página: trilho continua colado à base da área visível', s.mainScrollTop > 100 && s.railVisibleInMain && s.railBottomGap === 0, JSON.stringify({ top: s.mainScrollTop, gap: s.railBottomGap }))
await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTop = m.scrollHeight }); await page.waitForTimeout(300)
s = await state(); ck('fim da página: trilho visível (na base da tabela ou da área útil), sem segunda barra', s.railVisibleInMain, JSON.stringify({ top: s.mainScrollTop, max: s.mainMax, gap: s.railBottomGap }))
// sincronização trilho → tabela (direita) e tabela → trilho (esquerda)
await page.evaluate(() => { document.querySelector('main').scrollTop = 200 }); await page.waitForTimeout(200)
await page.evaluate(() => { const r = document.querySelector('[data-testid="sticky-hscroll"]'); r.scrollLeft = Math.min(180, r.scrollWidth - r.clientWidth) }); await page.waitForTimeout(300)
s = await state(); ck('mover o trilho para a direita move a tabela (mesmo scrollLeft nos dois, > 100)', s.railScrollLeft > 100 && s.contentScrollLeft === s.railScrollLeft, JSON.stringify({ rail: s.railScrollLeft, content: s.contentScrollLeft }))
await page.evaluate(() => { document.querySelector('[data-testid="sticky-hscroll-content"]').scrollLeft = 40 }); await page.waitForTimeout(300)
s = await state(); ck('mover a tabela (ex.: shift+roda) para a esquerda move o trilho (40 nos dois)', s.railScrollLeft === 40 && s.contentScrollLeft === 40, JSON.stringify({ rail: s.railScrollLeft, content: s.contentScrollLeft }))
await page.mouse.move(500, 400); await page.keyboard.down('Shift'); await page.mouse.wheel(0, 120); await page.keyboard.up('Shift'); await page.waitForTimeout(300)
s = await state(); ck('shift + roda do mouse sobre a tabela rola horizontalmente e o trilho acompanha', s.contentScrollLeft > 40 && s.railScrollLeft === s.contentScrollLeft, JSON.stringify({ rail: s.railScrollLeft, content: s.contentScrollLeft }))
// redimensionamento: largo → trilho some; estreito → volta
await page.setViewportSize({ width: 1900, height: 800 }); await page.waitForTimeout(500)
s = await state(); ck('janela larga (1900px): conteúdo cabe, trilho desaparece (sem barra inútil)', s.overflow <= 1 && !s.rail, JSON.stringify({ overflow: s.overflow, rail: s.rail }))
await page.setViewportSize({ width: 1000, height: 650 }); await page.waitForTimeout(500)
s = await state(); ck('notebook (1000px): trilho volta e fica visível na base', s.overflow > 50 && s.rail && s.railVisibleInMain, JSON.stringify({ overflow: s.overflow, rail: s.rail }))
// troca de aba (etapa vazia → tabela some → volta) e de página
await page.locator('button:has-text("Visão geral")').first().click(); await page.waitForTimeout(800)
await page.locator('[data-testid="estado-em_atendimento"]').click(); await page.waitForTimeout(800)
s = await state(); ck('após trocar filtro: trilho presente e sincronizado (scrollLeft igual)', s.rail && s.railScrollLeft === s.contentScrollLeft, JSON.stringify({ rail: s.railScrollLeft, content: s.contentScrollLeft }))
await page.locator('button[title="Próxima página"]').click().catch(() => {}); await page.waitForTimeout(800)
await page.evaluate(() => { document.querySelector('[data-testid="sticky-hscroll"]').scrollLeft = 90 }); await page.waitForTimeout(300)
s = await state(); ck('após trocar de página: trilho continua movendo a tabela', s.rail && s.railScrollLeft === 90 && s.contentScrollLeft === 90, JSON.stringify({ rail: s.railScrollLeft, content: s.contentScrollLeft }))
ck('apenas UM trilho horizontal (sem barras duplicadas)', (await page.locator('[data-testid="sticky-hscroll"]').count()) === 1)
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await page.screenshot({ path: 'pessoas-rolagem.png', fullPage: false })
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
