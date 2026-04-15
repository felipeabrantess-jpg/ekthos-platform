// ============================================================
// Edge Function: agent-metricas
// Intérprete de Métricas Pastorais — Anthropic Batch API
// Agente assíncrono disparado por cron (n8n) de madrugada.
// Pastor vê o resultado na manhã seguinte.
//
// GET  /agent-metricas  → retorna último resultado salvo
// POST /agent-metricas  → submete batch para Anthropic
// Headers: Authorization: Bearer <supabase-jwt>
// Body (POST): { message?: string; clear_history?: boolean }
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
const AGENT_SLUG = 'agent-metricas'

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

  if (!sub) return true // sem subscription = sem restrição de agente

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
  let body: { message?: string; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonResp({ error: 'Body inválido' }, 400) }

  // Carrega contexto da church
  const now          = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [
    { count: totalMembers },
    { count: newThisMonth },
    { count: visitors },
    { count: activeCells },
    { data: donations },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'member'),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).gte('created_at', firstOfMonth),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'visitor'),
    supabase.from('groups').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('type', 'cell').eq('is_active', true),
    supabase.from('donations').select('amount_cents').eq('church_id', churchId).gte('created_at', firstOfMonth),
    supabase.from('churches').select('name, denomination').eq('id', churchId).maybeSingle(),
  ])

  const totalDonBRL = ((donations ?? []).reduce((a: number, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const cellCoverage = (activeCells && totalMembers) ? Math.round(totalMembers / Math.max(activeCells, 1)) : 0

  // System prompt
  const systemPrompt = `Você é o Intérprete de Métricas Pastorais da ${churchRow?.name ?? 'igreja'}.

SNAPSHOT DO MÊS ATUAL (${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}):
  Membros ativos:          ${totalMembers ?? 0}
  Visitantes:              ${visitors ?? 0}
  Novos cadastros no mês:  ${newThisMonth ?? 0}
  Células ativas:          ${activeCells ?? 0} (média: ${cellCoverage} membros/célula)
  Arrecadação do mês:      ${totalDonBRL}

MISSÃO:
Gerar um relatório de métricas pastorais completo com análise e recomendações.

AO RECEBER O TRIGGER DO CRON:
Gere automaticamente um relatório no formato:
# Relatório de Métricas Pastorais — ${now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}

## Visão Geral
[análise dos números acima em linguagem pastoral]

## Pontos de Atenção
[o que merece atenção do pastor]

## Oportunidades
[o que está indo bem e pode ser potencializado]

## Próximos Passos Recomendados
[3 ações concretas baseadas nos dados]

## Versículo de Referência
[versículo bíblico relevante ao contexto atual]

Benchmarks saudáveis para comparação:
- 1 célula para cada 10-15 membros
- 30% dos membros como visitantes (funil saudável)
- Crescimento orgânico: 5-10% ao mês

Tom: conselheiro pastoral experiente, analítico mas com coração.
Língua: português brasileiro.`

  const triggerMessage = body.message?.trim() || 'Gere o relatório de métricas pastorais do mês atual com base nos dados disponíveis.'

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
