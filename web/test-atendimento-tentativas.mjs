import { chromium } from 'playwright';
/**
 * test-atendimento-tentativas.mjs — FLUXO HUMANO do item 10: tentativas não atendidas contam como contato (1º, 2º, 3º…).
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
  // ── /pessoas: lista e coluna CONTATOS a partir do MESMO estado (pastoral_contact reais) ──
  if (u.includes('/rest/v1/rpc/get_contact_counts')) {
    const body = JSON.parse(r.request().postData() || '{}');
    return F(json((body.p_person_ids || []).filter(id => people[id]).map(id => ({ person_id: id, cnt: people[id].contacts.length }))));
  }
  if (u.includes('/rest/v1/rpc/get_people_page')) {
    const rows = Object.values(people).map(p => ({ ...MOCK_PEOPLE[0], id: p.id, name: p.name, person_pipeline: [], unit_id: null }));
    return F(json(rows.map(x => ({ row_data: x, total_count: rows.length }))));
  }
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
      if (body.p_register_contact === false) return F(json({ ok: true }));
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

// Nada é pré-marcado: cada passo abaixo é o que o operador faz na tela.
const open = async (id) => { await page.goto(`${BASE}/pessoas/${id}/atendimento`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(900); };
const txt = async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();
const saveBtn = () => page.locator('button:has-text("Salvar atendimento"):visible').first();
const resultSelect = () => page.locator('label:has-text("Resultado") select').first();
const historico = async () => { const n = await page.locator('[data-testid^="contato-"]').count(); const out = []; for (let i = 1; i <= n; i++) out.push(await txt(`[data-testid="contato-${i}"]`)); return out; };

// Pessoa sem contatos e sem jornada ("p0")
// 1. Abrir Atendimento
await open('p0');
ck('1. abre: "Próximo: 1º contato", pergunta "Você tentou falar com a pessoa agora?", nada marcado, Salvar desabilitado',
  (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 1º contato'
  && (await page.locator('text=Você tentou falar com a pessoa agora?').count()) === 1
  && (await page.locator('[data-testid="tentou-falar-sim"][aria-checked="true"]').count()) === 0
  && (await page.locator('[data-testid="bloco-registrar-contato"]').count()) === 0
  && await saveBtn().isDisabled());
// 2. "Você tentou falar?" → SIM
await page.locator('[data-testid="tentou-falar-sim"]').click(); await page.waitForTimeout(200);
ck('2. "Sim, tentei" abre canal / resultado / anotações para o 1º contato', (await txt('[data-testid="titulo-registrar"]')) === 'Registrar 1º contato' && (await resultSelect().count()) === 1 && (await page.locator('textarea[placeholder*="tentativa"]').count()) === 1);
ck('   resultado oferece "Não atendeu", "Sem resposta" e "Contato realizado"', (await resultSelect().locator('option[value="nao_atendeu"]').count()) === 1 && (await resultSelect().locator('option[value="sem_resposta"]').count()) === 1 && (await resultSelect().locator('option[value="realizado"]').count()) === 1);
// 3. Resultado → NÃO ATENDEU (pessoa sem jornada: etapa obrigatória, como na tela real)
await resultSelect().selectOption('nao_atendeu');
await page.locator('select').filter({ has: page.locator('option:has-text("Selecionar etapa")') }).first().selectOption('s1').catch(() => {});
// 4. Salvar
await saveBtn().click(); await page.waitForTimeout(1500);
const c1 = registerCalls[0];
ck('4. salva: RPC com p_register_contact=true e p_contact_result=nao_atendeu (tentativa não atendida É contato)', registerCalls.length === 1 && c1.p_register_contact === true && c1.p_contact_result === 'nao_atendeu', JSON.stringify({ reg: c1?.p_register_contact, res: c1?.p_contact_result }));
ck('   toast confirma "1º contato registrado (Não atendeu)"', (await page.locator('text=1º contato registrado (Não atendeu)').count()) === 1);
// 5. Fechar e abrir novamente
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(500);
await open('p0');
const h5 = await historico();
ck('5. reabre: "Próximo: 2º contato"; histórico 1º — Não atendeu', (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 2º contato' && h5.length === 1 && /1º contato/.test(h5[0]) && /Resultado: Não atendeu/.test(h5[0]), await txt('[data-testid="proximo-contato"]'));
ck('   nenhuma tentativa pré-marcada ao reabrir', (await page.locator('[data-testid="bloco-registrar-contato"]').count()) === 0 && await saveBtn().isDisabled());
// 6. Segunda tentativa → NÃO ATENDEU
await page.locator('[data-testid="tentou-falar-sim"]').click(); await page.waitForTimeout(200);
ck('6. "Sim, tentei" → "Registrar 2º contato"', (await txt('[data-testid="titulo-registrar"]')) === 'Registrar 2º contato');
await resultSelect().selectOption('nao_atendeu');
// 7. Salvar
await saveBtn().click(); await page.waitForTimeout(1500);
ck('7. 2ª tentativa gravada: p_register_contact=true, nao_atendeu, p_expected_version da jornada aberta', registerCalls.length === 2 && registerCalls[1].p_register_contact === true && registerCalls[1].p_contact_result === 'nao_atendeu' && registerCalls[1].p_expected_version === 1, JSON.stringify(registerCalls[1]));
// 8. Reabrir
await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(500);
await open('p0');
ck('8. reabre: "Próximo: 3º contato"', (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 3º contato', await txt('[data-testid="proximo-contato"]'));
// 9. Terceira tentativa → REALIZADO
await page.locator('[data-testid="tentou-falar-sim"]').click(); await page.waitForTimeout(200);
await resultSelect().selectOption('realizado');
await page.locator('textarea[placeholder*="tentativa"]').fill('conversamos, vai à célula');
// 10. Salvar
await saveBtn().click(); await page.waitForTimeout(1500);
ck('10. 3ª tentativa gravada como realizado', registerCalls.length === 3 && registerCalls[2].p_register_contact === true && registerCalls[2].p_contact_result === 'realizado');
await open('p0');
const h = await historico();
ck('histórico exatamente: 1º — Não atendeu | 2º — Não atendeu | 3º — Contato realizado',
  h.length === 3 && /1º contato/.test(h[0]) && /Resultado: Não atendeu/.test(h[0]) && /2º contato/.test(h[1]) && /Resultado: Não atendeu/.test(h[1]) && /3º contato/.test(h[2]) && /Resultado: Contato realizado/.test(h[2]) && /conversamos, vai à célula/.test(h[2]),
  h.map(x => x.slice(0, 60)).join(' || '));
ck('"Próximo: 4º contato" e 3 marcos concluídos', (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 4º contato' && (await page.locator('[data-testid^="marco-"][data-state="done"]').count()) === 3);
await page.screenshot({ path: 'atendimento-tentativas-3.png', fullPage: true });

// ── "Não tentei" + alterar só uma informação → contador NÃO aumenta ──
await page.locator('[data-testid="tentou-falar-nao"]').click(); await page.waitForTimeout(200);
ck('"Não tentei": sem campos de contato; sem alteração o Salvar fica desabilitado (não cria tentativa falsa)', (await page.locator('[data-testid="bloco-registrar-contato"]').count()) === 0 && await saveBtn().isDisabled());
await page.locator('input[placeholder*="Contexto pastoral"]').fill('mora perto da igreja');
ck('   alterou uma informação → Salvar habilita', !(await saveBtn().isDisabled()));
await saveBtn().click(); await page.waitForTimeout(1500);
const c4 = registerCalls[3];
ck('   salva com p_register_contact=false e a observação; nenhum pastoral_contact', registerCalls.length === 4 && c4.p_register_contact === false && c4.p_people_updates?.observacoes_pastorais === 'mora perto da igreja' && people.p0.contacts.length === 3, JSON.stringify({ reg: c4?.p_register_contact, upd: c4?.p_people_updates }));
ck('   toast: "Alterações salvas (nenhuma tentativa de contato registrada)"', (await page.locator('text=nenhuma tentativa de contato registrada').count()) === 1);
await open('p0');
ck('   contador continua "Próximo: 4º contato" e histórico com 3 itens', (await txt('[data-testid="proximo-contato"]')) === 'Próximo: 4º contato' && (await historico()).length === 3);

// ── "Não tentei" sem alterar nada → nada é enviado ──
await page.locator('[data-testid="tentou-falar-nao"]').click(); await page.waitForTimeout(200);
const before = registerCalls.length;
ck('"Não tentei" sem mudar nada: Salvar desabilitado, aviso "Preencha ao menos um campo", nenhuma RPC', await saveBtn().isDisabled() && (await page.locator('text=Preencha ao menos um campo').count()) === 1 && registerCalls.length === before);
await saveBtn().click({ force: true }).catch(() => {}); await page.waitForTimeout(500);
ck('   clique forçado não cria tentativa falsa', registerCalls.length === before && people.p0.contacts.length === 3);

ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '));
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
