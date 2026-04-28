/**
 * agent-chat-client.ts — Camada de comunicação com os agentes IA
 *
 * openAgentStream: POST para EF do agente, consome SSE e dispara callbacks
 * loadAgentMessages: lê histórico de agent_conversations para este usuário/agente
 *
 * Formato SSE das EFs:
 *   data: {"type":"token","content":"..."}
 *   data: {"type":"done","input_tokens":N,"output_tokens":N}
 *   data: {"type":"error","message":"..."}
 */

import { supabase } from '@/lib/supabase'

const EF_BASE = import.meta.env.VITE_SUPABASE_URL as string

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id?:         string
  role:        'user' | 'assistant'
  content:     string
  created_at?: string
}

export interface StreamCallbacks {
  /** Chamado a cada token SSE recebido */
  onChunk: (text: string) => void
  /** Chamado quando o stream fecha normalmente */
  onDone: () => void
  /** Chamado em caso de erro (EF retornou erro ou falha de rede) */
  onError: (message: string) => void
}

// ── openAgentStream ───────────────────────────────────────────────────────────

/**
 * Abre stream SSE para um agente IA e consome os chunks.
 * Resolve quando o stream fechar (done ou error).
 *
 * @param agentSlug  slug da EF, ex: "agent-suporte"
 * @param message    mensagem do usuário
 * @param clearHistory  se true, envia clear_history=true → EF apaga histórico antigo
 * @param callbacks  onChunk / onDone / onError
 */
export async function openAgentStream(
  agentSlug: string,
  message: string,
  clearHistory: boolean,
  callbacks: StreamCallbacks,
): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) {
    callbacks.onError('Sessão expirada. Faça login novamente.')
    return
  }

  try {
    const response = await fetch(`${EF_BASE}/functions/v1/${agentSlug}`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        Authorization:   `Bearer ${token}`,
      },
      body: JSON.stringify({
        message,
        ...(clearHistory ? { clear_history: true } : {}),
      }),
    })

    if (!response.ok) {
      let errMsg = `Erro ${response.status}`
      try {
        const json = await response.json() as { error?: string }
        if (json.error) errMsg = json.error
      } catch { /* ignore */ }
      callbacks.onError(errMsg)
      return
    }

    if (!response.body) {
      callbacks.onError('Stream vazio — tente novamente.')
      return
    }

    const reader  = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer    = ''
    let gotDone   = false

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const payload = JSON.parse(line.slice(6)) as {
            type:     string
            content?: string
            message?: string
          }
          if (payload.type === 'token' && payload.content) {
            callbacks.onChunk(payload.content)
          } else if (payload.type === 'done') {
            gotDone = true
            callbacks.onDone()
          } else if (payload.type === 'error') {
            callbacks.onError(payload.message ?? 'Erro interno no agente.')
            return
          }
        } catch {
          // ignora chunk malformado
        }
      }
    }

    // Garante que onDone é sempre chamado
    if (!gotDone) callbacks.onDone()
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'Erro de conexão.')
  }
}

// ── loadAgentMessages ─────────────────────────────────────────────────────────

/**
 * Carrega histórico de mensagens do usuário atual para um agente.
 * Filtra explicitamente por user_id (RLS só filtra por church_id).
 */
export async function loadAgentMessages(
  agentSlug: string,
  userId: string,
  limit = 60,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from('agent_conversations')
    .select('id, role, content, created_at')
    .eq('agent_slug', agentSlug)
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(limit)

  return (data ?? []) as ChatMessage[]
}
