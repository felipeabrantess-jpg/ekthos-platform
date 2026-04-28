// ============================================================
// Edge Function: visitor-capture
// Frente B — Captura de visitantes via QR Code físico.
//
// POST /functions/v1/visitor-capture
// verify_jwt = false — visitante NÃO tem conta no sistema
//
// Segurança:
//   - CORS: whitelist de origens (nunca wildcard)
//   - Rate limit: 5/h por IP + dedup 24h por (phone + church_id)
//   - Bloqueios silenciosos: retornam 200 OK (anti-bot / anti-enumeration)
//   - Slug inválido retorna 200 success (anti-enumeration de slugs)
//   - Erros internos nunca expostos ao cliente
//
// Fluxo:
//   1. Validar payload
//   2. Resolver church por slug em qr_codes (slug inválido → 200 silencioso)
//   3. Rate limit por IP + dedup 24h por (phone + church_id)
//   4. Sanitizar phone (dígitos + prefixo +55 BR)
//   5. Upsert person (INSERT nova ou UPDATE se phone já existe)
//   6. RPC capture_visitor_to_pipeline → inserir em entry point
//   7. RPC increment_qr_scanned_count → contador atômico
//   8. Auditoria de rate limit
//   9. Retornar 200 { success: true }
//
// Nota: WhatsApp best-effort está desabilitado nesta versão
// porque o import de _shared/whatsapp-api.ts + supabase-client.ts
// causa conflito de singleton que resulta em EDGE_FUNCTION_ERROR 500.
// TODO: refatorar para injetar sendTextMessage via parâmetro ou
//       chamar via supabase.functions.invoke() para isolamento.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// CORS — whitelist explícita, nunca wildcard
const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com',
  'https://ekthosai.com',
  'https://ekthosai.net',
  'https://www.ekthosai.net',
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

// Validações
const EMAIL_REGEX        = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_DIGITS_REGEX = /^\d{10,11}$/  // BR: DDD (2) + número (8 ou 9)

// Sanitiza phone: mantém apenas dígitos e adiciona +55 se for número BR
function sanitizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 12 || digits.length === 13) return '+' + digits  // já tem código país
  if (PHONE_DIGITS_REGEX.test(digits)) return '+55' + digits             // BR sem código
  return '+' + digits
}

// Resposta 200 silenciosa — usada em bloqueios e em sucesso real
function ok200(headers: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ success: true, message: 'Cadastro realizado!' }),
    { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } }
  )
}

// ============================================================
// Handler principal
// ============================================================
Deno.serve(async (req: Request) => {
  const origin  = req.headers.get('origin')
  const headers = corsHeaders(origin)
  const json    = { ...headers, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: json })
  }

  try {
    const ip        = (req.headers.get('x-forwarded-for') ?? '0.0.0.0').split(',')[0].trim()
    const userAgent = req.headers.get('user-agent') ?? 'unknown'

    // ── 1. Parse e validação do payload ──────────────────────
    let payload: Record<string, unknown>
    try {
      payload = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: json })
    }

    const slug          = typeof payload.slug            === 'string' ? payload.slug.trim()            : null
    const name          = typeof payload.name            === 'string' ? payload.name.trim()            : null
    const phone         = typeof payload.phone           === 'string' ? payload.phone.trim()           : null
    const email         = typeof payload.email           === 'string' ? payload.email.trim()           : null
    const invitedByName = typeof payload.invited_by_name === 'string' ? payload.invited_by_name.trim() : null

    if (!slug || !name || name.length < 3 || !phone) {
      return new Response(JSON.stringify({ error: 'Campos obrigatórios inválidos' }), { status: 400, headers: json })
    }
    if (email && !EMAIL_REGEX.test(email)) {
      return new Response(JSON.stringify({ error: 'Email inválido' }), { status: 400, headers: json })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 2. Resolver church_id por slug ─────────────────────
    const { data: qrRow } = await supabase
      .from('qr_codes')
      .select('church_id')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()

    if (!qrRow?.church_id) {
      console.warn('[visitor-capture] Slug não encontrado ou inativo:', slug)
      return ok200(headers)
    }

    const churchId   = qrRow.church_id as string
    const phoneClean = sanitizePhone(phone)

    // ── 3. Rate limit: máximo 5/h por IP ─────────────────
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: ipCount } = await supabase
      .from('visitor_capture_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('was_blocked', false)
      .gte('submitted_at', oneHourAgo)

    if ((ipCount ?? 0) >= MAX_PER_IP_PER_HOUR) {
      await supabase.from('visitor_capture_rate_limits').insert({
        ip, phone: phoneClean, church_id: churchId, user_agent: userAgent,
        was_blocked: true, block_reason: 'ip_rate_limit',
      })
      console.warn('[visitor-capture] IP bloqueado:', ip)
      return ok200(headers)
    }

    // ── 4. Dedup: 1 submissão por (phone + church_id) em 24h ─
    const dedupWindow = new Date(Date.now() - DEDUP_HOURS * 60 * 60 * 1000).toISOString()
    const { count: dupCount } = await supabase
      .from('visitor_capture_rate_limits')
      .select('id', { count: 'exact', head: true })
      .eq('phone', phoneClean)
      .eq('church_id', churchId)
      .eq('was_blocked', false)
      .gte('submitted_at', dedupWindow)

    if ((dupCount ?? 0) >= 1) {
      await supabase.from('visitor_capture_rate_limits').insert({
        ip, phone: phoneClean, church_id: churchId, user_agent: userAgent,
        was_blocked: true, block_reason: 'duplicate_24h',
      })
      console.warn('[visitor-capture] Dedup 24h:', phoneClean, '@', churchId)
      return ok200(headers)
    }

    // ── 5. Upsert person ──────────────────────────────────
    const { data: existing } = await supabase
      .from('people')
      .select('id')
      .eq('church_id', churchId)
      .eq('phone', phoneClean)
      .maybeSingle()

    // Inicializado como string vazia para evitar erro TS de variável não atribuída
    let personId = ''

    if (existing?.id) {
      // Pessoa já existe — atualiza metadados de contato
      const updates: Record<string, unknown> = { last_contact_at: new Date().toISOString() }
      // invitedByName vai para observacoes_pastorais (como_conheceu só aceita enum fixo)
      if (invitedByName) updates.observacoes_pastorais = 'Convidado por: ' + invitedByName

      const { error: updErr } = await supabase.from('people').update(updates).eq('id', existing.id)
      if (updErr) console.warn('[visitor-capture] UPDATE person falhou (não crítico):', updErr.message)
      personId = existing.id as string
      console.log('[visitor-capture] Pessoa existente atualizada:', personId)
    } else {
      // Pessoa nova
      const { data: newPerson, error: insertErr } = await supabase
        .from('people')
        .insert({
          church_id:             churchId,
          name:                  name,
          phone:                 phoneClean,
          email:                 email ?? null,
          source:                'qr_code',
          // como_conheceu não enviado — aceita apenas enum fixo, não texto livre
          observacoes_pastorais: invitedByName ? 'Convidado por: ' + invitedByName : null,
          first_visit_date:      new Date().toISOString().split('T')[0],
          last_contact_at:       new Date().toISOString(),
          person_stage:          'visitante',
          lgpd_consent:          true,
          is_volunteer:          false,
        })
        .select('id')
        .single()

      if (insertErr || !newPerson) {
        console.error('[visitor-capture] INSERT people falhou:', insertErr?.message)
        return ok200(headers)  // sucesso silencioso — não expor erros internos
      }

      personId = (newPerson as { id: string }).id
      console.log('[visitor-capture] Pessoa criada:', personId)
    }

    if (!personId) return ok200(headers)

    // ── 6. Pipeline entry point ───────────────────────────
    const { error: pipelineErr } = await supabase.rpc('capture_visitor_to_pipeline', {
      p_church_id: churchId,
      p_person_id: personId,
    })
    if (pipelineErr) {
      console.warn('[visitor-capture] Pipeline RPC falhou (não crítico):', pipelineErr.message)
    }

    // ── 7. Contador atômico de scans ──────────────────────
    const { error: incErr } = await supabase.rpc('increment_qr_scanned_count', { p_church_id: churchId })
    if (incErr) console.warn('[visitor-capture] Increment falhou (não crítico):', incErr.message)

    // ── 8. Auditoria de rate limit (submissão bem-sucedida) ─
    await supabase.from('visitor_capture_rate_limits').insert({
      ip, phone: phoneClean, church_id: churchId,
      user_agent: userAgent, was_blocked: false,
    })

    // ── 9. Disparar evento de pessoa (fire-and-forget) ────
    // Apenas para pessoas NOVAS — não dispara re-scan (pessoa existente)
    if (!existing?.id && personId) {
      fetch(
        SUPABASE_URL + '/functions/v1/dispatch-person-event',
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + SERVICE_ROLE_KEY,
          },
          body:   JSON.stringify({ person_id: personId, event: 'person_created' }),
          signal: AbortSignal.timeout(10_000),
        }
      ).catch(e => console.warn('[visitor-capture] dispatch-person-event falhou (não crítico):', (e as Error).message))
    }

    return ok200(headers)

  } catch (e: unknown) {
    // Fallback: nunca expor erros internos ao cliente
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[visitor-capture] UNHANDLED EXCEPTION:', msg)
    return ok200(headers)
  }
})
