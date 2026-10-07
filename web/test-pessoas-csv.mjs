import { chromium } from 'playwright';
/**
 * test-pessoas-csv.mjs — itens 21/18/25: exportação CSV via export_people_rows (1 pessoa = 1 linha, contatos ilimitados, mesmos filtros da lista).
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
// ── Mock do backend: 3 pessoas (0 / 1 / 3 contatos), multi-ministério, acentos/aspas/vírgula; filtros chegam na RPC ──
const exportCalls = []
const PEOPLE = [
  { id: 'e1', name: 'Zélia "Dona" Souza, da Silva', phone: '5521999990001', email: null, etapa: 'Visitante', care_state: 'nao_atendida', care_alert: true, unit_id: '11111111-1111-4111-8111-111111111111', unit_name: 'Unidade Central', first_visit_date: '2026-09-01', created_at: '2026-09-01T12:00:00Z', source: 'qr_code', ministerios: '', contacts_count: 0, contacts: [] },
  { id: 'e2', name: 'João Ação', phone: '5521999990002', email: 'j@x.com', etapa: 'Membro', care_state: 'em_atendimento', care_alert: false, unit_id: null, unit_name: null, first_visit_date: null, created_at: '2026-09-02T12:00:00Z', source: 'manual', ministerios: 'Louvor', contacts_count: 1, contacts: [{ ordinal: 1, event_id: 'ev1', contact_date: '2026-09-10T13:00:00Z', result: 'nao_atendeu', channel: 'ligacao', notes: null, actor_id: '11111111-1111-4111-8111-111111111111', actor_name: 'Mirian Secretaria' }] },
  { id: 'e3', name: 'Maria Três', phone: '5521999990003', email: null, etapa: 'Visitante', care_state: 'em_atendimento', care_alert: true, unit_id: '11111111-1111-4111-8111-111111111111', unit_name: 'Unidade Central', first_visit_date: null, created_at: '2026-09-03T12:00:00Z', source: 'import_xlsx', ministerios: 'Acolhimento | Louvor', contacts_count: 3, contacts: [
    { ordinal: 1, event_id: 'ev2', contact_date: '2026-09-11T13:00:00Z', result: 'nao_atendeu', channel: 'ligacao', notes: null, actor_id: '11111111-1111-4111-8111-111111111111', actor_name: 'Mirian Secretaria' },
    { ordinal: 2, event_id: 'ev3', contact_date: '2026-09-12T13:00:00Z', result: 'sem_resposta', channel: 'whatsapp', notes: null, actor_id: '11111111-1111-4111-8111-111111111111', actor_name: 'Mirian Secretaria' },
    { ordinal: 3, event_id: 'ev4', contact_date: '2026-09-13T13:00:00Z', result: 'realizado', channel: 'presencial', notes: 'ok', actor_id: 'u2', actor_name: 'Pr. Valdir' }] },
]
async function custom(r, u) {
  const F = async (x) => { await r.fulfill(x); return true; }
  if (!u.includes('/rest/v1/rpc/')) return false
  const body = JSON.parse(r.request().postData() || '{}')
  if (u.includes('get_my_tenant_context')) return F(json({ effective_church_id: CH, church_name: 'T', church_status: 'configured', is_impersonating: false, role: 'admin', is_ekthos_admin: false }))
  if (u.includes('export_people_rows')) {
    exportCalls.push(body)
    let rows = PEOPLE
    if (body.p_unit_id === '11111111-1111-4111-8111-111111111111') rows = rows.filter(p => p.unit_id === '11111111-1111-4111-8111-111111111111')
    if (body.p_unit_id === 'none') rows = rows.filter(p => !p.unit_id)
    if (body.p_care_status === 'sem_contato_48h') rows = rows.filter(p => p.care_alert)
    if (body.p_care_status && body.p_care_status !== 'sem_contato_48h') rows = rows.filter(p => p.care_state === body.p_care_status)
    if (body.p_search) rows = rows.filter(p => p.name.toLowerCase().includes(body.p_search.toLowerCase()))
    return F(json({ total: rows.length, max_contacts: Math.max(0, ...rows.map(p => p.contacts_count)), alert_threshold_hours: 48, rows }))
  }
  if (u.includes('get_care_status_counts')) return F(json({ nao_atendida: 1, em_atendimento: 2, atendida: 0, cancelado: 0, total: 3, sem_contato_48h: 2, alert_threshold_hours: 48 }))
  if (u.includes('get_people_page')) { const rows = PEOPLE.map(p => ({ ...MOCK_PEOPLE[0], id: p.id, name: p.name, person_pipeline: [], unit_id: p.unit_id, care_state: p.care_state, care_alert: p.care_alert })); return F(json(rows.map(x => ({ row_data: x, total_count: rows.length })))) }
  if (u.includes('get_people_stage_counts')) return F(json({ total: 3, aniversarios: 0, sem_etapa: 0, stages: [{ stage_id: 'stage-visit', stage_key: 'visitante', name: 'Visitante', order_index: 1, cnt: 2 }] }))
  if (u.includes('get_contact_counts')) return F(json([]))
  return false
}
const page = await ctx.newPage(); const errs = []; page.on('console', m => { if (m.type() === 'error' && !m.text().includes('Failed to fetch')) errs.push(m.text()); });
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' }).catch(() => {});
for (let i = 0; i < 3; i++) { try { await page.evaluate(({ k, s }) => localStorage.setItem(k, JSON.stringify(s)), { k: 'sb-mlqjywqnchilvgkbvicd-auth-token', s: MOCK_SESSION }); break; } catch { await page.waitForTimeout(500); } }
// Intercepta o download: captura o conteúdo do Blob antes do click()
await page.addInitScript(() => {
  window.__csv = []
  const orig = URL.createObjectURL
  URL.createObjectURL = (blob) => { blob.arrayBuffer().then(ab => { const u8 = new Uint8Array(ab); window.__csv.push({ text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(u8), bom: u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF, type: blob.type }) }); return orig(blob) }
  HTMLAnchorElement.prototype.click = function () { window.__csv.push({ filename: this.download }) }
})
const parseCsv = (text) => text.replace(/^﻿/, '').split('\r\n').map(line => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = '' } else cur += ch } out.push(cur); return out })
const exportAndRead = async () => {
  await page.evaluate(() => { window.__csv = [] })
  await page.locator('[data-testid="btn-exportar-csv"]').click()
  await page.waitForFunction(() => window.__csv.length >= 2, null, { timeout: 15000 })
  const got = await page.evaluate(() => window.__csv)
  const blob = got.find(g => g.text); const link = got.find(g => g.filename)
  return { raw: blob.text, bom: blob.bom, type: blob.type, filename: link.filename, rows: parseCsv(blob.text) }
}

await page.goto(`${BASE}/pessoas`, { waitUntil: 'networkidle', timeout: 20000 }); await page.waitForTimeout(1200)
let c = await exportAndRead()
const H = c.rows[0]
ck('CSV começa com BOM UTF-8 e tipo text/csv (compatível com Excel)', c.bom === true && /text\/csv/.test(c.type), c.type)
ck('nome do arquivo: pessoas-todas-AAAAMMDD.csv', /^pessoas-todas-\d{8}\.csv$/.test(c.filename), c.filename)
ck('RPC export_people_rows chamada com os filtros da lista (sem p_limit/p_offset)', exportCalls.length === 1 && !('p_limit' in exportCalls[0]) && !('p_offset' in exportCalls[0]) && exportCalls[0].p_unit_id === null, JSON.stringify(exportCalls[0]))
ck('1 pessoa = 1 linha: 3 linhas de dados + cabeçalho', c.rows.length === 4, String(c.rows.length))
ck('cabeçalho fixo: Nome, Telefone, Email, Etapa, Atendimento, Sem contato +48h, Unidade, Ministérios, Primeira visita, Cadastro, Origem, Qtd contatos',
  H.slice(0, 12).join('|') === 'Nome|Telefone|Email|Etapa|Atendimento|Sem contato +48h|Unidade|Ministérios|Primeira visita|Cadastro|Origem|Qtd contatos', H.slice(0, 12).join('|'))
ck('colunas dinâmicas até o maior ordinal (3): 1º/2º/3º contato — data / resultado / responsável', H.length === 12 + 9 && H[12] === '1º contato — data' && H[13] === '1º contato — resultado' && H[14] === '1º contato — responsável' && H[18] === '3º contato — data' && H[20] === '3º contato — responsável', H.slice(12).join('|'))
const byName = (n) => c.rows.find(r => r[0].startsWith(n))
const z = byName('Zélia'), j = byName('João'), m = byName('Maria')
ck('aspas, vírgula e acentos preservados no nome (escape RFC 4180)', z[0] === 'Zélia "Dona" Souza, da Silva' && j[0] === 'João Ação', z[0])
ck('pessoa sem contato: Qtd 0, colunas de contato vazias, Ministérios vazio, alerta Sim, Cadastro 01/09/2026, 1ª visita 01/09/2026, Origem QR Code',
  z[11] === '0' && z.slice(12).every(v => v === '') && z[7] === '' && z[5] === 'Sim' && z[9] === '01/09/2026' && z[8] === '01/09/2026' && z[10] === 'QR Code' && z[4] === 'Não atendida' && z[6] === 'Unidade Central', z.join('|'))
ck('pessoa com 1 contato: 1º contato — data 10/09/2026 hh:mm, resultado "Não atendeu (Ligação)", responsável Mirian Secretaria; 2º/3º vazios; Unidade vazia; Em atendimento',
  j[11] === '1' && /^10\/09\/2026 \d{2}:\d{2}$/.test(j[12]) && j[13] === 'Não atendeu (Ligação)' && j[14] === 'Mirian Secretaria' && j.slice(15).every(v => v === '') && j[6] === '' && j[4] === 'Em atendimento' && j[7] === 'Louvor' && j[10] === 'Manual', j.join('|'))
ck('pessoa com 3 contatos: ordem 1º Não atendeu, 2º Sem resposta (WhatsApp), 3º Contato realizado (Pessoalmente) por Pr. Valdir; ministérios "Acolhimento | Louvor"',
  m[11] === '3' && m[13] === 'Não atendeu (Ligação)' && m[16] === 'Sem resposta (WhatsApp)' && m[19] === 'Contato realizado (Pessoalmente)' && m[20] === 'Pr. Valdir' && m[14] === 'Mirian Secretaria' && m[7] === 'Acolhimento | Louvor' && m[10] === 'Importação', m.join('|'))

// Filtro de alerta → RPC recebe p_care_status e exporta só as alertadas
await page.locator('[data-testid="alerta-sem-contato"]').click(); await page.waitForTimeout(800)
c = await exportAndRead()
ck('com filtro "Sem contato +48h": RPC recebe p_care_status=sem_contato_48h e exporta 2 linhas (Zélia, Maria)', exportCalls[1].p_care_status === 'sem_contato_48h' && c.rows.length === 3 && c.rows.slice(1).every(r => r[5] === 'Sim'), String(c.rows.length))
await page.locator('[data-testid="estado-em_atendimento"]').click(); await page.waitForTimeout(800)
c = await exportAndRead()
ck('com filtro "Em atendimento": exporta 2 linhas, ambas Em atendimento', exportCalls[2].p_care_status === 'em_atendimento' && c.rows.length === 3 && c.rows.slice(1).every(r => r[4] === 'Em atendimento'))
await page.locator('[data-testid="estado-todos"]').click(); await page.waitForTimeout(500)

// Busca → p_search
await page.locator('input[placeholder*="Buscar"]').fill('maria'); await page.waitForTimeout(1200)
c = await exportAndRead()
ck('busca "maria": RPC recebe p_search e exporta só Maria; colunas dinâmicas seguem o universo (3 contatos)', exportCalls[3].p_search === 'maria' && c.rows.length === 2 && c.rows[1][0] === 'Maria Três' && c.rows[0].length === 21)
await page.locator('input[placeholder*="Buscar"]').fill(''); await page.waitForTimeout(800)

// Unidade → p_unit_id + nome do arquivo
const unitSel = page.locator('select[aria-label="Unidade"]:visible').first()
await unitSel.selectOption({ label: 'Unidade Central' }); await page.waitForTimeout(1500)
c = await exportAndRead()
ck('unidade Central: RPC recebe p_unit_id da unidade, exporta 2 linhas, arquivo pessoas-unidade-central-*.csv', exportCalls[4].p_unit_id === '11111111-1111-4111-8111-111111111111' && c.rows.length === 3 && /^pessoas-unidade-central-\d{8}\.csv$/.test(c.filename), c.filename + ' ' + JSON.stringify(exportCalls[4]))
// universo sem contatos → nenhuma coluna dinâmica
await unitSel.selectOption({ label: 'Sem unidade definida' }); await page.waitForTimeout(1500)
c = await exportAndRead()
ck('sem unidade: 1 linha (João), max_contacts 1 → só 3 colunas dinâmicas; arquivo pessoas-sem-unidade-*.csv', exportCalls[5].p_unit_id === 'none' && c.rows.length === 2 && c.rows[0].length === 15 && /^pessoas-sem-unidade-/.test(c.filename), c.rows[0].length + ' ' + c.filename)
ck('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '))
await browser.close();
const failed = results.filter(x => !x).length;
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`);
process.exit(failed ? 1 : 0);
