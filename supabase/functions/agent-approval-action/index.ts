// ============================================================
// Edge Function: agent-approval-action  v1
// Aprova ou rejeita mensagem da fila agent_message_pending_approval.
// POST { action: 'approve'|'reject', message_id: uuid, reason?: string }
// Auth: Bearer JWT do usuário (church_id via app_metadata)
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

    const { action, message_id, reason } = await req.json()

    if (!action || !message_id) {
      return new Response(JSON.stringify({ error: 'missing action or message_id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    // Buscar mensagem
    const { data: msg, error: msgErr } = await supabase
      .from('agent_message_pending_approval')
      .select('*')
      .eq('id', message_id)
      .eq('church_id', churchId)
      .eq('status', 'pending')
      .maybeSingle()

    if (msgErr || !msg) {
      return new Response(JSON.stringify({ error: 'message not found or already processed' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    if (action === 'reject') {
      await supabase.from('agent_message_pending_approval').update({
        status: 'rejected',
        rejected_reason: reason ?? null,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }).eq('id', message_id)

      return new Response(JSON.stringify({ ok: true, action: 'rejected' }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (action === 'approve') {
      // Buscar conversa → pessoa → telefone
      let toPhone: string | null = null
      let channelId: string | null = null

      if (msg.conversation_id) {
        const { data: conv } = await supabase
          .from('conversations')
          .select('person_id, channel_id')
          .eq('id', msg.conversation_id)
          .maybeSingle()

        if (conv) {
          channelId = conv.channel_id
          const { data: person } = await supabase
            .from('people')
            .select('phone')
            .eq('id', conv.person_id)
            .maybeSingle()
          toPhone = person?.phone ?? null
        }
      }

      // Se não encontrou canal via conversa, pega o canal ativo da igreja
      if (!channelId) {
        const { data: ch } = await supabase
          .from('church_whatsapp_channels')
          .select('id')
          .eq('church_id', churchId)
          .eq('is_active', true)
          .maybeSingle()
        channelId = ch?.id ?? null
      }

      if (toPhone && channelId) {
        await supabase.from('channel_dispatch_queue').insert({
          church_id: churchId,
          channel_id: channelId,
          to_phone: toPhone,
          message_body: msg.draft_content,
          agent_slug: msg.agent_slug,
          status: 'pending',
          metadata: { ...msg.draft_metadata, approved_by: user.id },
        })
      }

      await supabase.from('agent_message_pending_approval').update({
        status: 'sent',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      }).eq('id', message_id)

      return new Response(JSON.stringify({ ok: true, action: 'approved', queued: !!(toPhone && channelId) }), {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'unknown action' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

  } catch (err: unknown) {
    console.error('[agent-approval-action v1]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
