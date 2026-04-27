// ============================================================
// Edge Function: contact-consultant
// Notifica admin Ekthos quando pastor quer falar sobre
// contratação de agente, módulo ou upgrade de plano.
//
// POST /contact-consultant
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { context: 'agent' | 'module' | 'plan', target_slug: string }
// Returns: 200 { ok: true }
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

// ── Envio de email via Resend ─────────────────────────────────
async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  if (!RESEND_API_KEY) {
    console.log('[contact-consultant] RESEND_API_KEY not set — email skipped')
    console.log(`TO: ${to} | SUBJECT: ${subject}`)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to, subject, html }),
  })
  if (!res.ok) {
    const err = await res.text()
    console.error('[contact-consultant] Resend error:', err)
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
  let body: { context?: string; target_slug?: string }
  try {
    body = await req.json()
  } catch {
    return jsonErr('Invalid JSON body', 400)
  }

  const { context, target_slug } = body
  if (!context || !['agent', 'module', 'plan'].includes(context)) {
    return jsonErr('context must be "agent", "module" or "plan"', 400)
  }
  if (!target_slug || typeof target_slug !== 'string') {
    return jsonErr('target_slug is required', 400)
  }

  // ── Busca dados da igreja e pastor ────────────────────────
  const [{ data: church }, { data: profile }] = await Promise.all([
    supabase.from('churches').select('name').eq('id', churchId).maybeSingle(),
    supabase.from('profiles').select('name, display_name').eq('user_id', user.id).maybeSingle(),
  ])

  const pastorName  = profile?.display_name ?? profile?.name ?? user.email ?? 'Pastor'
  const churchName  = church?.name ?? 'Igreja'
  const contextLabel = CONTEXT_LABEL[context] ?? context
  const subject     = `[Ekthos] Consultor solicitado — ${contextLabel}: ${target_slug}`

  const html = `
    <h2>Solicitação de Consultor — Ekthos Church</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse;">
      <tr><td style="padding:6px 12px;font-weight:bold;">Igreja</td><td style="padding:6px 12px;">${churchName}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;">Pastor</td><td style="padding:6px 12px;">${pastorName}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;">Email</td><td style="padding:6px 12px;">${user.email}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;">Interesse</td><td style="padding:6px 12px;">${contextLabel}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;">Slug</td><td style="padding:6px 12px;">${target_slug}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold;">Data</td><td style="padding:6px 12px;">${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td></tr>
    </table>
    <p style="margin-top:16px;font-size:12px;color:#666;">
      Acesse o <a href="https://ekthos-platform.vercel.app/admin/churches">Cockpit Admin</a> para ver detalhes da igreja.
    </p>
  `

  await sendEmail(ADMIN_EMAIL, subject, html)

  console.log(`[contact-consultant] Request logged — church=${churchName} pastor=${pastorName} context=${context} slug=${target_slug}`)

  return jsonOk({ ok: true, context, target_slug })
})
