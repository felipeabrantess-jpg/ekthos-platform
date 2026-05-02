// ============================================================
// Edge Function: conversation-handoff — Sprint 3D
//
// POST /functions/v1/conversation-handoff
// verify_jwt = false — validação manual interna
//
// Body:
//   { conversation_id: string, action: HandoffAction }
//
// Actions:
//   assume          → ownership='human', human_actor preenchido
//   return_to_agent → ownership='agent', human_actor limpo
//   close           → status='closed', ownership='unassigned'
//   archive         → status='archived'
//
// Regras travadas Sprint 3D:
//   1. Assumir é SEMPRE explícito — nunca implícito
//   2. Encerrar ≠ Arquivar (estados distintos com timestamps distintos)
//   3. Backend é proteção final — valida JWT + church_id em toda ação
//
// Após cada ação insere em conversation_events (auditoria obrigatória).
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

type HandoffAction = 'assume' | 'return_to_agent' | 'close' | 'archive'

// Transições de estado válidas por action
const VALID_TRANSITIONS: Record<HandoffAction, {
  fromStatus?:    string[]   // estados de origem permitidos
  fromOwnership?: string[]   // ownership de origem permitida
}> = {
  assume: {
    fromStatus:    ['open', 'pending'],
    // qualquer ownership pode ser assumida pelo humano
  },
  return_to_agent: {
    fromOwnership: ['human'],
  },
  close: {
    fromStatus: ['open', 'pending'],
  },
  archive: {
    fromStatus: ['closed'],
  },
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json({ ok: true }, 204, corsHeaders())
  }

  // ── 1. Validar JWT ────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? ''
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) {
    return json({ error: 'unauthorized' }, 401)
  }

  // Cria cliente auth (user-scoped) para validar identidade
  const supabaseAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)

  if (authErr || !user) {
    return json({ error: 'unauthorized' }, 401)
  }

  // ── 2. Extrair church_id do app_metadata ─────────────────
  // Regra do projeto: auth_church_id() lê APENAS app_metadata
  const churchId = user.app_metadata?.church_id as string | undefined

  if (!churchId) {
    return json({ error: 'forbidden: sem church_id no token' }, 403)
  }

  // ── 3. Parse e validar body ───────────────────────────────
  let body: { conversation_id?: string; action?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400)
  }

  const { conversation_id, action } = body

  if (!conversation_id || !action) {
    return json({ error: 'conversation_id e action são obrigatórios' }, 400)
  }

  const validActions: HandoffAction[] = ['assume', 'return_to_agent', 'close', 'archive']
  if (!validActions.includes(action as HandoffAction)) {
    return json({ error: `action inválida: ${action}` }, 400)
  }

  const handoffAction = action as HandoffAction

  // ── 4. Buscar conversa e verificar pertencimento ──────────
  const sbAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: conv, error: convErr } = await sbAdmin
    .from('conversations')
    .select('id, church_id, status, ownership, contact_phone')
    .eq('id', conversation_id)
    .single()

  if (convErr || !conv) {
    return json({ error: 'conversa não encontrada' }, 404)
  }

  // Guard: conversa deve pertencer à church do usuário
  if (conv.church_id !== churchId) {
    return json({ error: 'forbidden: conversa de outra church' }, 403)
  }

  // ── 5. Validar transição de estado ───────────────────────
  const rule = VALID_TRANSITIONS[handoffAction]

  if (rule.fromStatus && !rule.fromStatus.includes(conv.status)) {
    return json({
      error: `ação '${handoffAction}' não permitida para status='${conv.status}'`,
    }, 422)
  }
  if (rule.fromOwnership && !rule.fromOwnership.includes(conv.ownership)) {
    return json({
      error: `ação '${handoffAction}' não permitida para ownership='${conv.ownership}'`,
    }, 422)
  }

  // ── 6. Buscar nome display do usuário ────────────────────
  const { data: profile } = await sbAdmin
    .from('profiles')
    .select('display_name, name')
    .eq('user_id', user.id)
    .maybeSingle()

  const actorName = profile?.display_name ?? profile?.name ?? user.email ?? 'Staff'

  // ── 7. Executar a ação ───────────────────────────────────
  const now = new Date().toISOString()
  let updatePayload: Record<string, unknown> = {}
  let eventType = ''
  let logFromOwnership = conv.ownership
  let logToOwnership   = conv.ownership

  switch (handoffAction) {
    case 'assume':
      updatePayload = {
        ownership:        'human',
        human_actor_id:   user.id,
        human_actor_name: actorName,
        human_assumed_at: now,
        status:           'open',   // garante que sai de pending se estava
      }
      eventType      = 'human_assumed'
      logToOwnership = 'human'
      break

    case 'return_to_agent':
      updatePayload = {
        ownership:        'agent',
        human_actor_id:   null,
        human_actor_name: null,
      }
      eventType      = 'returned_to_agent'
      logToOwnership = 'agent'
      break

    case 'close':
      updatePayload = {
        status:    'closed',
        ownership: 'unassigned',
        closed_at: now,
      }
      eventType      = 'conversation_closed'
      logToOwnership = 'unassigned'
      break

    case 'archive':
      updatePayload = {
        status:      'archived',
        archived_at: now,
      }
      eventType = 'conversation_archived'
      break
  }

  const { data: updatedConv, error: updateErr } = await sbAdmin
    .from('conversations')
    .update(updatePayload)
    .eq('id', conversation_id)
    .select()
    .single()

  if (updateErr) {
    console.error('[conversation-handoff] update error:', updateErr.message)
    return json({ error: 'internal_error' }, 500)
  }

  // ── 8. Auditoria — conversation_events ──────────────────
  // Obrigatória. Falha silenciosa para não bloquear resposta.
  try {
    await sbAdmin.from('conversation_events').insert({
      conversation_id,
      church_id:  churchId,
      event_type: eventType,
      actor_type: 'human',
      actor_id:   user.id,
      actor_name: actorName,
      metadata: {
        action:         handoffAction,
        from_status:    conv.status,
        from_ownership: logFromOwnership,
        to_ownership:   logToOwnership,
      },
    })
  } catch (err) {
    console.warn('[conversation-handoff] event log failed (non-fatal):', err)
  }

  // ── 9. Log de ownership (tabela legada) ──────────────────
  // conversation_ownership_log — best-effort
  if (logFromOwnership !== logToOwnership) {
    try {
      await sbAdmin.from('conversation_ownership_log').insert({
        conversation_id,
        from_ownership: logFromOwnership,
        to_ownership:   logToOwnership,
        actor_type:     'human',
        actor_id:       user.id,
        reason:         handoffAction,
      })
    } catch {
      // non-fatal
    }
  }

  console.log(
    `[conversation-handoff] ${conversation_id} action=${handoffAction}` +
    ` actor=${actorName} (${user.id})`
  )

  return json({ ok: true, conversation: updatedConv }, 200, corsHeaders())
})

// ── helpers ──────────────────────────────────────────────────

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  })
}
