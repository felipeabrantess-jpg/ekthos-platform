// ============================================================
// Edge Function: notify-escala  v2 (pool fix: agent-escalas)
// Envia notificações WhatsApp para voluntários de uma escala.
// POST { schedule_id: uuid }
// Auth: Bearer JWT do usuário (church_id via app_metadata)
// Debita 0.3cr por voluntário notificado (confirmação curta)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function corsHeaders(origin: string) {
  const allowed = [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:3000']
  const o = allowed.includes(origin) ? origin : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  try {
    // Auth
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const churchId = user.app_metadata?.church_id
    if (!churchId) return new Response(JSON.stringify({ error: 'no church_id' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { schedule_id } = await req.json()
    if (!schedule_id) return new Response(JSON.stringify({ error: 'missing schedule_id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    // Buscar escala
    const { data: schedule } = await supabase
      .from('service_schedules')
      .select('id, title, date, start_time')
      .eq('id', schedule_id)
      .eq('church_id', churchId)
      .maybeSingle()

    if (!schedule) return new Response(JSON.stringify({ error: 'schedule not found' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } })

    // Buscar canal WhatsApp
    const { data: channel } = await supabase
      .from('church_whatsapp_channels')
      .select('id')
      .eq('church_id', churchId)
      .eq('is_active', true)
      .maybeSingle()

    if (!channel) return new Response(JSON.stringify({ error: 'no active whatsapp channel' }), { status: 422, headers: { ...headers, 'Content-Type': 'application/json' } })

    // Buscar voluntários da escala não notificados
    const { data: assignments } = await supabase
      .from('service_schedule_assignments')
      .select(`
        id,
        role,
        notified_at,
        volunteers!inner(id, people!inner(id, name, phone))
      `)
      .eq('schedule_id', schedule_id)
      .is('notified_at', null)

    if (!assignments || assignments.length === 0) {
      return new Response(JSON.stringify({ ok: true, notified: 0, message: 'no pending notifications' }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // Buscar nome da igreja
    const { data: church } = await supabase.from('churches').select('name').eq('id', churchId).maybeSingle()
    const churchName = church?.name ?? 'nossa igreja'

    const scheduleDate = schedule.date
      ? new Date(schedule.date).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
      : ''

    let notified = 0
    const creditsPerMessage = 0.3 // confirmação curta

    for (const assignment of assignments) {
      const vol = assignment.volunteers as unknown as { id: string; people: { id: string; name: string; phone: string | null } }
      const person = vol.people
      if (!person?.phone) continue

      const msg = `Olá, ${person.name}! 👋\n\nVocê está escalado(a) em ${churchName}:\n📅 ${scheduleDate}${schedule.start_time ? ' às ' + schedule.start_time : ''}\n📌 Função: ${assignment.role ?? 'Voluntário'}\n\nResponda *CONFIRMO* para confirmar ou *CANCELAR* se não puder comparecer.`

      await supabase.from('channel_dispatch_queue').insert({
        church_id: churchId,
        channel_id: channel.id,
        to_phone: person.phone,
        message_body: msg,
        agent_slug: 'notify-escala',
        status: 'pending',
        metadata: { assignment_id: assignment.id, schedule_id, person_id: person.id },
      })

      // Marcar como notificado
      await supabase
        .from('service_schedule_assignments')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', assignment.id)

      notified++
    }

    // Debit créditos
    if (notified > 0) {
      const totalCredits = Math.round(notified * creditsPerMessage * 10) / 10
      await supabase.rpc('debit_agent_credits', {
        p_church_id: churchId,
        p_agent_scope: 'agent-escalas', // usa pool agent-escalas (correto)
        p_amount: totalCredits,
      }).catch(() => null) // non-blocking

      await supabase.from('agent_credit_usage').insert({
        church_id: churchId,
        agent_slug: 'notify-escala',
        operation_type: 'message',
        credits_consumed: totalCredits,
        consumed_at: new Date().toISOString(),
      }).catch(() => null)
    }

    return new Response(JSON.stringify({ ok: true, notified, schedule_id }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    console.error('[notify-escala v2]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
