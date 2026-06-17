// ============================================================
// Edge Function: igv-public-enrollment  (verify_jwt = false)
//
// POST /functions/v1/igv-public-enrollment
// Body: { course_id, name, phone, email? }
//
// Fluxo:
//   1. Valida course (existe, público, ativo, não lotado)
//   2. Insere em course_enrollments (UNIQUE course_id+phone → dedup)
//   3. Upsert em people (padrão visitor-capture: LGPD, source, stage)
//   4. Incrementa enrolled_count atomicamente
//
// LGPD R8: zero dado pessoal exposto na resposta.
// Hardcoded para IGV — sem parâmetro church_id.
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

  let body: { course_id?: string; name?: string; phone?: string; email?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Body inválido' }), { status: 400, headers: json })
  }

  const { course_id, name, phone, email } = body

  // Validação básica
  if (!course_id || !name || !phone) {
    return new Response(JSON.stringify({ error: 'Campos obrigatórios: course_id, name, phone' }), { status: 400, headers: json })
  }
  if (name.trim().length < 2) {
    return new Response(JSON.stringify({ error: 'Nome muito curto' }), { status: 400, headers: json })
  }

  const cleanPhone = sanitizePhone(phone)
  const cleanName  = name.trim()
  const cleanEmail = email?.trim() || null

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Verificar curso
  const { data: course, error: courseErr } = await supabase
    .from('church_courses')
    .select('id, title, is_public, active, max_capacity, enrolled_count')
    .eq('id', course_id)
    .eq('church_id', IGV_CHURCH_ID)
    .maybeSingle()

  if (courseErr || !course) {
    return new Response(JSON.stringify({ error: 'Curso não encontrado' }), { status: 404, headers: json })
  }
  if (!course.is_public || !course.active) {
    return new Response(JSON.stringify({ error: 'Curso indisponível' }), { status: 400, headers: json })
  }
  if (course.max_capacity !== null && course.enrolled_count >= course.max_capacity) {
    return new Response(JSON.stringify({ error: 'Vagas esgotadas para este curso' }), { status: 409, headers: json })
  }

  // 2. Inserir inscrição (UNIQUE course_id+phone previne duplicata)
  const { error: enrollErr } = await supabase
    .from('course_enrollments')
    .insert({
      church_id: IGV_CHURCH_ID,
      course_id,
      name:      cleanName,
      phone:     cleanPhone,
      email:     cleanEmail,
    })

  if (enrollErr) {
    if (enrollErr.code === '23505') {
      // Violação de UNIQUE: já inscrito
      return new Response(
        JSON.stringify({ error: 'Você já está inscrito neste curso!', already_enrolled: true }),
        { status: 409, headers: json }
      )
    }
    console.error('enrollment insert error:', enrollErr)
    return new Response(JSON.stringify({ error: 'Erro ao processar inscrição' }), { status: 500, headers: json })
  }

  // 3. Incrementar enrolled_count atomicamente
  await supabase.rpc('increment_course_enrolled', { p_course_id: course_id })
    .then(({ error: rpcErr }) => {
      if (rpcErr) {
        // Fallback: UPDATE direto se RPC não existir ainda
        return supabase
          .from('church_courses')
          .update({ enrolled_count: course.enrolled_count + 1 })
          .eq('id', course_id)
      }
    })

  // 4. Upsert em people (padrão visitor-capture — LGPD R8)
  const today = new Date().toISOString().split('T')[0]
  const { data: existingPerson } = await supabase
    .from('people')
    .select('id')
    .eq('church_id', IGV_CHURCH_ID)
    .eq('phone', cleanPhone)
    .maybeSingle()

  if (existingPerson) {
    // Pessoa existente: atualiza last_contact
    await supabase
      .from('people')
      .update({ last_contact_at: new Date().toISOString(), name: cleanName })
      .eq('id', existingPerson.id)

    // Associar person_id à inscrição
    await supabase
      .from('course_enrollments')
      .update({ person_id: existingPerson.id })
      .eq('course_id', course_id)
      .eq('phone', cleanPhone)
  } else {
    // Pessoa nova: criar no CRM com LGPD consent
    const { data: newPerson } = await supabase
      .from('people')
      .insert({
        church_id:        IGV_CHURCH_ID,
        name:             cleanName,
        phone:            cleanPhone,
        email:            cleanEmail,
        source:           'curso_igv',
        person_stage:     'visitante',
        lgpd_consent:     true,
        lgpd_consent_at:  new Date().toISOString(),
        first_visit_date: today,
        last_contact_at:  new Date().toISOString(),
        is_volunteer:     false,
      })
      .select('id')
      .maybeSingle()

    if (newPerson) {
      await supabase
        .from('course_enrollments')
        .update({ person_id: newPerson.id })
        .eq('course_id', course_id)
        .eq('phone', cleanPhone)
    }
  }

  return new Response(
    JSON.stringify({ success: true, message: 'Inscrição confirmada! Em breve entraremos em contato.' }),
    { status: 200, headers: json }
  )
})
