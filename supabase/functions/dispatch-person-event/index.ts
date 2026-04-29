// ============================================================
// Edge Function: dispatch-person-event
// Sistema genérico de eventos de pessoa — Frente B (extensível).
//
// POST /functions/v1/dispatch-person-event
// verify_jwt = false — chamada interna via service_role Bearer
//
// Body: { person_id: string, event: 'person_created' }
//
// Lógica de elegibilidade para webhook de boas-vindas:
//   1. source IN captacao_sources → elegível
//   2. is_bulk_import = false     → elegível
//   3. church_settings.welcome_automation_enabled = true → elegível
//   4. n8n_webhooks.people_url IS NOT NULL + is_active=true → dispara
//
// Se qualquer condição falhar: log 'person_event_skipped' + 200.
// Nunca bloqueia o fluxo do chamador.
//
// Payload enviado ao webhook:
//   {
//     event: 'person_welcome_eligible',
//     church_id, church_slug, church_name,
//     person_id, person: { name, phone, email, person_stage,
//                          source, como_conheceu, observacoes_pastorais,
//                          first_visit_date },
//     pipeline_stage_id,
//     dispatched_at
//   }
//
// Headers: Content-Type, X-Ekthos-Event, X-Ekthos-Signature (se secret)
// Timeout: 5s (AbortSignal.timeout)
//
// Nota: NÃO importa _shared/whatsapp-api.ts — usa fetch nativo.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Sources que qualificam para o webhook de boas-vindas
const WELCOME_SOURCES = new Set([
  'qr_code', 'lead_form', 'visitor_form', 'agent_capture',
])

// ============================================================
// HMAC-SHA256 para assinatura do payload (se secret configurado)
// ============================================================
async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder()
  const key  = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ============================================================
// Handler principal
// ============================================================
Deno.serve(async (req: Request) => {
  // Aceita qualquer método — chamada interna, não exposta ao público
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 })
  }

  // Responde 200 sempre — nunca bloqueia o chamador
  const ok = () => new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  })

  try {
    let body: Record<string, unknown>
    try { body = await req.json() }
    catch { return ok() }

    const personId = typeof body.person_id === 'string' ? body.person_id.trim() : null
    const event    = typeof body.event     === 'string' ? body.event.trim()     : null

    if (!personId || !event) {
      console.warn('[dispatch-person-event] person_id ou event ausente')
      return ok()
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── 1. Buscar pessoa + church ─────────────────────────
    const { data: person, error: personErr } = await sb
      .from('people')
      .select(`
        id, name, phone, email, church_id, source, is_bulk_import,
        person_stage, como_conheceu, observacoes_pastorais, first_visit_date
      `)
      .eq('id', personId)
      .single()

    if (personErr || !person) {
      console.warn('[dispatch-person-event] Pessoa não encontrada:', personId)
      return ok()
    }

    const churchId = person.church_id as string

    // ── 1b. Notificar admins/pastores para todos os cadastros ─
    await notifyAdmins(sb, churchId, person as {
      id: string; name: string | null; church_id: string; source: string | null
    })

    // ── 2. Verificar elegibilidade ────────────────────────

    // 2a. Source elegível?
    if (!WELCOME_SOURCES.has(person.source as string)) {
      await writeAudit(sb, churchId, personId, 'person_event_skipped', {
        reason: 'source_not_eligible', source: person.source,
      })
      console.log('[dispatch-person-event] Skipped: source_not_eligible', person.source)
      return ok()
    }

    // 2b. Não é bulk import?
    if (person.is_bulk_import === true) {
      await writeAudit(sb, churchId, personId, 'person_event_skipped', {
        reason: 'is_bulk_import',
      })
      console.log('[dispatch-person-event] Skipped: is_bulk_import')
      return ok()
    }

    // 2c. welcome_automation_enabled?
    const { data: settings } = await sb
      .from('church_settings')
      .select('welcome_automation_enabled')
      .eq('church_id', churchId)
      .maybeSingle()

    if (settings && settings.welcome_automation_enabled === false) {
      await writeAudit(sb, churchId, personId, 'person_event_skipped', {
        reason: 'welcome_automation_disabled',
      })
      console.log('[dispatch-person-event] Skipped: welcome_automation_disabled')
      return ok()
    }

    // ── 3. Buscar webhook configurado ────────────────────
    const { data: webhook } = await sb
      .from('n8n_webhooks')
      .select('people_url, secret_token')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .not('people_url', 'is', null)
      .maybeSingle()

    if (!webhook?.people_url) {
      await writeAudit(sb, churchId, personId, 'person_event_skipped', {
        reason: 'no_webhook_configured',
      })
      console.log('[dispatch-person-event] Skipped: no_webhook_configured')
      return ok()
    }

    // ── 4. Buscar dados complementares ───────────────────
    const [churchRes, pipelineRes] = await Promise.all([
      sb.from('churches').select('name, slug').eq('id', churchId).single(),
      sb.from('person_pipeline')
        .select('stage_id')
        .eq('person_id', personId)
        .maybeSingle(),
    ])

    const churchName  = (churchRes.data?.name  as string | undefined) ?? null
    const churchSlug  = (churchRes.data?.slug  as string | undefined) ?? null
    const pipelineStageId = (pipelineRes.data?.stage_id as string | undefined) ?? null

    // ── 5. Montar payload ────────────────────────────────
    const payload = {
      event:       'person_welcome_eligible',
      church_id:   churchId,
      church_slug: churchSlug,
      church_name: churchName,
      person_id:   personId,
      person: {
        name:                  person.name,
        phone:                 person.phone,
        email:                 person.email,
        person_stage:          person.person_stage,
        source:                person.source,
        como_conheceu:         person.como_conheceu,
        observacoes_pastorais: person.observacoes_pastorais,
        first_visit_date:      person.first_visit_date,
      },
      pipeline_stage_id: pipelineStageId,
      dispatched_at:     new Date().toISOString(),
    }

    const bodyStr = JSON.stringify(payload)

    // ── 6. Montar headers ────────────────────────────────
    const reqHeaders: Record<string, string> = {
      'Content-Type':   'application/json',
      'X-Ekthos-Event': 'person_welcome_eligible',
    }

    if (webhook.secret_token) {
      const sig = await hmacSha256(webhook.secret_token as string, bodyStr)
      reqHeaders['X-Ekthos-Signature'] = 'sha256=' + sig
    }

    // ── 7. Disparar webhook (fire-and-forget com timeout) ─
    try {
      const res = await fetch(webhook.people_url as string, {
        method:  'POST',
        headers: reqHeaders,
        body:    bodyStr,
        signal:  AbortSignal.timeout(5_000),
      })

      const statusCode = res.status
      console.log('[dispatch-person-event] Webhook dispatched:', statusCode, webhook.people_url)

      await writeAudit(sb, churchId, personId, 'person_event_dispatched', {
        webhook_url:  webhook.people_url,
        status_code:  statusCode,
        event_type:   'person_welcome_eligible',
      })

    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? (fetchErr.stack ?? fetchErr.message) : String(fetchErr)
      console.error('[dispatch-person-event] Webhook failed:', msg)

      await writeAudit(sb, churchId, personId, 'person_event_dispatch_failed', {
        webhook_url: webhook.people_url,
        error:       msg,
        event_type:  'person_welcome_eligible',
      })
    }

    return ok()

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[dispatch-person-event] UNHANDLED:', msg)
    return ok()
  }
})

// ============================================================
// Helper: notificar admins/pastores sobre novo cadastro
// Funciona para qualquer source (qr_code, manual, etc.)
// Recebe sb do handler — sem nova instância
// try/catch próprio — nunca propaga erro
// ============================================================
async function notifyAdmins(
  sb: ReturnType<typeof createClient>,
  churchId: string,
  person: { id: string; name: string | null; church_id: string; source: string | null }
): Promise<void> {
  try {
    const { data: admins, error: adminsErr } = await sb
      .from('user_roles')
      .select('user_id')
      .eq('church_id', churchId)
      .in('role', ['admin', 'pastor_celulas'])

    if (adminsErr || !admins || admins.length === 0) {
      console.log('[dispatch-person-event] Nenhum admin para notificar (church_id:', churchId, ')')
      return
    }

    const personName    = (person.name ?? 'Visitante sem nome').trim()
    const isQr          = person.source === 'qr_code'
    const notifBody     = isQr
      ? `${personName} se cadastrou via QR Code.`
      : `${personName} foi cadastrado manualmente.`
    const automationName = isQr ? 'qr_code_visitor' : 'manual-registration'

    for (const admin of admins) {
      const { error: notifErr } = await sb
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('notifications' as any)
        .insert({
          church_id:       churchId,
          user_id:         admin.user_id,
          title:           `Nova pessoa: ${personName}`,
          body:            notifBody,
          type:            'info',
          read:            false,
          link:            '/pessoas?tab=novos',
          automation_name: automationName,
          person_id:       person.id,
        })

      if (notifErr) {
        console.error(
          '[dispatch-person-event] notification INSERT error:',
          notifErr.message,
          { user_id: admin.user_id, church_id: churchId }
        )
      }
    }

    console.log(`[dispatch-person-event] Notificacoes processadas para ${admins.length} admin(s)`)

    /*
     * TODO Frente N v3 (proximas versoes):
     * - Notificacao quando person_stage muda pra 'novo_convertido'
     * - Notificacao quando pessoa entra em etapa do pipeline
     * - Notificacao automatica diaria para visitantes 24h+ sem consolidacao
     * - Notificacao para pedidos de modulo (Volunteer Pro etc)
     */
  } catch (err: unknown) {
    console.error(
      '[dispatch-person-event] notifyAdmins failed:',
      err instanceof Error ? (err.stack ?? err.message) : String(err),
      { person_id: person.id, church_id: churchId }
    )
    // NÃO relança — não bloqueia request principal
  }
}

// ============================================================
// Helper: escrever audit_log de forma segura (falha silenciosa)
// ============================================================
async function writeAudit(
  sb: ReturnType<typeof createClient>,
  churchId: string,
  personId: string,
  action: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    await sb.from('audit_logs').insert({
      church_id:   churchId,
      entity_type: 'person',
      entity_id:   personId,
      action,
      actor_type:  'system',
      actor_id:    'dispatch-person-event',
      payload,
      model_used:  null,
      tokens_used: 0,
    })
  } catch (e) {
    console.warn('[dispatch-person-event] audit_log falhou (não crítico):', e)
  }
}
