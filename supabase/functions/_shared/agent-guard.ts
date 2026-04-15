// ============================================================
// Shared: agent-guard.ts
// Middleware para agentes de IA:
//   - Verifica se a church tem o agente ativado
//   - Loga execuções em agent_executions
//   - Salva e recupera histórico de agent_conversations
// ============================================================

import { supabase } from './supabase-client.ts'

// ── Tipos ─────────────────────────────────────────────────

export interface GuardResult {
  allowed: boolean
  reason?:  string
}

export interface ConversationMessage {
  role:    'user' | 'assistant'
  content: string
}

// ── Guarda: verifica acesso ao agente ─────────────────────

/**
 * Verifica se a church tem o agente ativado.
 * agent-suporte é sempre liberado (pricing_tier = 'free').
 */
export async function guardAgent(
  churchId: string,
  agentSlug: string,
): Promise<GuardResult> {
  // Suporte é sempre free — libera sem consultar banco
  if (agentSlug === 'agent-suporte') return { allowed: true }

  // Busca subscription ativa da church
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('church_id', churchId)
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (subErr || !sub) {
    return { allowed: false, reason: 'Assinatura não encontrada ou inativa' }
  }

  // Verifica se o agente está ativado na subscription
  const { data: sa, error: saErr } = await supabase
    .from('subscription_agents')
    .select('active')
    .eq('subscription_id', sub.id)
    .eq('agent_slug', agentSlug)
    .maybeSingle()

  if (saErr) {
    console.error('[agent-guard] Erro ao verificar agente:', saErr.message)
    return { allowed: false, reason: 'Erro ao verificar acesso' }
  }

  if (!sa || !sa.active) {
    return { allowed: false, reason: 'Agente não ativado para esta conta' }
  }

  return { allowed: true }
}

// ── Log de execução ────────────────────────────────────────

export async function logExecution(params: {
  churchId:     string
  agentSlug:    string
  userId?:      string | null
  model:        string
  inputTokens:  number
  outputTokens: number
  durationMs:   number
  success:      boolean
  error?:       string | null
}): Promise<void> {
  try {
    const { error } = await supabase.from('agent_executions').insert({
      church_id:     params.churchId,
      agent_slug:    params.agentSlug,
      user_id:       params.userId ?? null,
      model:         params.model,
      input_tokens:  params.inputTokens,
      output_tokens: params.outputTokens,
      duration_ms:   params.durationMs,
      success:       params.success,
      error:         params.error ?? null,
    })
    if (error) console.error('[agent-guard] log execution error:', error.message)
  } catch (err) {
    console.error('[agent-guard] log execution failed:', err)
  }
}

// ── Histórico de conversa ──────────────────────────────────

export async function saveMessage(params: {
  churchId:   string
  userId:     string
  agentSlug:  string
  role:       'user' | 'assistant'
  content:    string
  tokensUsed?: number
}): Promise<void> {
  try {
    await supabase.from('agent_conversations').insert({
      church_id:   params.churchId,
      user_id:     params.userId,
      agent_slug:  params.agentSlug,
      role:        params.role,
      content:     params.content,
      tokens_used: params.tokensUsed ?? null,
    })
  } catch (err) {
    console.error('[agent-guard] saveMessage failed:', err)
  }
}

export async function getHistory(params: {
  churchId:  string
  userId:    string
  agentSlug: string
  limit?:    number
}): Promise<ConversationMessage[]> {
  try {
    const { data } = await supabase
      .from('agent_conversations')
      .select('role, content')
      .eq('church_id', params.churchId)
      .eq('user_id', params.userId)
      .eq('agent_slug', params.agentSlug)
      .order('created_at', { ascending: false })
      .limit(params.limit ?? 20)

    if (!data) return []
    // Retorna em ordem cronológica
    return data
      .reverse()
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))
  } catch {
    return []
  }
}

export async function clearHistory(params: {
  churchId:  string
  userId:    string
  agentSlug: string
}): Promise<void> {
  try {
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', params.churchId)
      .eq('user_id', params.userId)
      .eq('agent_slug', params.agentSlug)
  } catch (err) {
    console.error('[agent-guard] clearHistory failed:', err)
  }
}
