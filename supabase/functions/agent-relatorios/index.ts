// ============================================================
// Edge Function: agent-relatorios
// Gerador de Relatórios Pastorais — Anthropic Batch API
// Agente assíncrono disparado por cron (n8n) de madrugada.
// Pastor vê o resultado na manhã seguinte.
//
// GET  /agent-relatorios  → retorna último resultado salvo
// POST /agent-relatorios  → submete batch para Anthropic
// Headers: Authorization: Bearer <supabase-jwt>
// Body (POST): { message?: string; period?: 'semanal' | 'mensal'; clear_history?: boolean }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
// Auth client - JWT validation only (prevents RLS contamination of DB client)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const MODEL      = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 2048
const AGENT_SLUG = 'agent-relatorios'

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

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
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
  let body: { message?: string; period?: 'semanal' | 'mensal'; clear_history?: boolean }
  try   { body = await req.json() }
  catch { return jsonResp({ error: 'Body inválido' }, 400) }

  const bodyTyped = body as { message?: string; period?: 'semanal' | 'mensal'; clear_history?: boolean }
  const period    = bodyTyped.period ?? 'semanal'
  const days      = period === 'mensal' ? 30 : 7
  const since     = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  // Carrega contexto da church
  const [
    { count: newPeople },
    { count: totalMembers },
    { data: allDonations },
    { count: cellMeetings },
    { count: totalEvents },
    { data: churchRow },
  ] = await Promise.all([
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).gte('created_at', since),
    supabase.from('people').select('id', { count: 'exact', head: true }).eq('church_id', churchId).eq('status', 'member'),
    supabase.from('donations').select('amount_cents, type').eq('church_id', churchId).gte('created_at', since),
    supabase.from('group_meetings').select('id', { count: 'exact', head: true }).eq('church_id', churchId).gte('created_at', since),
    supabase.from('events').select('id', { count: 'exact', head: true }).eq('church_id', churchId).gte('starts_at', since),
    supabase.from('churches').select('name, denomination').eq('id', churchId).maybeSingle(),
  ])

  const totalDonBRL = ((allDonations ?? []).reduce((a: number, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const tithesBRL = ((allDonations ?? []).filter(d => d.type === 'dizimo').reduce((a: number, d) => a + ((d.amount_cents as number) ?? 0), 0) / 100)
    .toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  // System prompt
  const systemPrompt = `Você é o Gerador de Relatórios Pastorais da ${churchRow?.name ?? 'igreja'} (${(churchRow?.denomination as string | undefined) ?? 'evangélica'}).

PERÍODO: Últim${period === 'mensal' ? 'o mês' : 'a semana'} (${days} dias)

DADOS DO PERÍODO:
  Novos cadastros:        ${newPeople ?? 0}
  Total de membros:       ${totalMembers ?? 0}
  Reuniões de célula:     ${cellMeetings ?? 0}
  Eventos realizados:     ${totalEvents ?? 0}
  Arrecadação total:      ${totalDonBRL}
  → Dízimos:             ${tithesBRL}

AO RECEBER O TRIGGER DO CRON:
Gere automaticamente o relatório pastoral completo no formato:

# Relatório Pastoral ${period === 'mensal' ? 'Mensal' : 'Semanal'} — ${new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}
**Igreja ${churchRow?.name ?? ''}**

## Resumo Executivo
[2-3 frases com os principais destaques]

## Vida da Comunidade
[pessoas, células, presença, visitantes]

## Vida Financeira
[arrecadação, tendência, observações]

## Agenda e Eventos
[eventos realizados e impacto]

## Preocupações Pastorais
[o que precisa de atenção]

## Próximos Passos (3 prioridades)
1. ...
2. ...
3. ...

## Oração e Reflexão
[versículo bíblico + palavra de encorajamento para o pastor]

---
*Relatório gerado automaticamente pelo Ekthos CRM*

Tom: pastoral, cálido, direto. Use linguagem que o pastor possa compartilhar com o conselho.
Língua: português brasileiro.`

  const triggerMessage = bodyTyped.message?.trim() || `Gere o relatório pastoral ${period} completo com base nos dados do período.`

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
