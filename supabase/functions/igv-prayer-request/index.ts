// ============================================================
// Edge Function: igv-prayer-request  v1  (verify_jwt = false)
//
// POST /functions/v1/igv-prayer-request
// Body: { name, phone, request_text }
//
// Fluxo:
//   1. Valida name, phone, request_text (presença + comprimento)
//   2. Upsert em people (source='oracao_igv', LGPD consent)
//   3. INSERT prayer_requests via service_role (bypassa RLS)
//   4. Se pessoa NOVA: fire-and-forget dispatch-person-event
//      → agente-acolhimento só dispara se IGV tiver contrato ativo (R-PREMIUM-GUARD)
//
// LGPD R8: request_text NUNCA em log. Zero dado pessoal na resposta.
// Hardcoded para IGV — sem parâmetro church_id externo.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const IGV_CHURCH_ID = '6c127559-874a-4748-8fce-55d4079613a5'

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com', 'https://ekthosai.com',
  'https://ekthosai.net',     'https://www.ekthosai.net',
  'http://localhost:5173',    'http://localhost:5201',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  }
}

function sanitizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 12) return `+${digits}`
  return `+55${digits}`
}

Deno.serve(async (req: Request) => {
  const origin  = req.headers.get('origin')
  const headers = corsHeaders(origin)
  const json    = { ...headers, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: json })
  }

  let body: { name?: string; phone?: string; request_text?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), { status: 400, headers: json })
  }

  const { name, phone, request_text } = body

  if (!name?.trim() || !phone?.trim() || !request_text?.trim()) {
    return new Response(JSON.stringify({ error: 'Campos obrigatórios: name, phone, request_text' }), { status: 400, headers: json })
  }
  if (name.trim().length < 2) {
    return new Response(JSON.stringify({ error: 'Nome muito curto' }), { status: 400, headers: json })
  }
  if (request_text.trim().length < 10) {
    return new Response(JSON.stringify({ error: 'Pedido muito curto — descreva um pouco mais' }), { status: 400, headers: json })
  }

  const cleanPhone = sanitizePhone(phone)
  const cleanName  = name.trim()
  // request_text limpo mas NUNCA logado
  const cleanText  = request_text.trim()

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 1. Verificar se pessoa já existe (por phone + church) ──
  const { data: existingPerson } = await supabase
    .from('people')
    .select('id, person_stage')
    .eq('church_id', IGV_CHURCH_ID)
    .eq('phone', cleanPhone)
    .maybeSingle()

  let personId: string
  let isNewPerson = false

  if (existingPerson) {
    // Pessoa existente: atualiza nome e last_contact
    await supabase
      .from('people')
      .update({ name: cleanName, last_contact_at: new Date().toISOString() })
      .eq('id', existingPerson.id)

    personId = existingPerson.id
  } else {
    // Pessoa nova: cria no CRM com LGPD consent
    const today = new Date().toISOString().split('T')[0]
    const { data: newPerson, error: insertErr } = await supabase
      .from('people')
      .insert({
        church_id:        IGV_CHURCH_ID,
        name:             cleanName,
        phone:            cleanPhone,
        source:           'oracao_igv',
        person_stage:     'visitante',
        lgpd_consent:     true,
        lgpd_consent_at:  new Date().toISOString(),
        first_visit_date: today,
        last_contact_at:  new Date().toISOString(),
        is_volunteer:     false,
        is_bulk_import:   false,
      })
      .select('id')
      .maybeSingle()

    if (insertErr || !newPerson) {
      console.error('[igv-prayer-request] erro ao criar pessoa:', insertErr?.code)
      return new Response(JSON.stringify({ error: 'Erro interno. Tente novamente.' }), { status: 500, headers: json })
    }

    personId  = newPerson.id
    isNewPerson = true
  }

  // ── 2. INSERT prayer_requests (service_role bypassa RLS) ──
  const { error: prayerErr } = await supabase
    .from('prayer_requests')
    .insert({
      church_id:    IGV_CHURCH_ID,
      person_id:    personId,
      name:         cleanName,
      phone:        cleanPhone,
      request_text: cleanText,
      status:       'novo',
      is_test:      false,
    })

  if (prayerErr) {
    console.error('[igv-prayer-request] erro ao inserir pedido:', prayerErr.code)
    return new Response(JSON.stringify({ error: 'Erro ao salvar pedido. Tente novamente.' }), { status: 500, headers: json })
  }

  // ── 3. Se pessoa nova: fire-and-forget dispatch-person-event ──
  // R-PREMIUM-GUARD aplicado DENTRO do dispatch-person-event (blindado v35)
  // NUNCA modifica o agente — só chama pela porta existente
  if (isNewPerson) {
    fetch(`${SUPABASE_URL}/functions/v1/dispatch-person-event`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ person_id: personId, event: 'person_created' }),
      signal: AbortSignal.timeout(8000),
    }).catch((err) => {
      // fire-and-forget: nunca bloqueia a resposta ao usuário
      console.error('[igv-prayer-request] dispatch fire-and-forget falhou:', err?.message)
    })
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Recebemos seu pedido. Estamos orando por você.' }),
    { status: 200, headers: json }
  )
})
