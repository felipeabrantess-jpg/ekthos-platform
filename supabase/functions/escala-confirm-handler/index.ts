// ============================================================
// Edge Function: escala-confirm-handler  v4 (fix channel_dispatch_queue schema)
// Processa respostas de confirmação de escala via WhatsApp.
// POST { from_phone: string, message: string, church_id: uuid }
// Detecta 'CONFIRMO' ou 'CANCELAR' (NFD-normalizado, case-insensitive)
// Chamado pelo conversation-router quando mensagem inbound é recebida
// Changelog:
//   v3 (2026-06-01) — enfileira reply em channel_dispatch_queue (non-fatal)
//                     D7: SEM debit_agent_credits (confirmação gratuita)
//   v4 (2026-06-01) — fix schema: content (não message_body), conversation_id/message_id null
//                     fix select: event_name/event_date/event_time (não title/date/start_time)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

function detectIntent(message: string): 'confirm' | 'cancel' | null {
  const normalized = normalizeText(message)
  if (normalized.includes('confirmo') || normalized.includes('confirmar') || normalized === 'sim') return 'confirm'
  if (normalized.includes('cancelar') || normalized.includes('cancelo') || normalized === 'nao') return 'cancel'
  return null
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  try {
    const { from_phone, message, church_id } = await req.json()

    if (!from_phone || !message || !church_id) {
      return new Response(JSON.stringify({ handled: false, reason: 'missing params' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const intent = detectIntent(message)
    if (!intent) {
      return new Response(JSON.stringify({ handled: false, reason: 'no escala intent detected' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Rate limit: max 5 confirmações por phone+church nos últimos 60 segundos
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString()
    const { data: rateCheckPerson } = await supabase
      .from('people')
      .select('id')
      .eq('church_id', church_id)
      .eq('phone', from_phone)
      .maybeSingle()

    if (rateCheckPerson) {
      const { data: rateCheckVol } = await supabase
        .from('volunteers')
        .select('id')
        .eq('person_id', rateCheckPerson.id)
        .eq('church_id', church_id)
        .maybeSingle()

      if (rateCheckVol) {
        const { count: recentConfirms } = await supabase
          .from('service_schedule_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('volunteer_id', rateCheckVol.id)
          .gt('confirmed_at', oneMinuteAgo)
          .not('confirmed_at', 'is', null)

        if ((recentConfirms ?? 0) >= 5) {
          console.warn('[escala-confirm-handler v4] rate limit exceeded', { from_phone, church_id })
          return new Response(JSON.stringify({ handled: false, reason: 'rate limit exceeded' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
          })
        }
      }
    }

    // Lookup: phone → person → volunteer → assignment mais recente não confirmado
    const { data: person } = await supabase
      .from('people')
      .select('id, name')
      .eq('church_id', church_id)
      .eq('phone', from_phone)
      .maybeSingle()

    if (!person) {
      return new Response(JSON.stringify({ handled: false, reason: 'person not found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: volunteer } = await supabase
      .from('volunteers')
      .select('id')
      .eq('person_id', person.id)
      .eq('church_id', church_id)
      .maybeSingle()

    if (!volunteer) {
      return new Response(JSON.stringify({ handled: false, reason: 'not a volunteer' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Assignment mais recente com notified_at não nulo e attendance_confirmed nulo
    // v4: colunas corretas da service_schedules (event_name, event_date, event_time)
    const { data: assignment } = await supabase
      .from('service_schedule_assignments')
      .select('id, service_schedules!inner(event_name, event_date, event_time)')
      .eq('volunteer_id', volunteer.id)
      .not('notified_at', 'is', null)
      .is('attendance_confirmed', null)
      .order('notified_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!assignment) {
      return new Response(JSON.stringify({ handled: false, reason: 'no pending assignment found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Atualizar confirmação
    await supabase
      .from('service_schedule_assignments')
      .update({
        attendance_confirmed: intent === 'confirm',
        confirmed_at: new Date().toISOString(),
        confirmed_via: 'whatsapp',
      })
      .eq('id', assignment.id)

    const scheduleRaw = (assignment as unknown as { service_schedules: { event_name: string; event_date: string | null; event_time: string | null } }).service_schedules
    const scheduleName = scheduleRaw?.event_name ?? 'sua escala'
    const replyMessage = intent === 'confirm'
      ? `✅ Ótimo, ${person.name}! Sua presença em *${scheduleName}* está confirmada. Deus abençoe seu serviço! 🙏`
      : `Tudo bem, ${person.name}. Registramos que você não poderá comparecer a *${scheduleName}*. O líder será avisado. Obrigado por avisar!`

    // ── Enfileirar reply para voluntário via WhatsApp ─────────
    // D7: SEM debit_agent_credits — confirmação é gratuita (incluída no módulo)
    // v4: schema correto — content (não message_body), conversation_id/message_id null para outbound
    const { data: channel } = await supabase
      .from('church_whatsapp_channels')
      .select('id')
      .eq('church_id', church_id)
      .eq('active', true)
      .maybeSingle()

    if (channel) {
      await supabase.from('channel_dispatch_queue').insert({
        church_id,
        channel_id: channel.id,
        to_phone: from_phone,
        content: replyMessage,
        conversation_id: null,
        message_id: null,
        status: 'pending',
      }).catch(() => null) // non-fatal
      console.log(`[escala-confirm-handler v4] reply enfileirado church_id=${church_id} intent=${intent}`)
    } else {
      console.warn(`[escala-confirm-handler v4] canal WA ativo não encontrado church_id=${church_id} — reply não enfileirado`)
    }

    return new Response(JSON.stringify({ handled: true, intent, reply: replyMessage, assignment_id: assignment.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    console.error('[escala-confirm-handler v4]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
