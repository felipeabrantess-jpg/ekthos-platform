/**
 * test-impersonation.mjs — fluxo de impersonação com Supabase MOCKADO (Playwright).
 * Zero requisições ao banco de produção. Prova a fiação do frontend:
 *   - tenant vem de get_my_tenant_context (backend), não do localStorage;
 *   - start → banner + seletor de unidade sem reload;
 *   - refresh mantém impersonação (contexto do backend);
 *   - localStorage forjado não tem efeito;
 *   - end → volta ao tenant original.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SUPA = 'https://mlqjywqnchilvgkbvicd.supabase.co';
const MOCK_CHURCH = '62e473b8-cd39-4da2-aa5d-c296b03d6873';
const IGV = '6c127559-874a-4748-8fce-55d4079613a5';
const ITAIPU = 'dcf2852d-e790-46dc-b66b-e8f74977a706';
const TRINDADE = 'c90fde1a-2a81-42cd-9769-f1b85a05dc2f';

const appMeta = { church_id: MOCK_CHURCH, role: 'super_admin', ekthos_roles: ['ekthos_admin'], is_ekthos_admin: true, provider: 'email' };
const FAKE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
  btoa(JSON.stringify({ sub: 'admin-user', role: 'authenticated', exp: 9999999999, iss: 'supabase', app_metadata: appMeta })).replace(/=/g, '') + '.fakesig';
const SESSION = {
  access_token: FAKE_JWT, token_type: 'bearer', expires_in: 3600, expires_at: 9999999999, refresh_token: 'r',
  user: { id: 'admin-user', aud: 'authenticated', role: 'authenticated', email: 'admin@test', app_metadata: appMeta, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
};

// ── estado "do banco" (impersonate_sessions) ─────────────────────
const state = { impersonating: false, sessionId: null, startCalls: 0, endCalls: 0 };
const ctx = () => ({
  user_id: 'admin-user',
  effective_church_id: state.impersonating ? IGV : MOCK_CHURCH,
  church_name: state.impersonating ? 'Igreja Gerando Vencedores' : 'Igreja de Teste — Mock',
  church_status: 'configured',
  jwt_church_id: MOCK_CHURCH,
  is_impersonating: state.impersonating,
  impersonation_session_id: state.impersonating ? state.sessionId : null,
  impersonation_started_at: state.impersonating ? '2026-09-24T12:00:00Z' : null,
  role: 'admin',
  is_ekthos_admin: true,
});
const effective = () => (state.impersonating ? IGV : MOCK_CHURCH);
const json = (data, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(data) });

const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok, info }); console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`); };

const people = Array.from({ length: 6 }, (_, i) => ({
  id: `p-${i}`, church_id: IGV, name: `Pessoa IGV ${i + 1}`, phone: `55219000000${i}`, email: null, person_stage: 'frequentador',
  birth_date: null, birth_month: null, birth_day: null, conversion_date: null, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  deleted_at: null, left_at: null, unit_id: i < 3 ? ITAIPU : null, source: 'manual', optout: false, person_pipeline: [], person_tags: [], acolhimento_journey: [],
}));

async function run() {
  const browser = await chromium.launch();
  const bctx = await browser.newContext();
  const seen = { churchUnitsReq: [], churchesReq: [] };

  await bctx.route(`${SUPA}/**`, async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill(json({}, 204));
    if (url.includes('/auth/v1/token')) return route.fulfill(json(SESSION));
    if (url.includes('/auth/v1/user')) return route.fulfill(json(SESSION.user));
    // Edge Functions
    if (url.includes('/functions/v1/admin-start-impersonation')) {
      state.startCalls++; state.impersonating = true; state.sessionId = `sess-${state.startCalls}`;
      return route.fulfill(json({ session_id: state.sessionId, started_at: '2026-09-24T12:00:00Z', church_id: IGV, church_name: 'Igreja Gerando Vencedores', context: ctx() }));
    }
    if (url.includes('/functions/v1/admin-end-impersonation')) {
      state.endCalls++; state.impersonating = false;
      return route.fulfill(json({ session_id: state.sessionId, ended_at: new Date().toISOString(), duration_seconds: 10, context: ctx() }));
    }
    if (url.includes('/functions/v1/admin-churches-list')) {
      return route.fulfill(json({ data: [{ id: IGV, name: 'Igreja Gerando Vencedores', logo_url: null, city: 'Niterói', state: 'RJ', status: 'configured', created_at: '2026-01-01', plan_slug: 'pro', subscription_status: 'active', current_period_end: null, health_score: 90, user_count: 5, agent_count: 1, last_activity: null }], total: 1, page: 1 }));
    }
    if (url.includes('/functions/v1/')) return route.fulfill(json({ data: [], metrics: {} }));
    // RPCs
    if (url.includes('/rest/v1/rpc/')) {
      if (url.includes('get_my_tenant_context')) return route.fulfill(json(ctx()));
      if (url.includes('upsert_session_token')) return route.fulfill(json('tok'));
      const body = JSON.parse(route.request().postData() || '{}');
      // simula assert_church_access: p_church_id != tenant efetivo → FORBIDDEN
      if (body.p_church_id && body.p_church_id !== effective()) return route.fulfill(json({ code: '42501', message: 'FORBIDDEN' }, 403));
      if (url.includes('get_unit_counts')) return route.fulfill(json([{ unit_id: ITAIPU, person_stage: 'frequentador', cnt: 3 }, { unit_id: null, person_stage: 'frequentador', cnt: 3 }]));
      if (url.includes('get_care_status_counts')) return route.fulfill(json({ nao_atendida: 0, em_atendimento: 0, atendida: 0, sem_contato_48h: 0 }));
      if (url.includes('get_dashboard_people_stats')) return route.fulfill(json({ total: 6, sem_etapa: 6, novos_semana: 0, visitantes_30d: 0, membros: 0, novos_convertidos: 0, novos_convertidos_30d: 0, escola_da_fe: 0, batismos_trimestre: 0, parados: 0, consolidacao_90d: 0, por_etapa: [], evolucao_12m: [], visitantes_sem_consolidacao: [], membros_ausentes: [], celulas_ativas: 0, celulas_total: 0, celulas_por_trimestre: [], top_celulas: [], celulas_em_alerta: [], voluntarios_por_ministerio: [] }));
      if (url.includes('get_people_stage_counts')) {
        const scope = body.p_unit_id; const total = scope === ITAIPU ? 3 : scope === 'none' ? 3 : scope === TRINDADE ? 0 : 6;
        return route.fulfill(json({ total, aniversarios: 0, sem_etapa: total, stages: [] }));
      }
      if (url.includes('get_people_page')) {
        const scope = body.p_unit_id; const rows = scope === ITAIPU ? people.slice(0, 3) : scope === 'none' ? people.slice(3) : scope === TRINDADE ? [] : people;
        return route.fulfill(json(rows.map(r => ({ row_data: r, total_count: rows.length }))));
      }
      return route.fulfill(json([]));
    }
    // PostgREST — RLS simulada pelo tenant efetivo
    if (url.includes('/rest/v1/church_units')) {
      seen.churchUnitsReq.push({ impersonating: state.impersonating });
      return route.fulfill(json(state.impersonating ? [
        { id: ITAIPU, name: 'Itaipu', church_id: IGV, is_active: true, sort_order: 1 },
        { id: TRINDADE, name: 'Trindade', church_id: IGV, is_active: true, sort_order: 2 },
      ] : []));
    }
    if (url.includes('/rest/v1/churches')) {
      seen.churchesReq.push(new URL(url).searchParams.get('id'));
      const single = (route.request().headers()['accept'] || '').includes('object');
      const row = { id: effective(), name: ctx().church_name, slug: 'x', primary_color: '#3B82F6', secondary_color: '#1FA8F0', logo_url: null, enabled_modules: null, onboarding_step: null, status: 'configured', unit_cutoff_date: null };
      return route.fulfill(json(single ? row : [row]));
    }
    if (url.includes('/rest/v1/people')) return route.fulfill(json(state.impersonating ? people : []));
    if (url.includes('/rest/v1/user_roles')) return route.fulfill(json([]));
    return route.fulfill(json([]));
  });

  const page = await bctx.newPage();
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  const storageKey = 'sb-mlqjywqnchilvgkbvicd-auth-token';

  // 1. sessão do admin + cockpit
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  for (let a = 0; a < 3; a++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: storageKey, s: SESSION }); break; } catch { await page.waitForTimeout(500); } }
  await page.goto(`${BASE}/admin/churches`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  check('cockpit /admin/churches renderiza', page.url().includes('/admin/churches'), page.url());
  check('sem impersonação: banner ausente', (await page.locator('text=Visualizando como').count()) === 0);

  // marcador para provar que NÃO houve reload
  await page.evaluate(() => { window.__noReloadMarker = 'alive'; });

  // 2. start impersonation via menu "Entrar como pastor"
  const menuBtn = page.locator('div.relative.group > button').first();
  await menuBtn.focus();
  const enter = page.locator('button:has-text("Entrar como pastor")').first();
  await enter.waitFor({ state: 'visible', timeout: 5000 });
  await enter.click();
  await page.waitForURL('**/dashboard', { timeout: 15000 });
  await page.waitForTimeout(1500);
  check('start → navegou para /dashboard', page.url().includes('/dashboard'), page.url());
  check('start → EF chamada 1x', state.startCalls === 1, `startCalls=${state.startCalls}`);
  const marker = await page.evaluate(() => window.__noReloadMarker);
  check('start → sem window.location.reload()', marker === 'alive', `marker=${marker}`);
  check('banner "Visualizando como: Igreja Gerando Vencedores"', (await page.locator('text=Igreja Gerando Vencedores').count()) > 0);
  const sel = page.locator('select[aria-label="Unidade"]:visible').first();
  check('seletor de unidade APARECE durante impersonação', (await sel.count()) > 0);
  const opts = await sel.locator('option').allTextContents().catch(() => []);
  check('opções: Todas / Itaipu / Trindade / Sem unidade', ['Itaipu', 'Trindade'].every(o => opts.some(t => t.includes(o))) && opts.some(t => /Todas/i.test(t)) && opts.some(t => /Sem unidade/i.test(t)), opts.join(' | '));
  check('cache localStorage.impersonating reflete backend', await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('impersonating') || 'null')?.church_id } catch { return null } }) === IGV);

  // 3. /pessoas com escopo
  await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1200);
  const selP = page.locator('select[aria-label="Unidade"]:visible').first();
  check('/pessoas: seletor presente', (await selP.count()) > 0);
  const headerAll = await page.$eval('h1 + p', e => e.textContent).catch(() => '?');
  await selP.selectOption(ITAIPU); await page.waitForTimeout(1000);
  const headerItaipu = await page.$eval('h1 + p', e => e.textContent).catch(() => '?');
  const rowsItaipu = await page.$$eval('table tbody tr', r => r.length).catch(() => 0);
  check('/pessoas: filtro Itaipu aplicado (URL ?unidade=)', page.url().includes(`unidade=${ITAIPU}`), page.url());
  check('/pessoas: header muda Todas→Itaipu', headerAll !== headerItaipu, `"${headerAll}" → "${headerItaipu}", linhas=${rowsItaipu}`);
  await selP.selectOption('none'); await page.waitForTimeout(800);
  check('/pessoas: "Sem unidade" aplicado', page.url().includes('unidade=none'), page.url());

  // 4. refresh: continua impersonando (sessão no backend)
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('refresh → banner continua', (await page.locator('text=Igreja Gerando Vencedores').count()) > 0);
  check('refresh → seletor continua', (await page.locator('select[aria-label="Unidade"]:visible').count()) > 0);

  // 5. end via banner
  await page.evaluate(() => { window.__noReloadMarker = 'alive2'; });
  await page.locator('button:has-text("Sair da visualização")').first().click();
  await page.waitForURL('**/admin/churches', { timeout: 15000 });
  await page.waitForTimeout(1000);
  check('end → EF chamada 1x e estado backend fechado', state.endCalls === 1 && !state.impersonating);
  check('end → sem reload', (await page.evaluate(() => window.__noReloadMarker)) === 'alive2');
  check('end → cache localStorage limpo', (await page.evaluate(() => localStorage.getItem('impersonating'))) === null);
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1000);
  check('end → banner ausente', (await page.locator('text=Visualizando como').count()) === 0);
  check('end → seletor ausente (tenant original sem unidades)', (await page.locator('select[aria-label="Unidade"]:visible').count()) === 0);

  // 6. localStorage forjado: nenhum efeito
  await page.evaluate(({ igv }) => localStorage.setItem('impersonating', JSON.stringify({ church_id: igv, church_name: 'FORJADO', session_id: 'forged' })), { igv: IGV });
  seen.churchesReq.length = 0;
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1500);
  check('forjado → banner ausente', (await page.locator('text=FORJADO').count()) === 0 && (await page.locator('text=Visualizando como').count()) === 0);
  check('forjado → seletor ausente', (await page.locator('select[aria-label="Unidade"]:visible').count()) === 0);
  check('forjado → queries usam tenant do backend (mock), não IGV', seen.churchesReq.length > 0 && seen.churchesReq.every(id => id === `eq.${MOCK_CHURCH}`), seen.churchesReq.join(','));
  check('forjado → app limpa o cache falso', (await page.evaluate(() => localStorage.getItem('impersonating'))) === null);

  await page.screenshot({ path: 'test-impersonation-final.png' }).catch(() => {});
  await browser.close();

  const failed = results.filter(r => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} OK ===`);
  if (consoleErrors.length) { console.log('console errors:'); consoleErrors.slice(0, 8).forEach(e => console.log('  -', e.slice(0, 160))); }
  process.exit(failed.length ? 1 : 0);
}
run().catch(e => { console.error('FATAL:', e); process.exit(1); });
