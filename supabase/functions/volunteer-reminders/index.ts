// ============================================================
// Edge Function: volunteer-reminders  v2 (fix channel_dispatch_queue schema)
// Envia lembretes automáticos D-3 e D-1 antes da escala via WhatsApp.
// Chamada por pg_cron diariamente às 08h BRT (11h UTC)
// Auth: x-cron-secret header (chamada interna) OU Bearer JWT
// Volunteer Pro: NÃO debita créditos (D6)
// v1: deploy inicial por SA-COMUNICACAO
// v2: corrige schema channel_dispatch_queue (content, conversation_id/message_id null)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET               = 'volunteer-reminders-cron'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  // Auth: aceita x-cron-secret (pg_cron) ou Bearer JWT (admin/teste)
  const cronSecret = req.headers.get('x-cron-secret')
  const bearerToken = (req.headers.get('authorization') ?? '').replace('Bearer ', '')

  if (cronSecret !== CRON_SECRET && !bearerToken) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'Content-Type': 'application/json' },
    })
  }

  // Se JWT fornecido, validar (permite teste manual autenticado)
  if (bearerToken && cronSecret !== CRON_SECRET) {
    const { data: { user } } = await supabase.auth.getUser(bearerToken)
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  try {
    const today = new Date()
    const d3Date = new Date(today); d3Date.setDate(today.getDate() + 3)
    const d1Date = new Date(today); d1Date.setDate(today.getDate() + 1)
    const d3Str = d3Date.toISOString().slice(0, 10) // YYYY-MM-DD
    const d1Str = d1Date.toISOString().slice(0, 10)

    // Buscar igrejas com Volunteer Pro ativo
    const { data: churches } = await supabase
      .from('churches')
      .select('id, name, enabled_modules')

    if (!churches || churches.length === 0) {
      return new Response(JSON.stringify({ ok: true, churches_processed: 0, d3_sent: 0, d1_sent: 0 }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    }

    let churchesProcessed = 0
    let d3Sent = 0
    let d1Sent = 0

    for (const church of churches) {
      const mods = (church.enabled_modules ?? {}) as Record<string, boolean>
      if (!mods['escalas'] && !mods['voluntarios']) continue

      // R-MODULE-GUARD: verificar entitlement
      const { data: subRow } = await supabase
        .from('church_agent_subscriptions')
        .select('id')
        .eq('church_id', church.id)
        .eq('active', true)
        .maybeSingle()
      let hasEntitlement = false
      if (subRow) {
        const { data: sa } = await supabase
          .from('subscription_agents')
          .select('activation_status')
          .eq('subscription_id', subRow.id)
          .eq('agent_slug', 'agent-escalas')
          .maybeSingle()
        hasEntitlement = sa?.activation_status === 'active'
      }
      if (!hasEntitlement) {
        const { data: grant } = await supabase
          .from('agent_grants')
          .select('id')
          .eq('church_id', church.id)
          .eq('agent_slug', 'agent-escalas')
          .is('revoked_at', null)
          .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
          .maybeSingle()
        if (!grant) continue // Igreja sem entitlement → pular
      }

      // Canal WhatsApp ativo
      const { data: channel } = await supabase
        .from('church_whatsapp_channels')
        .select('id')
        .eq('church_id', church.id)
        .eq('active', true)
        .maybeSingle()
      if (!channel) continue

      churchesProcessed++

      // ── Lembretes D-3 ────────────────────────────────────────
      const { data: d3Assignments } = await supabase
        .from('service_schedule_assignments')
        .select(`
          id, role,
          volunteers!inner(id, people!inner(id, name, phone)),
          service_schedules!inner(id, church_id, event_name, event_date, event_time)
        `)
        .eq('service_schedules.church_id', church.id)
        .eq('service_schedules.event_date', d3Str)
        .is('reminder_d3_sent_at', null)
        .not('notified_at', 'is', null) // Só quem já foi notificado da escala

      for (const asgn of (d3Assignments ?? [])) {
        const vol = asgn.volunteers as unknown as { id: string; people: { id: string; name: string; phone: string | null } }
        const sched = asgn.service_schedules as unknown as { event_name: string; event_date: string; event_time: string | null; church_id: string }
        const person = vol.people
        if (!person?.phone || sched.church_id !== church.id) continue

        const eventDate = new Date(sched.event_date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
        const msg = `Olá, ${person.name}! 🗓️ Você está escalado(a) em *${church.name}* daqui a 3 dias:\n📅 ${eventDate}${sched.event_time ? ' às ' + sched.event_time : ''}\n📌 Função: ${asgn.role ?? 'Voluntário'}\n\nResponda *CONFIRMO* para confirmar ou *CANCELAR* se não puder.`

        const { error: insertErr } = await supabase.from('channel_dispatch_queue').insert({
          church_id: church.id,
          channel_id: channel.id,
          to_phone: person.phone,
          content: msg,
          conversation_id: null,
          message_id: null,
          status: 'pending',
        })

        if (!insertErr) {
          await supabase.from('service_schedule_assignments')
            .update({ reminder_d3_sent_at: new Date().toISOString() })
            .eq('id', asgn.id)
          d3Sent++
        }
      }

      // ── Lembretes D-1 ────────────────────────────────────────
      const { data: d1Assignments } = await supabase
        .from('service_schedule_assignments')
        .select(`
          id, role,
          volunteers!inner(id, people!inner(id, name, phone)),
          service_schedules!inner(id, church_id, event_name, event_date, event_time)
        `)
        .eq('service_schedules.church_id', church.id)
        .eq('service_schedules.event_date', d1Str)
        .is('reminder_d1_sent_at', null)
        .not('notified_at', 'is', null)

      for (const asgn of (d1Assignments ?? [])) {
        const vol = asgn.volunteers as unknown as { id: string; people: { id: string; name: string; phone: string | null } }
        const sched = asgn.service_schedules as unknown as { event_name: string; event_date: string; event_time: string | null; church_id: string }
        const person = vol.people
        if (!person?.phone || sched.church_id !== church.id) continue

        const eventDate = new Date(sched.event_date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
        const msg = `⏰ Lembrete: amanhã você está escalado(a) em *${church.name}*!\n📅 ${eventDate}${sched.event_time ? ' às ' + sched.event_time : ''}\n📌 Função: ${asgn.role ?? 'Voluntário'}\n\nResponda *CONFIRMO* para confirmar ou *CANCELAR* se não puder.`

        const { error: insertErr } = await supabase.from('channel_dispatch_queue').insert({
          church_id: church.id,
          channel_id: channel.id,
          to_phone: person.phone,
          content: msg,
          conversation_id: null,
          message_id: null,
          status: 'pending',
        })

        if (!insertErr) {
          await supabase.from('service_schedule_assignments')
            .update({ reminder_d1_sent_at: new Date().toISOString() })
            .eq('id', asgn.id)
          d1Sent++
        }
      }
    }

    console.log(`[volunteer-reminders v2] churches=${churchesProcessed} d3=${d3Sent} d1=${d1Sent}`)
    return new Response(JSON.stringify({ ok: true, processed_churches: churchesProcessed, d3_sent: d3Sent, d1_sent: d1Sent }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    console.error('[volunteer-reminders v2]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
