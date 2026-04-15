// ============================================================
// Edge Function: agent-conteudo
// Criador de Conteúdo Pastoral — Anthropic Batch API
// Agente assíncrono disparado por cron (n8n) de madrugada.
// Pastor vê o resultado na manhã seguinte.
//
// GET  /agent-conteudo  → retorna último resultado salvo
// POST /agent-conteudo  → submete batch para Anthropic
// Headers: Authorization: Bearer <supabase-jwt>
// Body (POST): { message?: string; content_type?: 'devocional' | 'instagram' | 'comunicado'; clear_history?: boolean }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048
const AGENT_SLUG = 'agent-conteudo'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

// ── Helpers de autenticação ──────────────────────────────────

async function authUser(req: Request): Promise<
  | { user: { id: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown>; email?: string }; churchId: string; error: null }
  | { user: null; churchId: null; error: Response }
> {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return { user: null, churchId: null, error: jsonResp({ error: 'Unauthorized' }, 401) }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return { user: null, churchId: null, error: jsonResp({ error: 'Unauthorized' }, 401) }

  const churchId =
    (user.app_metadata?.church_id  as string | undefined) ??
    (user.user_metadata?.church_id as string | undefined) ?? null

  if (!churchId) return { user: null, churchId: null, error: jsonResp({ error: 'church_id não encontrado' }, 400) }

  return { user: user as typeof user & { app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }, churchId, error: null }
}

async function checkSubscription(churchId: string): Promise<boolean> {
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('church_id', churchId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!sub) return true

  const { data: sa } = await supabase
    .from('subscription_agents')
    .select('active')
    .eq('subscription_id', sub.id)
    .eq('agent_slug', AGENT_SLUG)
    .maybeSingle()

  return sa?.active === true
}

// ── GET: retorna último resultado salvo ──────────────────────

async function handleGet(req: Request): Promise<Response> {
  const auth = await authUser(req)
  if (auth.error) return auth.error

  const { user, churchId } = auth as { user: NonNullable<typeof auth.user>; churchId: string }
  void user

  const { data: latest } = await supabase
    .from('agent_conversations')
    .select('content, created_at')
    .eq('church_id', churchId)
    .eq('agent_slug', AGENT_SLUG)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return jsonResp({
    status:       latest ? 'ready' : 'no_results',
    content:      latest?.content ?? null,
    generated_at: latest?.created_at ?? null,
  })
}

// ── POST: submete batch para Anthropic ───────────────────────

async function handlePost(req: Request): Promise<Response> {
  const auth = await authUser(req)
  if (auth.error) return auth.error

  const { user, churchId } = auth as { user: NonNullable<typeof auth.user>; churchId: string }

  // Verifica subscription_agents
  const allowed = await checkSubscription(churchId)
  if (!allowed) return jsonResp({ error: 'Agente não ativado para esta conta' }, 403)

  // Body
  let body: { message?: string; content_type?: 'devocional' | 'instagram' | 'comunicado'; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonResp({ error: 'Body inválido' }, 400) }

  const bodyTyped    = body as { message?: string; content_type?: 'devocional' | 'instagram' | 'comunicado'; clear_history?: boolean }
  const today        = new Date()
  const nextWeek     = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Carrega contexto da church
  const [
    { data: upcomingEvents },
    { data: churchRow },
  ] = await Promise.all([
    supabase
      .from('events')
      .select('title, starts_at, description')
      .eq('church_id', churchId)
      .gte('starts_at', today.toISOString())
      .lte('starts_at', nextWeek)
      .order('starts_at', { ascending: true })
      .limit(5),
    supabase
      .from('churches')
      .select('name, denomination')
      .eq('id', churchId)
      .maybeSingle(),
  ])

  const denomination  = (churchRow?.denomination as string | undefined) ?? 'evangélica'
  const churchName    = churchRow?.name ?? 'sua igreja'
  const eventsContext = (upcomingEvents ?? []).length > 0
    ? (upcomingEvents ?? []).map(e =>
        `  • ${e.title as string} — ${new Date(e.starts_at as string).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })}`
      ).join('\n')
    : '  Nenhum evento cadastrado esta semana.'

  // System prompt
  const systemPrompt = `Você é o Criador de Conteúdo Pastoral da ${churchName} (${denomination}).

EVENTOS DESTA SEMANA:
${eventsContext}

VOCÊ CRIA:

📖 DEVOCIONAL DIÁRIO
Formato obrigatório:
**[Título inspirador]**
📖 *[Referência bíblica completa]*

[Reflexão pastoral — 120-150 palavras, linguagem familiar e acessível]

💡 *Aplicação:* [Ação prática para hoje em 1-2 frases]

🙏 *Oração:* [3-4 linhas, 1ª pessoa do plural, termina com "Amém."]

📱 POST INSTAGRAM
[Frase de abertura (sem ponto final)]

[Corpo — 80-100 palavras inspiradores]

[CTA pastoral: compartilhe / comente / marque alguém]

[8-10 hashtags relevantes: #fé #iglesia #devocional + denominação-específicas]

🖼️ *Sugestão de arte:* [descrição visual]

📢 COMUNICADO
[Texto WhatsApp — máx 200 palavras, tom caloroso, inclui: o quê, quando, onde, como participar]

REGRAS:
- Sempre inclua referência bíblica completa
- Respeite a denominação: ${denomination}
- Português brasileiro coloquial mas correto
- Nunca use jargões corporativos

AO RECEBER O TRIGGER DO CRON:
Gere automaticamente 1 devocional diário para hoje (${today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}).

Língua: português brasileiro.`

  const triggerMessage = bodyTyped.message?.trim() ||
    `Gere o devocional diário de hoje (${today.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}) para a comunidade.`

  // Submete batch via Anthropic Batch API
  const batchRes = await fetch('https://api.anthropic.com/v1/messages/batches', {
    method: 'POST',
    headers: {
      'x-api-key':         ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta':    'message-batches-2024-09-24',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      requests: [{
        custom_id: `${AGENT_SLUG}-${churchId}-${Date.now()}`,
        params: {
          model:      MODEL,
          max_tokens: MAX_TOKENS,
          system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: triggerMessage }],
        },
      }],
    }),
  })

  if (!batchRes.ok) {
    const errText = await batchRes.text()
    return jsonResp({ error: `Anthropic Batch API error: ${batchRes.status}`, detail: errText }, 502)
  }

  const batch = await batchRes.json() as { id: string; processing_status: string }
  const batchId = batch.id

  // Salva em agent_executions como pending
  await supabase.from('agent_executions').insert({
    church_id:             churchId,
    agent_slug:            AGENT_SLUG,
    user_id:               user.id,
    model:                 MODEL,
    input_tokens:          0,
    output_tokens:         0,
    cache_read_tokens:     0,
    cache_creation_tokens: 0,
    duration_ms:           0,
    success:               null,
    batch_id:              batchId,
    batch_status:          'pending',
  })

  return jsonResp({
    batch_id: batchId,
    status:   'pending',
    message:  'Batch submetido. Resultado disponível em minutos via GET ou após resolução pelo batch-resolve.',
  })
}

// ── Handler principal ────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method === 'GET')     return handleGet(req)
  if (req.method === 'POST')    return handlePost(req)
  return jsonResp({ error: 'Method Not Allowed' }, 405)
})
