// supabase/functions/admin-agent-grant/index.ts
// Sprint 3A.1 — Grant/Revoke de agente premium via cockpit admin
// verify_jwt: false — validação manual abaixo

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')      ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function jsonResponse(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  })
}

// SA-B7 MEGA-ONDA SEGURANÇA: CORS origin validation (fix RISK-001)
// Reflete apenas origens conhecidas; rejeita todas as demais.
const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
  'https://app.ekthosai.com',
]

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req)

  // Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors })
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return jsonResponse({ error: 'Method not allowed' }, 405, cors)
  }

  // ── 1. Validate JWT ───────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    return jsonResponse({ error: 'unauthorized: missing token' }, 401, cors)
  }

  // ── 2. CRITICAL: Call RPCs with USER token so auth.uid() and ─
  // ── is_ekthos_admin() work correctly inside SECURITY DEFINER ──
  const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  // Verify identity with user token
  const { data: { user }, error: authErr } = await supabaseUser.auth.getUser()
  if (authErr || !user) {
    return jsonResponse({ error: 'unauthorized: invalid token' }, 401, cors)
  }

  // Verify admin Ekthos via app_metadata
  const isAdmin = (user.app_metadata ?? {})['is_ekthos_admin'] === true
  if (!isAdmin) {
    return jsonResponse({ error: 'forbidden: not ekthos admin' }, 403, cors)
  }

  // ── 3. Parse body ─────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid JSON body' }, 400, cors)
  }

  // ── DELETE = Revogar ──────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { church_id, agent_slug } = body
    if (!church_id || !agent_slug) {
      return jsonResponse({ error: 'church_id e agent_slug são obrigatórios' }, 400, cors)
    }

    const { data, error } = await supabaseUser.rpc('admin_revoke_agent', {
      p_church_id:  church_id as string,
      p_agent_slug: agent_slug as string,
    })
    if (error) {
      return jsonResponse({ error: error.message }, 400, cors)
    }
    return jsonResponse(data, 200, cors)
  }

  // ── POST = Habilitar ──────────────────────────────────────────
  const {
    church_id,
    agent_slug,
    grant_type,
    duration_days,
    notes,
    stripe_payment_intent_id,
  } = body

  // Validate required fields
  if (!church_id)  return jsonResponse({ error: 'church_id é obrigatório' }, 400, cors)
  if (!agent_slug) return jsonResponse({ error: 'agent_slug é obrigatório' }, 400, cors)
  if (!grant_type) return jsonResponse({ error: 'grant_type é obrigatório' }, 400, cors)

  if (!['trial', 'courtesy', 'paid'].includes(grant_type as string)) {
    return jsonResponse({ error: 'grant_type deve ser trial, courtesy ou paid' }, 400, cors)
  }

  if (grant_type === 'trial' && (!duration_days || Number(duration_days) <= 0)) {
    return jsonResponse({ error: 'trial exige duration_days > 0' }, 400, cors)
  }

  if (grant_type === 'paid' && !stripe_payment_intent_id) {
    return jsonResponse({ error: 'paid exige stripe_payment_intent_id' }, 400, cors)
  }

  const { data, error } = await supabaseUser.rpc('admin_grant_agent', {
    p_church_id:                church_id as string,
    p_agent_slug:               agent_slug as string,
    p_grant_type:               grant_type as string,
    p_duration_days:            duration_days != null ? Number(duration_days) : null,
    p_notes:                    (notes as string) ?? null,
    p_stripe_payment_intent_id: (stripe_payment_intent_id as string) ?? null,
  })

  if (error) {
    return jsonResponse({ error: error.message }, 400, cors)
  }

  // ── Registra grant via record_audit_event ──────────────────
  const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
  const requestId = req.headers.get('x-request-id') ?? null
  const { error: auditErr } = await supabaseUser.rpc('record_audit_event', {
    p_church_id:                church_id as string,
    p_admin_user_id:            user.id,
    p_action:                   'church.agent.grant',
    p_before:                   null,
    p_after: {
      agent_slug,
      grant_type,
      duration_days: duration_days != null ? Number(duration_days) : null,
      stripe_payment_intent_id,
      notes,
    },
    p_reason:                   null,
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'church_agent_subscriptions',
    p_resource_id:              null,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: impersonationSessionId,
    p_impersonated_church_id:   church_id as string,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  })
  if (auditErr) console.error('[admin-agent-grant] audit failed:', auditErr.message)

  return jsonResponse(data, 201, cors)
})
