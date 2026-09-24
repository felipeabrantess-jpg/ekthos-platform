import { chromium } from 'playwright';
/**
 * test-routes.mjs — testa rotas do app com Supabase mockado via Playwright
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

const results = [];
const CH = MOCK_CHURCH.id;
const json = (d, status = 200) => ({ status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(d) });
const CHANNELS = ['whatsapp', 'presencial', 'ligacao', 'email', 'visita'];
const RESULTS = ['realizado', 'encaminhado', 'sem_resposta', 'reagendado', 'nao_atendeu'];
function mkContacts(n, personId, closed = false) {
  return Array.from({ length: n }, (_, i) => ({
    event_id: `${personId}-ev-${i + 1}`, ordinal: i + 1,
    event_at: `2026-09-${String(10 + i).padStart(2, '0')}T14:32:00Z`, contact_date: `2026-09-${String(10 + i).padStart(2, '0')}T14:32:00Z`,
    actor_id: 'u1', actor_name: i % 2 ? 'Maria' : 'João', channel: CHANNELS[i % 5], result: RESULTS[i % 5], notes: i === 2 ? 'Conversamos sobre a célula' : null,
    journey_id: `${personId}-j`, journey_closed_at: closed ? '2026-09-20T10:00:00Z' : null, journey_outcome: closed ? 'nao_quer_contato' : null,
  }));
}
// estado "do banco" por pessoa
const people = {};
for (const n of [0, 1, 2, 3, 4, 6, 7]) people[`p${n}`] = { id: `p${n}`, name: `Pessoa ${n} contatos`, contacts: mkContacts(n, `p${n}`), journey: n > 0 ? { id: `p${n}-j`, closed_at: null, outcome: null, version: 1, stage_id: 's1' } : null };
people.pclosed = { id: 'pclosed', name: 'Pessoa encerrada', contacts: mkContacts(2, 'pclosed', true), journey: { id: 'pclosed-j', closed_at: '2026-09-20T10:00:00Z', outcome: 'nao_quer_contato', version: 3, stage_id: 's1' } };
const registerCalls = [];

const ck = (n, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`); };

async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; };
  const m = r.request().method();
        const q = new URL(u); const pid = (q.searchParams.get('person_id') || q.searchParams.get('id') || '').replace('eq.', '');
  if (u.includes('/rest/v1/rpc/')) {
    const body = JSON.parse(r.request().postData() || '{}');
    if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }));
    if (u.includes('get_person_contacts')) return F(json(people[body.p_person_id]?.contacts ?? []));
    if (u.includes('get_person_timeline')) return F(json([]));
    if (u.includes('journey_suggest_stage')) return F(json({ stage_id: 's1', stage_name: 'Visitante', reason: 'mock' }));
    if (u.includes('journey_register_attendance')) {
      registerCalls.push(body); const p = people[body.p_person_id];
      if (!p.journey && !body.p_new_stage_id) return F(json({ code: 'P0001', message: 'JOURNEY_REQUIRED' }, 400));
      if (!p.journey) p.journey = { id: `${p.id}-j`, closed_at: null, outcome: null, version: 1, stage_id: body.p_new_stage_id };
      const n = p.contacts.length + 1;
      p.contacts.push({ event_id: `${p.id}-ev-${n}`, ordinal: n, event_at: new Date().toISOString(), contact_date: body.p_contact_date, actor_id: 'u1', actor_name: 'João', channel: body.p_contact_channel, result: body.p_contact_result, notes: body.p_contact_notes ?? null, journey_id: p.journey.id, journey_closed_at: null, journey_outcome: null });
      return F(json({ ok: true }));
    }
    return F(json([]));
  }
  if (u.includes('/rest/v1/people')) { const p = people[pid]; return F(json(p ? { id: p.id, church_id: CH, name: p.name, first_name: null, last_name: null, phone: '5521999990000', email: null, neighborhood: null, city: null, birth_date: null, como_conheceu: null, marital_status: null, first_visit_date: null, conversion_date: null, person_stage: null, celula_id: null, responsible_id: null, observacoes_pastorais: null, avatar_url: null } : null, p ? 200 : 406)); }
  if (u.includes('/rest/v1/person_journey')) {
    const p = people[pid]; const j = p?.journey ?? null; const single = (r.request().headers()['accept'] || '').includes('object');
    const openOnly = q.searchParams.get('closed_at') === 'is.null';
    const row = j && !(openOnly && j.closed_at) ? { id: j.id, stage_id: j.stage_id, owner_id: 'u1', version: j.version, next_step: null, next_step_due_at: null, opened_at: '2026-09-01', ministry_id: null, outcome: j.outcome, closed_at: j.closed_at } : null;
    return F(json(single ? row : (row ? [row] : [])));
  }
  if (u.includes('/rest/v1/pipeline_stages')) return F(json([{ id: 's1', name: 'Visitante', order_index: 1 }, { id: 's2', name: 'Membro', order_index: 5 }]));
  if (u.includes('/rest/v1/churches')) return F(json({ id: CH, name: 'T', status: 'configured', enabled_modules: null, onboarding_step: null, primary_color: null, secondary_color: null, logo_url: null, unit_cutoff_date: null }));
  return false;
}
const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch')) errs.push(m.text()); });
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break; } catch { await page.waitForTimeout(500); } }

const open = async (id) => { await page.goto(`${BASE}/pessoas/${id}/atendimento`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(900); };
const txt = async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();

for (const n of [0, 1, 2, 3, 4, 6, 7]) {
  await open(`p${n}`);
  const prox = await txt('[data-testid="proximo-contato"]');
  const titulo = await txt('[data-testid="titulo-registrar"]');
  const realizados = await txt('[data-testid="contatos-realizados"]');
  const done = await page.locator('[data-testid^="marco-"][data-state="done"]').count();
  const next = await page.locator('[data-testid^="marco-"][data-state="next"]').count();
  const nextId = await page.locator('[data-testid^="marco-"][data-state="next"]').first().getAttribute('data-testid');
  const marcos = await page.locator('[data-testid^="marco-"]').count();
  ck(`${n} contatos → "Próximo: ${n + 1}º contato" e "Registrar ${n + 1}º contato"`, prox === `Próximo: ${n + 1}º contato` && titulo === `Registrar ${n + 1}º contato`, `${prox} | ${titulo} | ${realizados}`);
  ck(`${n} contatos → ${n} marcos concluídos, 1 destacado (marco-${n + 1}), ${Math.max(4, n) + 1} marcos visíveis`, done === n && next === 1 && nextId === `marco-${n + 1}` && marcos === Math.max(4, n) + 1, `done=${done} next=${nextId} marcos=${marcos}`);
  const itens = await page.locator('[data-testid^="contato-"]').count();
  ck(`${n} contatos → histórico com ${n} itens`, itens === n, `itens=${itens}`);
  if (n === 7) {
    ck('7 contatos → texto "7 contatos realizados" (ordinal real, sem "5º+")', realizados === '7 contatos realizados' && !(await page.content()).includes('5º+'), realizados);
    ck('marco 7º presente e 8º destacado', (await page.locator('[data-testid="marco-7"][data-state="done"]').count()) === 1 && nextId === 'marco-8');
  }
  if (n === 3) {
    const c3 = await txt('[data-testid="contato-3"]');
    ck('3º contato mostra ordinal/data/responsável/canal/resultado/observação', /3º contato/.test(c3) && /12\/09\/26/.test(c3) && /Responsável: João/.test(c3) && /Canal: Ligação/.test(c3) && /Resultado: Sem resposta/.test(c3) && /Observação: Conversamos sobre a célula/.test(c3), c3);
    const c2 = await txt('[data-testid="contato-2"]');
    ck('2º contato: responsável Maria, canal Pessoalmente, resultado Encaminhado, observação —', /Responsável: Maria/.test(c2) && /Canal: Pessoalmente/.test(c2) && /Resultado: Encaminhado/.test(c2) && /Observação: —/.test(c2), c2);
    const status = await txt('[data-testid="status-jornada"]');
    ck('jornada aberta → STATUS: EM ATENDIMENTO', status === 'STATUS: EM ATENDIMENTO', status);
    await page.screenshot({ path: 'atendimento-3-contatos.png', fullPage: true });
  }
  if (n === 7) await page.screenshot({ path: 'atendimento-7-contatos.png', fullPage: true });
  if (n === 0) await page.screenshot({ path: 'atendimento-0-contatos.png', fullPage: true });
}

// Encerrada
await open('pclosed');
const st = await txt('[data-testid="status-jornada"]');
ck('jornada encerrada → STATUS: ENCERRADO · Não quer contato (2 contatos, próximo 3º)', st === 'STATUS: ENCERRADO · Não quer contato' && (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 3º contato', st);
await page.screenshot({ path: 'atendimento-encerrada.png', fullPage: true });

// Pessoa sem jornada: etapa obrigatória; salvar → 1º contato
await open('p0');
ck('sem jornada → aviso "Sem jornada ativa" e etapa obrigatória', (await page.locator('text=Sem jornada ativa').count()) > 0 && (await page.locator('option:has-text("Selecionar etapa (obrigatório)")').count()) > 0);

// Fluxo: p2 tem 2 contatos → salva → 3º
await open('p2');
ck('antes: 2 contatos, Registrar 3º contato', (await txt('[data-testid="titulo-registrar"]')) === 'Registrar 3º contato');
await page.locator('textarea[placeholder*="Anotações"]').fill('terceiro contato via teste');
await page.locator('button:has-text("Salvar atendimento"):visible').first().click();
await page.waitForTimeout(1500);
ck('RPC journey_register_attendance chamada sem campo manual de ordinal', registerCalls.length === 1 && !('p_ordinal' in registerCalls[0]) && !('p_contact_number' in registerCalls[0]), Object.keys(registerCalls[0] || {}).join(','));
ck('depois: 3 contatos, Registrar 4º contato', (await txt('[data-testid="titulo-registrar"]')) === 'Registrar 4º contato' && (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 4º contato', await txt('[data-testid="proximo-contato"]'));
const novo = await txt('[data-testid="contato-3"]');
ck('novo registro aparece como 3º contato no histórico com a observação', /3º contato/.test(novo) && /terceiro contato via teste/.test(novo) && /Responsável: João/.test(novo), novo);
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
