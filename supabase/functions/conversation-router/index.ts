// ============================================================
// Edge Function: conversation-router
// Decisor de roteamento — sem lógica de entrega.
//
// POST /functions/v1/conversation-router
// verify_jwt = false — chamada interna (webhook-receiver, crons)
//
// Recebe: { conversation_id, message_id, church_id, ownership,
//           agent_slug, person_id, inbound_text }
//
// Decisão:
//   ownership = 'agent'     → chama agent-acolhimento (ou agente correto)
//   ownership = 'human'     → envia notificação realtime para staff
//   ownership = 'unassigned'→ assign para agente default, depois rota
//
// REGRA: Este EF NUNCA envia mensagem. Só decide e delega.
//        A entrega é responsabilidade do channel-dispatcher.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Mapa agent_slug → EF correspondente
const AGENT_FUNCTIONS: Record<string, string> = {
  'agent-acolhimento':   'agent-acolhimento',
  'agent-reengajamento': 'agent-reengajamento',   // Sprint 4
  'agent-operacao':      'agent-operacao',         // Sprint 4
}

// Agente default quando conversa não tem agente definido
const DEFAULT_AGENT = 'agent-acolhimento'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 204)
  }

  try {
    const body = await req.json() as {
      conversation_id: string
      message_id:      string
      church_id:       string
      ownership:       string
      agent_slug:      string | null
      person_id:       string | null
      inbound_text:    string
    }

    const {
      conversation_id, message_id, church_id,
      ownership, agent_slug, person_id, inbound_text,
    } = body

    if (!conversation_id || !church_id) {
      return json({ ok: false, error: 'missing conversation_id or church_id' }, 400)
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── unassigned: assign para agente default ─────────────
    let effectiveOwnership  = ownership
    let effectiveAgentSlug  = agent_slug ?? DEFAULT_AGENT

    if (ownership === 'unassigned') {
      await sb
        .from('conversations')
        .update({
          ownership:  'agent',
          agent_slug: DEFAULT_AGENT,
        })
        .eq('id', conversation_id)

      // Log de ownership
      await sb.from('conversation_ownership_log').insert({
        conversation_id,
        from_ownership: 'unassigned',
        to_ownership:   'agent',
        actor_type:     'system',
        reason:         'auto_assign_on_first_message',
      })

      effectiveOwnership = 'agent'
      effectiveAgentSlug = DEFAULT_AGENT
      console.log(`[conversation-router] ${conversation_id} assigned → agent-acolhimento`)
    }

    // ── human: notificar staff via notifications table ──────
    if (effectiveOwnership === 'human') {
      await notifyStaff(sb, church_id, conversation_id, inbound_text)
      console.log(`[conversation-router] ${conversation_id} ownership=human → staff notificado`)
      return json({ ok: true, routed_to: 'human' })
    }

    // ── agent: chamar o agente correto ──────────────────────
    if (effectiveOwnership === 'agent') {
      const agentFn = AGENT_FUNCTIONS[effectiveAgentSlug] ?? DEFAULT_AGENT

      console.log(
        `[conversation-router] ${conversation_id} → ${agentFn} ` +
        `(person=${person_id ?? 'unknown'})`
      )

      // Chama o EF do agente — fire-and-forget
      // O agente é responsável por gerar a resposta e enfileirar no channel_dispatch_queue
      fetch(`${SUPABASE_URL}/functions/v1/${agentFn}`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          conversation_id,
          message_id,
          church_id,
          person_id:    person_id ?? null,
          agent_slug:   effectiveAgentSlug,
          inbound_text,
          trigger:      'inbound_message',
        }),
        signal: AbortSignal.timeout(3_000),
      }).catch(err => {
        console.warn(`[conversation-router] ${agentFn} call falhou:`, err.message)
      })

      return json({ ok: true, routed_to: agentFn })
    }

    return json({ ok: true, routed_to: 'none', note: `ownership desconhecido: ${effectiveOwnership}` })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[conversation-router] unhandled:', msg)
    return json({ ok: false, error: 'internal_error' }, 500)
  }
})

// ── notifyStaff ──────────────────────────────────────────────
// Quando conversa está sob controle humano, notifica o staff
// responsável (assigned_to) ou todos os admins da igreja.

async function notifyStaff(
  sb:              ReturnType<typeof createClient>,
  churchId:        string,
  conversationId:  string,
  inboundText:     string
): Promise<void> {
  try {
    // Busca quem está assigned na conversa
    const { data: conv } = await sb
      .from('conversations')
      .select('assigned_to, contact_phone')
      .eq('id', conversationId)
      .single()

    const preview = inboundText.slice(0, 80)

    if (conv?.assigned_to) {
      // Notifica o responsável direto
      await sb.from('notifications').insert({
        church_id:       churchId,
        user_id:         conv.assigned_to,
        title:           'Nova mensagem aguardando resposta',
        body:            `${conv.contact_phone}: "${preview}"`,
        type:            'info',
        read:            false,
        link:            `/conversas/${conversationId}`,
        automation_name: 'human_handoff',
      })
    } else {
      // Fallback: notifica todos os admins
      const { data: admins } = await sb
        .from('user_roles')
        .select('user_id')
        .eq('church_id', churchId)
        .in('role', ['admin', 'pastor_celulas'])

      for (const admin of admins ?? []) {
        await sb.from('notifications').insert({
          church_id:       churchId,
          user_id:         admin.user_id,
          title:           'Conversa aguardando atendimento humano',
          body:            `"${preview}"`,
          type:            'info',
          read:            false,
          link:            `/conversas/${conversationId}`,
          automation_name: 'human_handoff',
        })
      }
    }
  } catch (err) {
    // Não propaga — notificação é best-effort
    console.warn('[conversation-router] notifyStaff error:', err)
  }
}

// ── helpers ──────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
