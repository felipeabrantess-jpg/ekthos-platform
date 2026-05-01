// ============================================================
// useConversationMessages — Sprint 3C
// Mensagens de uma conversa com realtime.
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ──────────────────────────────────────────────────

export interface ConversationMessage {
  id:                 string
  conversation_id:    string
  direction:          'inbound' | 'outbound'
  actor_type:         'agent' | 'human' | 'contact' | 'system'
  body:               string
  status:             'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  created_at:         string
  provider_message_id: string | null
}

export interface UseConversationMessagesResult {
  messages:  ConversationMessage[]
  loading:   boolean
  error:     string | null
}

// ── Hook ───────────────────────────────────────────────────

export function useConversationMessages(
  conversationId: string | null,
): UseConversationMessagesResult {
  const { churchId } = useAuth()
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !churchId) return
    setLoading(true)
    setError(null)

    try {
      const { data, error: qErr } = await supabase
        .from('conversation_messages')
        .select('id, conversation_id, direction, actor_type, body, status, created_at, provider_message_id')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
        .limit(100)

      if (qErr) throw new Error(qErr.message)
      setMessages((data ?? []) as ConversationMessage[])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mensagens')
    } finally {
      setLoading(false)
    }
  }, [conversationId, churchId])

  // ── Fetch inicial ─────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) {
      setMessages([])
      return
    }
    void fetchMessages()
  }, [fetchMessages, conversationId])

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId) return

    // Remove canal anterior se houver
    if (channelRef.current) {
      void supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'conversation_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => { void fetchMessages() }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [conversationId, fetchMessages])

  return { messages, loading, error }
}
