// ============================================================
// Edge Function: kids-checkin-handler  (verify_jwt = false)
//
// Segurança via token da tabela kids_access_tokens.
// ⚠️ TODA requisição exige token válido ANTES de qualquer dado.
//
// Ações:
//   POST   { action:'checkin' }            — secretária faz check-in
//   GET    ?action=search&wristband=X      — busca por pulseira
//   PATCH  { action:'checkout' }           — professora faz check-out
//   GET    ?action=room                    — lista presentes na sala
//
// Isolamento: church_id SEMPRE do token (nunca do cliente).
// Dado de saúde: retorna RESUMO (health_alert), nunca prontuário bruto.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com', 'https://ekthosai.com',
  'https://ekthosai.net',     'https://www.ekthosai.net',
  'http://localhost:5173',    'http://localhost:5201',
]

// ── Helpers ──────────────────────────────────────────────────

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age':       '86400',
  }
}

function jsonResp(body: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

function errResp(msg: string, status: number, origin: string | null = null) {
  console.error(`[kids-checkin] ${status}: ${msg}`)
  return jsonResp({ error: msg }, status, origin)
}

// Hoje no horário de Brasília (UTC-3)
function todayBRT(): string {
  const d = new Date(Date.now() - 3 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}

// Idade em anos a partir da data de nascimento
function ageFromBirthdate(birthDate: string | null): number | null {
  if (!birthDate) return null
  const ms = Date.now() - new Date(birthDate).getTime()
  return Math.floor(ms / (365.25 * 24 * 60 * 60 * 1000))
}

// Resumo de saúde — nunca retorna prontuário completo
function summarizeHealth(h: {
  allergies:            string | null
  syndrome:             string | null
  emergency_medication: string | null
} | null): string | null {
  if (!h) return null
  const parts: string[] = []
  if (h.allergies)            parts.push(`Alérgico a: ${h.allergies}`)
  if (h.syndrome)             parts.push(h.syndrome)
  if (h.emergency_medication) parts.push('⚠️ Tem medicação de emergência')
  return parts.length > 0 ? parts.join(' | ') : null
}

// ── Token validation ─────────────────────────────────────────

interface TokenInfo {
  id:         string
  church_id:  string
  token_role: 'secretary' | 'teacher'
  room_id:    string | null
  label:      string | null
}

async function validateToken(
  supabase: ReturnType<typeof createClient>,
  raw: string | null,
): Promise<TokenInfo | null> {
  if (!raw || raw.length < 32) return null

  const { data, error } = await supabase
    .from('kids_access_tokens')
    .select('id, church_id, token_role, room_id, label')
    .eq('token', raw)
    .is('revoked_at', null)
    .eq('valid_date', todayBRT())
    .single()

  if (error || !data) return null
  return data as TokenInfo
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── Extrai token (header Bearer ou query param) ───────────
  const authHeader = req.headers.get('authorization') ?? ''
  const rawToken   = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : new URL(req.url).searchParams.get('token')

  // ── Valida token ANTES de qualquer resposta ───────────────
  const tokenInfo = await validateToken(supabase, rawToken)
  if (!tokenInfo) {
    return errResp('Token inválido, expirado ou revogado', 403, origin)
  }

  const { church_id, token_role, room_id: token_room_id } = tokenInfo
  const url = new URL(req.url)

  if (req.method === 'POST') {
    return handleCheckin(supabase, req, church_id, token_role, origin)
  }

  if (req.method === 'PATCH') {
    return handleCheckout(supabase, req, church_id, token_role, token_room_id, origin)
  }

  if (req.method === 'GET') {
    const action    = url.searchParams.get('action') ?? 'search'
    const wristband = url.searchParams.get('wristband') ?? ''

    if (action === 'search') {
      if (!wristband) return errResp('Parâmetro wristband obrigatório', 400, origin)
      return handleSearch(supabase, church_id, token_role, token_room_id, wristband, origin)
    }
    if (action === 'room') {
      return handleRoomList(supabase, church_id, token_role, token_room_id, origin)
    }
    if (action === 'rooms') {
      return handleRoomsMeta(supabase, church_id, token_role, token_room_id, tokenInfo.label, origin)
    }
    return errResp('action inválido. Use: search | room | rooms', 400, origin)
  }

  return errResp('Método não permitido', 405, origin)
})

// ── 1. POST check-in (secretária) ────────────────────────────

async function handleCheckin(
  supabase:   ReturnType<typeof createClient>,
  req:        Request,
  church_id:  string,
  token_role: string,
  origin:     string | null,
): Promise<Response> {
  if (token_role !== 'secretary') {
    return errResp('Apenas a secretária pode fazer check-in', 403, origin)
  }

  let body: any
  try { body = await req.json() } catch { return errResp('Body JSON inválido', 400, origin) }

  const {
    room_id, wristband_number, checked_in_by, lgpd_consent,
    child_id: existing_child_id, child, guardians, health,
  } = body

  if (!room_id)          return errResp('room_id obrigatório', 400, origin)
  if (!wristband_number) return errResp('wristband_number obrigatório', 400, origin)
  if (!checked_in_by)    return errResp('checked_in_by obrigatório', 400, origin)
  if (!lgpd_consent)     return errResp('lgpd_consent obrigatório — responsável deve consentir', 400, origin)
  if (!guardians?.length) return errResp('Pelo menos um responsável é obrigatório', 400, origin)

  // Valida sala (pertence a esta igreja, ativa)
  const { data: room, error: roomErr } = await supabase
    .from('kids_rooms')
    .select('id, name')
    .eq('id', room_id)
    .eq('church_id', church_id)
    .eq('active', true)
    .single()

  if (roomErr || !room) return errResp('Sala não encontrada ou inativa', 404, origin)

  // Verifica pulseira duplicada ativa hoje
  const today = todayBRT()
  const { data: dup } = await supabase
    .from('kids_checkins')
    .select('id, kids_children(name)')
    .eq('church_id', church_id)
    .eq('wristband_number', String(wristband_number))
    .eq('event_date', today)
    .is('checkout_time', null)
    .maybeSingle()

  if (dup) {
    const who = (dup.kids_children as any)?.name ?? 'outra criança'
    return errResp(`Pulseira ${wristband_number} já está em uso por ${who}`, 409, origin)
  }

  // Resolve criança: usa existing_child_id ou cria nova
  let child_id = existing_child_id ?? null

  if (!child_id) {
    if (!child?.name) return errResp('child.name obrigatório para nova criança', 400, origin)

    const { data: newChild, error: childErr } = await supabase
      .from('kids_children')
      .insert({
        church_id,
        name:       child.name.trim(),
        birth_date: child.birth_date ?? null,
        notes:      child.notes ?? null,
      })
      .select('id')
      .single()

    if (childErr || !newChild) {
      console.error('[kids-checkin] Erro ao criar criança:', childErr?.message)
      return errResp('Erro ao cadastrar criança', 500, origin)
    }
    child_id = newChild.id
  }

  // Insere responsáveis (sempre — atualiza a cada check-in se mudou)
  const { error: guardErr } = await supabase
    .from('kids_guardians')
    .insert(
      (guardians as any[]).map((g: any) => ({
        church_id,
        child_id,
        name:         (g.name ?? '').trim(),
        phone:        (g.phone ?? '').trim(),
        relationship: g.relationship ?? null,
        is_primary:   g.is_primary ?? false,
      }))
    )

  if (guardErr) {
    console.error('[kids-checkin] Erro ao salvar responsável:', guardErr.message)
    return errResp('Erro ao cadastrar responsável', 500, origin)
  }

  // Salva dados de saúde (lgpd_consent obrigatório + dados presentes)
  if (health && lgpd_consent) {
    const { error: healthErr } = await supabase
      .from('person_health_info')
      .insert({
        church_id,
        child_id,
        allergies:            health.allergies ?? null,
        syndrome:             health.syndrome  ?? null,
        medical_notes:        health.medical_notes ?? null,
        emergency_medication: health.emergency_medication ?? null,
        lgpd_consent:         true,
        lgpd_consent_at:      new Date().toISOString(),
      })

    if (healthErr) {
      // Não falha o check-in — saúde é opcional se não fornecida
      console.error('[kids-checkin] Aviso: erro ao salvar saúde:', healthErr.message)
    }
  }

  // Cria o check-in
  const { data: checkin, error: checkinErr } = await supabase
    .from('kids_checkins')
    .insert({
      church_id,
      child_id,
      room_id,
      wristband_number: String(wristband_number),
      event_date:       today,
      checkin_time:     new Date().toISOString(),
      checked_in_by:    checked_in_by.trim(),
      lgpd_consent:     true,
      lgpd_consent_at:  new Date().toISOString(),
    })
    .select('id, wristband_number, checkin_time')
    .single()

  if (checkinErr || !checkin) {
    console.error('[kids-checkin] Erro no check-in:', checkinErr?.message)
    return errResp('Erro ao registrar check-in', 500, origin)
  }

  console.log(`[kids-checkin] CHECK-IN church=${church_id} child=${child_id} pulseira=${wristband_number} sala=${room_id}`)

  return jsonResp({
    ok:               true,
    checkin_id:       checkin.id,
    child_id,
    wristband_number: checkin.wristband_number,
    room:             room.name,
    checkin_time:     checkin.checkin_time,
  }, 201, origin)
}

// ── 2. GET busca por pulseira ─────────────────────────────────

async function handleSearch(
  supabase:      ReturnType<typeof createClient>,
  church_id:     string,
  token_role:    string,
  token_room_id: string | null,
  wristband:     string,
  origin:        string | null,
): Promise<Response> {
  const today = todayBRT()

  const { data: checkin, error } = await supabase
    .from('kids_checkins')
    .select(`
      id, wristband_number, checkin_time, checkout_time, room_id,
      kids_children ( id, name, birth_date ),
      kids_rooms    ( id, name )
    `)
    .eq('church_id', church_id)
    .eq('wristband_number', wristband)
    .eq('event_date', today)
    .is('checkout_time', null)
    .maybeSingle()

  if (error) {
    console.error('[kids-checkin] Erro na busca:', error.message)
    return errResp('Erro na busca', 500, origin)
  }

  if (!checkin) {
    return errResp(`Pulseira ${wristband} não encontrada ou já saiu`, 404, origin)
  }

  // Professora só vê criança da PRÓPRIA sala
  if (token_role === 'teacher' && checkin.room_id !== token_room_id) {
    return errResp('Acesso negado: criança não está na sua sala', 403, origin)
  }

  const child = checkin.kids_children as any

  // Busca responsáveis
  const { data: guardians } = await supabase
    .from('kids_guardians')
    .select('name, phone, relationship, is_primary')
    .eq('child_id', child.id)
    .order('is_primary', { ascending: false })

  // Busca RESUMO de saúde (não o prontuário completo)
  const { data: healthRaw } = await supabase
    .from('person_health_info')
    .select('allergies, syndrome, emergency_medication')
    .eq('child_id', child.id)
    .eq('church_id', church_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return jsonResp({
    checkin_id:       checkin.id,
    wristband_number: checkin.wristband_number,
    checkin_time:     checkin.checkin_time,
    checkout_time:    checkin.checkout_time,
    room:             checkin.kids_rooms,
    child: {
      id:   child.id,
      name: child.name,
      age:  ageFromBirthdate(child.birth_date),
    },
    health_alert: summarizeHealth(healthRaw ?? null),
    guardians:    guardians ?? [],
  }, 200, origin)
}

// ── 3. PATCH check-out (professora, só da própria sala) ───────

async function handleCheckout(
  supabase:      ReturnType<typeof createClient>,
  req:           Request,
  church_id:     string,
  token_role:    string,
  token_room_id: string | null,
  origin:        string | null,
): Promise<Response> {
  if (token_role !== 'teacher') {
    return errResp('Apenas professoras podem fazer check-out', 403, origin)
  }
  if (!token_room_id) {
    return errResp('Token de professora sem sala configurada', 403, origin)
  }

  let body: any
  try { body = await req.json() } catch { return errResp('Body JSON inválido', 400, origin) }

  const { wristband_number, checked_out_by, guardian_verified } = body

  if (!wristband_number) return errResp('wristband_number obrigatório', 400, origin)
  if (!checked_out_by)   return errResp('checked_out_by obrigatório', 400, origin)

  // ⚠️ Trava de segurança — responsável DEVE ser verificado presencialmente
  if (guardian_verified !== true) {
    return errResp(
      'guardian_verified=true obrigatório — confirme a identidade do responsável antes de liberar a criança',
      400, origin,
    )
  }

  const today = todayBRT()

  // Busca check-in ativo hoje, nesta sala, nesta igreja
  const { data: checkin, error: findErr } = await supabase
    .from('kids_checkins')
    .select('id, child_id, kids_children(name)')
    .eq('church_id', church_id)
    .eq('wristband_number', String(wristband_number))
    .eq('event_date', today)
    .eq('room_id', token_room_id)    // ← só da sala da professora
    .is('checkout_time', null)
    .maybeSingle()

  if (findErr) {
    console.error('[kids-checkin] Erro ao buscar check-in:', findErr.message)
    return errResp('Erro ao buscar check-in', 500, origin)
  }

  if (!checkin) {
    return errResp(`Pulseira ${wristband_number} não encontrada na sua sala ou já saiu`, 404, origin)
  }

  const now = new Date().toISOString()

  const { error: updateErr } = await supabase
    .from('kids_checkins')
    .update({
      checkout_time:    now,
      checked_out_by:   checked_out_by.trim(),
      guardian_verified: true,
    })
    .eq('id', checkin.id)

  if (updateErr) {
    console.error('[kids-checkin] Erro no check-out:', updateErr.message)
    return errResp('Erro ao registrar saída', 500, origin)
  }

  const childName = (checkin.kids_children as any)?.name ?? 'criança'
  console.log(`[kids-checkin] CHECK-OUT church=${church_id} child=${checkin.child_id} pulseira=${wristband_number} por=${checked_out_by}`)

  return jsonResp({
    ok:            true,
    message:       `${childName} liberada com sucesso`,
    checkin_id:    checkin.id,
    checkout_time: now,
  }, 200, origin)
}

// ── 4. GET presentes na sala ──────────────────────────────────

async function handleRoomList(
  supabase:      ReturnType<typeof createClient>,
  church_id:     string,
  token_role:    string,
  token_room_id: string | null,
  origin:        string | null,
): Promise<Response> {
  if (token_role === 'teacher' && !token_room_id) {
    return errResp('Token de professora sem sala configurada', 403, origin)
  }

  const today = todayBRT()

  let query = supabase
    .from('kids_checkins')
    .select(`
      id, wristband_number, checkin_time, room_id,
      kids_children ( id, name, birth_date ),
      kids_rooms    ( id, name )
    `)
    .eq('church_id', church_id)
    .eq('event_date', today)
    .is('checkout_time', null)
    .order('checkin_time', { ascending: true })

  // Professora vê só a própria sala
  if (token_role === 'teacher') {
    query = query.eq('room_id', token_room_id!)
  }

  const { data: present, error } = await query

  if (error) {
    console.error('[kids-checkin] Erro ao listar sala:', error.message)
    return errResp('Erro ao listar presentes', 500, origin)
  }

  if (!present?.length) {
    return jsonResp({ total: 0, present: [], role: token_role }, 200, origin)
  }

  // Batch: responsável primário de cada criança
  const childIds = present.map(c => (c.kids_children as any)?.id).filter(Boolean)

  const [{ data: allPrimary }, { data: healthExist }] = await Promise.all([
    supabase
      .from('kids_guardians')
      .select('child_id, name, phone')
      .in('child_id', childIds)
      .eq('is_primary', true),
    supabase
      .from('person_health_info')
      .select('child_id')
      .in('child_id', childIds)
      .or('allergies.not.is.null,syndrome.not.is.null,emergency_medication.not.is.null'),
  ])

  const guardianMap = new Map((allPrimary ?? []).map(g => [g.child_id, { name: g.name, phone: g.phone }]))
  const healthSet   = new Set((healthExist ?? []).map(h => h.child_id))

  const enriched = present.map(c => {
    const child = c.kids_children as any
    return {
      checkin_id:       c.id,
      wristband_number: c.wristband_number,
      checkin_time:     c.checkin_time,
      room:             c.kids_rooms,
      child_name:       child?.name ?? '—',
      child_age:        ageFromBirthdate(child?.birth_date ?? null),
      guardian_primary: guardianMap.get(child?.id) ?? null,
      has_health_alert: healthSet.has(child?.id),
    }
  })

  return jsonResp({
    total:   enriched.length,
    present: enriched,
    role:    token_role,
    ...(token_role === 'teacher' ? { room_id: token_room_id } : {}),
  }, 200, origin)
}

// ── 5. GET rooms (contexto do token + lista de salas ativas) ──
// Usado pela página da secretária para popular o dropdown de salas

async function handleRoomsMeta(
  supabase:      ReturnType<typeof createClient>,
  church_id:     string,
  token_role:    string,
  token_room_id: string | null,
  token_label:   string | null,
  origin:        string | null,
): Promise<Response> {
  const [{ data: church }, { data: rooms }] = await Promise.all([
    supabase.from('churches').select('name').eq('id', church_id).single(),
    supabase
      .from('kids_rooms')
      .select('id, name, age_range')
      .eq('church_id', church_id)
      .eq('active', true)
      .order('name'),
  ])

  return jsonResp({
    church_name: church?.name ?? null,
    token_label,
    token_role,
    rooms: rooms ?? [],
  }, 200, origin)
}
