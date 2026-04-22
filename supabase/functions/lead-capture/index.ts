// ============================================================
// Edge Function: lead-capture
// Recebe dados de interesse dos planos Missão / Avivamento
// e salva na tabela `leads` para follow-up consultivo.
//
// POST /functions/v1/lead-capture
// verify_jwt = false — pastor não tem conta ainda
//
// Body: {
//   name:              string  (obrigatório)
//   email:             string  (obrigatório)
//   phone:             string  (obrigatório)
//   church_name:       string  (obrigatório)
//   estimated_members: string  (ex: "100-300")
//   plan_interest:     string  (ex: "Missão" | "Avivamento")
//   utm_source?:       string
//   utm_medium?:       string
//   utm_campaign?:     string
// }
//
// Returns: { success: true, message: string }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || '*'

// Service role bypasses RLS — necessário pois o pastor não tem JWT
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Método não permitido' }, 405)
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  const { name, email, phone, church_name, estimated_members, plan_interest, utm_source, utm_medium, utm_campaign } = body

  // Validação dos campos obrigatórios
  const missing: string[] = []
  if (!name?.trim())         missing.push('name')
  if (!email?.trim())        missing.push('email')
  if (!phone?.trim())        missing.push('phone')
  if (!church_name?.trim())  missing.push('church_name')
  if (!plan_interest?.trim()) missing.push('plan_interest')

  if (missing.length > 0) {
    return json({ error: `Campos obrigatórios ausentes: ${missing.join(', ')}` }, 422)
  }

  // Validação básica de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return json({ error: 'Email inválido' }, 422)
  }

  // Inserção na tabela leads
  const { error } = await supabase.from('leads').insert({
    name:              name.trim(),
    email:             email.trim().toLowerCase(),
    phone:             phone.trim(),
    church_name:       church_name.trim(),
    estimated_members: estimated_members?.trim() ?? null,
    plan_interest:     plan_interest.trim(),
    status:            'new',
    utm_source:        utm_source?.trim() ?? null,
    utm_medium:        utm_medium?.trim() ?? null,
    utm_campaign:      utm_campaign?.trim() ?? null,
  })

  if (error) {
    console.error('[lead-capture] Erro ao inserir lead:', error)
    return json({ error: 'Erro interno. Tente novamente.' }, 500)
  }

  console.log(`[lead-capture] Lead registrado: ${email} | Plano: ${plan_interest}`)

  return json({
    success: true,
    message: 'Lead registrado com sucesso',
  })
})
