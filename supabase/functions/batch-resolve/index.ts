// ============================================================
// Edge Function: batch-resolve
// Resolve jobs pendentes da Anthropic Batch API.
// Chamado pelo n8n após submissão de batch.
//
// POST /batch-resolve
// Headers: Authorization: Bearer <supabase-service-role-key> (via n8n)
// Body: { batch_id: string, church_id: string, agent_slug: string, user_id?: string }
//
// Returns: { status: 'done'|'processing'|'failed', content?: string, error?: string }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BATCH_BASE = 'https://api.anthropic.com/v1/messages/batches'
const BATCH_HDRS = {
  'x-api-key':         ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta':    'message-batches-2024-09-24',
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function jsonResp(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return jsonResp({ error: 'Method Not Allowed' }, 405)

  // ── Verifica que veio do n8n/service (sem JWT de usuário) ──
  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) return jsonResp({ error: 'Unauthorized' }, 401)

  let body: { batch_id?: string; church_id?: string; agent_slug?: string; user_id?: string }
  try   { body = await req.json() }
  catch { return jsonResp({ error: 'Body inválido' }, 400) }

  const { batch_id, church_id, agent_slug, user_id } = body
  if (!batch_id || !church_id || !agent_slug) {
    return jsonResp({ error: 'batch_id, church_id e agent_slug são obrigatórios' }, 400)
  }

  // ── Verifica status do batch ────────────────────────────
  const statusRes = await fetch(`${BATCH_BASE}/${batch_id}`, { headers: BATCH_HDRS })
  if (!statusRes.ok) {
    return jsonResp({ error: `Anthropic API error: ${statusRes.status}` }, 502)
  }
  const batchInfo = await statusRes.json() as {
    processing_status: string
    request_counts:    Record<string, number>
  }

  if (batchInfo.processing_status !== 'ended') {
    return jsonResp({
      status:  'processing',
      message: `Batch status: ${batchInfo.processing_status}`,
      counts:  batchInfo.request_counts,
    })
  }

  // ── Busca resultados ────────────────────────────────────
  const resultsRes = await fetch(`${BATCH_BASE}/${batch_id}/results`, { headers: BATCH_HDRS })
  if (!resultsRes.ok) {
    return jsonResp({ error: `Results fetch failed: ${resultsRes.status}` }, 502)
  }

  const resultsText = await resultsRes.text()
  const results = resultsText
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line: string) => JSON.parse(line)) as Array<{
      custom_id: string
      result: {
        type:     string
        message?: {
          content: Array<{ type: string; text: string }>
          usage:   Record<string, number>
        }
        error?: { type: string; message: string }
      }
    }>

  const saved: string[] = []

  for (const item of results) {
    if (item.result.type !== 'succeeded' || !item.result.message) continue

    const content      = item.result.message.content.find(c => c.type === 'text')?.text ?? ''
    const usage        = item.result.message.usage
    const inputTokens  = usage.input_tokens  ?? 0
    const outputTokens = usage.output_tokens ?? 0
    const cacheRead    = usage.cache_read_input_tokens    ?? 0
    const cacheCreate  = usage.cache_creation_input_tokens ?? 0

    // Salva resultado em agent_conversations (para o frontend exibir)
    await supabase.from('agent_conversations').insert({
      church_id:   church_id,
      user_id:     user_id ?? null,
      agent_slug:  agent_slug,
      role:        'assistant',
      content:     content,
      tokens_used: outputTokens,
    })

    // Atualiza agent_executions: marca batch como completed
    await supabase
      .from('agent_executions')
      .update({
        success:               true,
        batch_status:          'completed',
        input_tokens:          inputTokens,
        output_tokens:         outputTokens,
        cache_read_tokens:     cacheRead,
        cache_creation_tokens: cacheCreate,
        duration_ms:           0,     // batch não tem duration
      })
      .eq('batch_id', batch_id)

    saved.push(item.custom_id)
  }

  // Marca erros
  for (const item of results) {
    if (item.result.type === 'succeeded') continue

    await supabase
      .from('agent_executions')
      .update({
        success:      false,
        batch_status: 'failed',
        error:        item.result.error?.message ?? item.result.type,
      })
      .eq('batch_id', batch_id)
  }

  return jsonResp({
    status:        'done',
    saved_count:   saved.length,
    total_results: results.length,
    first_content: results[0]?.result?.message?.content?.[0]?.text?.slice(0, 200) ?? null,
  })
})
