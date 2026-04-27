// ============================================================
// Edge Function: contact-consultant v2
// Registra pedido de contato com consultor + tenta enviar email.
//
// POST /contact-consultant
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { context: 'agent' | 'module' | 'plan', target_slug: string, origin_page?: string }
// Returns: SEMPRE 200 { success: true, message, request_id }
//
// Garantia: pastor nunca recebe erro.
// - INSERT em contact_requests: SEMPRE (fallback persistente)
// - Email via Resend: best-effort (email_sent=false se falhar/sem chave)
// - Admin Ekthos vê pedidos no banco para contato manual se email não saiu
//
// verify_jwt: false — validação manual (padrão ES256)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const RESEND_API_KEY            = Deno.env.get('RESEND_API_KEY') || ''
const ADMIN_EMAIL               = 'felipe@ekthosai.net'
const FROM_EMAIL                = 'noreply@ekthosai.net'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// ── CORS ─────────────────────────────────────────────────────
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonErr(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function jsonOk(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Labels amigáveis ─────────────────────────────────────────
const CONTEXT_LABEL: Record<string, string> = {
  agent:  'Agente IA',
  module: 'Módulo',
  plan:   'Upgrade de Plano',
}

// ── Envio via Resend (best-effort) ────────────────────────────
async function sendEmailViaResend(
  to: string, subject: string, html: string
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${res.status}: ${body}`)
  }
}

// ── Handler ──────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS })
  }
  if (req.method !== 'POST') {
    return jsonErr('Method not allowed', 405)
  }

  // ── Auth ───────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return jsonErr('Unauthorized', 401)
  const token = authHeader.slice(7)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return jsonErr('Unauthorized', 401)

  const churchId = user.app_metadata?.church_id as string | undefined
  if (!churchId) return jsonErr('Church not found in token', 400)

  // ── Body ───────────────────────────────────────────────────
  let body: { context?: string; target_slug?: string; origin_page?: string }
  try {
    body = await req.json()
  } catch {
    return jsonErr('Invalid JSON body', 400)
  }

  const { context, target_slug, origin_page } = body
  if (!context || !['agent', 'module', 'plan'].includes(context)) {
    return jsonErr('context must be "agent", "module" or "plan"', 400)
  }
  if (!target_slug || typeof target_slug !== 'string') {
    return jsonErr('target_slug is required', 400)
  }

  // ── Busca dados do pastor e da igreja ─────────────────────
  const [{ data: church }, { data: profile }, { data: subscription }] = await Promise.all([
    supabase.from('churches').select('name').eq('id', churchId).maybeSingle(),
    supabase.from('profiles').select('name, display_name').eq('user_id', user.id).maybeSingle(),
    supabase.from('subscriptions').select('plan_slug').eq('church_id', churchId).maybeSingle(),
  ])

  const pastorName     = profile?.display_name ?? profile?.name ?? 'Pastor'
  const pastorEmail    = user.email ?? ''
  const churchName     = church?.name ?? 'Igreja'
  const planAtRequest  = subscription?.plan_slug ?? 'desconhecido'
  const contextLabel   = CONTEXT_LABEL[context] ?? context

  // ── STEP 1: INSERT em contact_requests (sempre, antes do email) ──
  const { data: inserted, error: insertErr } = await supabase
    .from('contact_requests')
    .insert({
      church_id:       churchId,
      user_id:         user.id,
      pastor_name:     pastorName,
      pastor_email:    pastorEmail,
      church_name:     churchName,
      plan_at_request: planAtRequest,
      context,
      target_slug,
      origin_page:     origin_page ?? null,
      email_sent:      false,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    // Mesmo o INSERT falhando, não expor erro ao pastor (improvável com service_role)
    console.error('[contact-consultant] INSERT failed:', insertErr)
    return jsonOk({
      success: true,
      message: 'Recebemos sua mensagem, entraremos em contato em breve.',
      request_id: null,
    })
  }

  const requestId = inserted.id
  console.log(`[contact-consultant] request_id=${requestId} church=${churchName} pastor=${pastorName} context=${context} slug=${target_slug}`)

  // ── STEP 2: Envio de email (best-effort) ──────────────────
  if (!RESEND_API_KEY) {
    console.log(`[contact-consultant] RESEND_API_KEY não configurada — request_id=${requestId} salvo sem email`)
    return jsonOk({
      success: true,
      message: 'Recebemos sua mensagem, entraremos em contato em breve.',
      request_id: requestId,
    })
  }

  const subject = `[Ekthos] Consultor solicitado — ${contextLabel}: ${target_slug}`
  const html = `
    <h2 style="font-family:sans-serif;color:#161616;">Solicitação de Consultor — Ekthos Church</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;width:100%;max-width:480px;">
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Igreja</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${churchName}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Pastor</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${pastorName}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Email</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${pastorEmail}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Plano</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${planAtRequest}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Interesse</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${contextLabel}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Slug</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${target_slug}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">Origem</td><td style="padding:8px 12px;border:1px solid #e0e0e0;">${origin_page ?? '—'}</td></tr>
      <tr><td style="padding:8px 12px;font-weight:bold;background:#f5f5f5;border:1px solid #e0e0e0;">request_id</td><td style="padding:8px 12px;border:1px solid #e0e0e0;font-size:12px;color:#666;">${requestId}</td></tr>
    </table>
    <p style="margin-top:16px;font-family:sans-serif;font-size:12px;color:#999;">
      Data: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}<br>
      <a href="https://ekthos-platform.vercel.app/admin/churches">Ver no Cockpit Admin</a>
    </p>
  `

  try {
    await sendEmailViaResend(ADMIN_EMAIL, subject, html)

    // Atualiza registro como email_sent=true
    await supabase
      .from('contact_requests')
      .update({ email_sent: true, email_sent_at: new Date().toISOString() })
      .eq('id', requestId)

    console.log(`[contact-consultant] email enviado — request_id=${requestId}`)
  } catch (emailErr) {
    const errMsg = emailErr instanceof Error ? emailErr.message : String(emailErr)
    console.error(`[contact-consultant] email falhou — request_id=${requestId} err=${errMsg}`)

    // Registra falha de email sem bloquear pastor
    await supabase
      .from('contact_requests')
      .update({ email_error: errMsg })
      .eq('id', requestId)
  }

  // ── STEP 3: Sempre retorna 200 ────────────────────────────
  return jsonOk({
    success: true,
    message: 'Recebemos sua mensagem, entraremos em contato em breve.',
    request_id: requestId,
  })
})
