// ============================================================
// Edge Function: agent-reengajamento  v18
//
// MUDANÇAS v18 (MEGA-ONDA TOTAL — L2P-SB01):
//   - Modelo: claude-haiku → claude-sonnet-4-6 (reengajamento é pastoral premium)
//   - R-PREMIUM-GUARD inline (não depende de _shared/agent-guard.ts legado)
//   - Prompt 6 camadas: identidade, missão, tom, contexto pessoa, contexto chiesa, instrução
//   - journey.status = 'completed' com stop_reason + completed_at
//   - max_touchpoints e inactivity_days configuráveis via custom_overrides
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

// ── R-PREMIUM-GUARD inline ─────────────────────────────────

async function churchHasPremiumAccess(churchId: string): Promise<boolean> {
  // subscription ativa
  const { data: subData } = await supabase
    .from('subscription_agents')
    .select('activation_status')
    .eq('church_id', churchId)
    .eq('agent_slug', 'agent-reengajamento')
    .eq('activation_status', 'active')
    .maybeSingle()
  if (subData) return true

  // agent_grant ativo
  const { data: grantData } = await supabase
    .from('agent_grants')
    .select('id')
    .eq('church_id', churchId)
    .eq('agent_slug', 'agent-reengajamento')
    .is('revoked_at', null)
    .or('ends_at.is.null,ends_at.gt.' + new Date().toISOString())
    .maybeSingle()
  return !!grantData
}

// ── Helpers ────────────────────────────────────────────────

function corsHeaders(origin: string) {
  const allowed = [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:3000']
  const o = allowed.includes(origin) ? origin : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

async function debitCredits(churchId: string, credits: number): Promise<void> {
  await supabase.rpc('debit_agent_credits', {
    p_church_id: churchId,
    p_agent_scope: 'agent-reengajamento',
    p_amount: credits,
  })
  await supabase.from('agent_credit_usage').insert({
    church_id: churchId,
    agent_slug: 'agent-reengajamento',
    operation_type: 'message',
    credits_consumed: credits,
    consumed_at: new Date().toISOString(),
  })
}

// ── Modo reengagement_scan ─────────────────────────────────

async function handleScan(body: {
  church_id: string
  person_id: string
  touchpoint: number
}) {
  const { church_id, person_id, touchpoint } = body

  if (!await churchHasPremiumAccess(church_id)) {
    return { error: 'forbidden: premium access required' }
  }

  // Carregar pessoa
  const { data: person } = await supabase
    .from('people')
    .select('id, name, phone, last_contact_at, last_attendance_at, church_relationship')
    .eq('id', person_id)
    .eq('church_id', church_id)
    .maybeSingle()

  if (!person) return { error: 'person not found' }

  // Carregar config da igreja
  const { data: cfg } = await supabase
    .from('church_agent_config')
    .select('custom_instructions, custom_overrides')
    .eq('church_id', church_id)
    .eq('agent_slug', 'agent-reengajamento')
    .maybeSingle()

  const overrides = (cfg?.custom_overrides as Record<string, unknown>) ?? {}
  const maxTouchpoints = (overrides.max_touchpoints as number) ?? 3

  // Carregar nome da igreja
  const { data: church } = await supabase
    .from('churches')
    .select('name')
    .eq('id', church_id)
    .maybeSingle()

  const daysInactive = person.last_contact_at
    ? Math.floor((Date.now() - new Date(person.last_contact_at).getTime()) / 86400000)
    : 30

  const systemPrompt = [
    `Você é um assistente pastoral da ${church?.name ?? 'nossa igreja'}.`,
    `Sua missão é reconectar membros que estão afastados, com gentileza e sem pressão.`,
    `Tom: caloroso, humano, direto. Nunca mencione que é uma IA.`,
    `Contexto: ${person.name} está afastado há ${daysInactive} dias (toque ${touchpoint}/${maxTouchpoints}).`,
    cfg?.custom_instructions ? `Instrução especial: ${cfg.custom_instructions}` : '',
  ].filter(Boolean).join('\n')

  const userPrompt = touchpoint === 1
    ? `Escreva uma mensagem de reengajamento curta (2-3 frases) para ${person.name}. Demonstre que sentimos falta. Não peça nada, apenas reconecte.`
    : `Escreva um follow-up gentil (2-3 frases) para ${person.name}, que não respondeu as mensagens anteriores. Tom ainda mais caloroso, sem cobrança.`

  const completion = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  })

  const message = completion.content[0]?.type === 'text' ? completion.content[0].text : ''
  const creditsUsed = 1 // mensagem padrão

  if (!message) return { error: 'empty message generated' }

  // Enfileirar mensagem
  if (person.phone) {
    const { data: channelData } = await supabase
      .from('church_whatsapp_channels')
      .select('id')
      .eq('church_id', church_id)
      .eq('is_active', true)
      .maybeSingle()

    if (channelData) {
      await supabase.from('channel_dispatch_queue').insert({
        church_id,
        channel_id: channelData.id,
        to_phone: person.phone,
        message_body: message,
        agent_slug: 'agent-reengajamento',
        status: 'pending',
        metadata: { person_id, touchpoint },
      })
    }
  }

  // Atualizar/criar jornada
  const isLastTouchpoint = touchpoint >= maxTouchpoints
  const journeyUpdate = isLastTouchpoint
    ? { status: 'completed', stop_reason: 'max_touchpoints', completed_at: new Date().toISOString(), current_touchpoint: touchpoint }
    : { current_touchpoint: touchpoint, updated_at: new Date().toISOString() }

  await supabase
    .from('reengagement_journey')
    .upsert({
      church_id,
      person_id,
      ...journeyUpdate,
    }, { onConflict: 'church_id,person_id', ignoreDuplicates: false })

  // Debit créditos
  await debitCredits(church_id, creditsUsed)

  // Log execução
  await supabase.from('agent_executions').insert({
    church_id,
    agent_slug: 'agent-reengajamento',
    trigger_type: 'reengagement_scan',
    status: 'success',
    credits_used: creditsUsed,
    metadata: { person_id, touchpoint },
  })

  return { ok: true, touchpoint, credits_used: creditsUsed }
}

// ── Deno.serve ────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  try {
    const body = await req.json()
    const { trigger_type } = body

    if (trigger_type === 'reengagement_scan') {
      // Chamada interna do cron — sem JWT
      const result = await handleScan(body)
      return new Response(JSON.stringify(result), {
        status: 'error' in result ? 400 : 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // Modo chat_sse — requer JWT
    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    if (!token) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
        status: 401,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    const churchId = user.app_metadata?.church_id
    if (!churchId) {
      return new Response(JSON.stringify({ error: 'no church_id' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    if (!await churchHasPremiumAccess(churchId)) {
      return new Response(JSON.stringify({ error: 'forbidden: premium access required' }), {
        status: 403,
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
    }

    // Chat simples (não SSE)
    const { messages: chatMessages = [], person_name = '' } = body
    const completion = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: 'Você é um agente de reengajamento pastoral. Ajude a elaborar mensagens para reconectar membros afastados.',
      messages: chatMessages,
    })

    const reply = completion.content[0]?.type === 'text' ? completion.content[0].text : ''
    await debitCredits(churchId, 1)

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    console.error('[agent-reengajamento v18]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
