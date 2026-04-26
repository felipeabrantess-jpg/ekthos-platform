// ============================================================
// Edge Function: lead-capture (hardened)
// Recebe dados de interesse dos planos Missão / Avivamento
// e salva na tabela `leads` para follow-up consultivo.
//
// POST /functions/v1/lead-capture
// verify_jwt = false — pastor não tem conta ainda
//
// Segurança:
//   - CORS: whitelist de origens (fecha SEC-003 nesta EF)
//   - Rate limit: 5/h por IP + dedup 24h por (email + plano)
//   - Bloqueios silenciosos: retornam 200 sem revelar motivo (anti-bot)
//   - Captura de IP (x-forwarded-for) e User-Agent para auditoria
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// CORS — whitelist explícita, nunca wildcard (SEC-003)
const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com',
  'https://ekthosai.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  }
}

// Rate limit thresholds
const MAX_PER_IP_PER_HOUR = 5
const DEDUP_HOURS         = 24

// Validação de email
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

Deno.serve(async (req: Request) => {
  const origin  = req.headers.get('origin')
  const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers })
  }

  // Captura IP e UA para rate limit e auditoria
  const ip        = (req.headers.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim()
  const userAgent = req.headers.get('user-agent') ?? 'unknown'

  let payload: Record<string, string>
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers })
  }

  const {
    name, email, phone, church_name, estimated_members,
    plan_interest, utm_source, utm_medium, utm_campaign, utm_content,
  } = payload

  // Validação de campos obrigatórios
  if (!name?.trim() || !email?.trim() || !phone?.trim() || !church_name?.trim() || !plan_interest?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Campos obrigatórios faltando' }),
      { status: 400, headers }
    )
  }

  if (!EMAIL_REGEX.test(email)) {
    return new Response(
      JSON.stringify({ error: 'Email inválido' }),
      { status: 400, headers }
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ============================================================
  // RATE LIMIT 1: máximo 5 submissões por IP por hora
  // ============================================================
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: ipCount } = await supabase
    .from('lead_capture_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('ip_address', ip)
    .eq('was_blocked', false)
    .gte('submitted_at', oneHourAgo)

  if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
    // Log silencioso do bloqueio para auditoria — retorna 200 para não revelar ao bot
    await supabase.from('lead_capture_rate_limits').insert({
      ip_address: ip, email, plan_interest, user_agent: userAgent,
      was_blocked: true, block_reason: 'ip_rate_limit',
    })
    console.warn(`[lead-capture] IP bloqueado: ${ip} (rate limit)`)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  // ============================================================
  // RATE LIMIT 2: deduplicação por (email + plan_interest) em 24h
  // ============================================================
  const dedupWindow = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000).toISOString()
  const { count: dupCount } = await supabase
    .from('lead_capture_rate_limits')
    .select('id', { count: 'exact', head: true })
    .eq('email', email.trim().toLowerCase())
    .eq('plan_interest', plan_interest.trim())
    .eq('was_blocked', false)
    .gte('submitted_at', dedupWindow)

  if ((dupCount ?? 0) >= 1) {
    await supabase.from('lead_capture_rate_limits').insert({
      ip_address: ip, email, plan_interest, user_agent: userAgent,
      was_blocked: true, block_reason: 'duplicate_24h',
    })
    console.warn(`[lead-capture] Dedup bloqueado: ${email} + ${plan_interest}`)
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
  }

  // ============================================================
  // INSERT no leads (passou nos rate limits)
  // ============================================================
  const { error: leadError } = await supabase.from('leads').insert({
    name:              name.trim(),
    email:             email.trim().toLowerCase(),
    phone:             phone.trim(),
    church_name:       church_name.trim(),
    estimated_members: estimated_members?.trim() ?? null,
    plan_interest:     plan_interest.trim(),
    status:            'new',
    utm_source:        utm_source?.trim()   ?? null,
    utm_medium:        utm_medium?.trim()   ?? null,
    utm_campaign:      utm_campaign?.trim() ?? null,
    // utm_content armazenado em notes (sem coluna própria por enquanto)
    notes: utm_content?.trim() ? `utm_content: ${utm_content.trim()}` : null,
  })

  if (leadError) {
    console.error('[lead-capture] INSERT leads falhou:', leadError)
    return new Response(
      JSON.stringify({ error: 'Erro ao salvar lead' }),
      { status: 500, headers }
    )
  }

  // Registra submissão bem-sucedida para tracking de rate limit futuro
  await supabase.from('lead_capture_rate_limits').insert({
    ip_address: ip, email: email.trim().toLowerCase(),
    plan_interest: plan_interest.trim(),
    user_agent: userAgent, was_blocked: false,
  })

  console.log(`[lead-capture] Lead salvo: ${email} | Plano: ${plan_interest}`)

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
})
