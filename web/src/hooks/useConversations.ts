// ============================================================
// useConversations — Sprint 3C
// Lista de conversas da inbox com busca, filtros e realtime.
//
// Busca por nome: procura people.first_name/last_name primeiro,
// retorna person_ids → filtra conversations.person_id IN (ids).
// Busca por fone: ilike em contact_phone.
// ============================================================

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ──────────────────────────────────────────────────

export interface ConversationPerson {
  first_name: string
  last_name:  string | null
}

export interface ConversationChannel {
  phone_number:   string
  provider_label: string | null
}

export interface Conversation {
  id:                   string
  status:               'open' | 'pending' | 'closed' | 'archived'
  ownership:            'agent' | 'human' | 'unassigned'
  contact_phone:        string
  unread_count:         number
  last_message_at:      string | null
  last_message_preview: string | null
  agent_slug:           string | null
  human_actor_name:     string | null
  channel_type:         string
  person:               ConversationPerson | null
  channel:              ConversationChannel | null
}

export type OwnershipFilter = 'all' | 'agent' | 'human' | 'unread'

export interface UseConversationsResult {
  conversations:  Conversation[]
  loading:        boolean
  error:          string | null
  unreadTotal:    number
  refetch:        () => void
}

// ── Hook ───────────────────────────────────────────────────

export function useConversations(
  ownershipFilter: OwnershipFilter = 'all',
  search:          string          = '',
): UseConversationsResult {
  const { churchId } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  const fetchConversations = useCallback(async () => {
    if (!churchId) return
    setLoading(true)
    setError(null)

    try {
      // ── Resolver person_ids por nome se busca tem letras ──
      let personIds: string[] | null = null

      const searchTrimmed = search.trim()
      const isNameSearch  = searchTrimmed.length > 0 && /[a-zA-ZÀ-ú]/.test(searchTrimmed)

      if (isNameSearch) {
        const { data: people } = await supabase
          .from('people')
          .select('id')
          .eq('church_id', churchId)
          .or(
            `first_name.ilike.%${searchTrimmed}%,last_name.ilike.%${searchTrimmed}%`
          )
          .limit(100)

        personIds = (people ?? []).map(p => p.id as string)
        // Se buscou por nome mas não achou ninguém, retorna lista vazia
        if (personIds.length === 0) {
          setConversations([])
          setLoading(false)
          return
        }
      }

      // ── Query principal ───────────────────────────────────
      let query = supabase
        .from('conversations')
        .select(`
          id, status, ownership, contact_phone, unread_count,
          last_message_at, last_message_preview, agent_slug,
          human_actor_name, channel_type,
          people!person_id ( first_name, last_name ),
          church_whatsapp_channels!channel_id ( phone_number, provider_label )
        `)
        .eq('church_id', churchId)
        .neq('status', 'archived')

      // Filtro de ownership/unread
      if (ownershipFilter === 'agent')  query = query.eq('ownership', 'agent')
      if (ownershipFilter === 'human')  query = query.eq('ownership', 'human')
      if (ownershipFilter === 'unread') query = query.gt('unread_count', 0)

      // Filtro de busca
      if (personIds !== null) {
        query = query.in('person_id', personIds)
      } else if (searchTrimmed.length > 0) {
        // Apenas dígitos → busca por telefone
        query = query.ilike('contact_phone', `%${searchTrimmed.replace(/\D/g, '')}%`)
      }

      const { data, error: qErr } = await query
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .limit(60)

      if (qErr) throw new Error(qErr.message)

      setConversations(
        (data ?? []).map(c => ({
          ...c,
          // Supabase retorna join como objeto ou array dependendo da relação
          person:  (c.people as ConversationPerson | ConversationPerson[] | null)
            ? Array.isArray(c.people) ? c.people[0] ?? null : c.people as ConversationPerson
            : null,
          channel: (c.church_whatsapp_channels as ConversationChannel | ConversationChannel[] | null)
            ? Array.isArray(c.church_whatsapp_channels) ? c.church_whatsapp_channels[0] ?? null : c.church_whatsapp_channels as ConversationChannel
            : null,
        }))
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar conversas')
    } finally {
      setLoading(false)
    }
  }, [churchId, ownershipFilter, search])

  // ── Fetch inicial ─────────────────────────────────────────
  useEffect(() => {
    void fetchConversations()
  }, [fetchConversations])

  // ── Realtime ──────────────────────────────────────────────
  useEffect(() => {
    if (!churchId) return

    const channel = supabase
      .channel(`inbox:${churchId}:${ownershipFilter}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'conversations',
          filter: `church_id=eq.${churchId}`,
        },
        () => { void fetchConversations() }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [churchId, ownershipFilter, fetchConversations])

  const unreadTotal = conversations.reduce((sum, c) => sum + (c.unread_count ?? 0), 0)

  return { conversations, loading, error, unreadTotal, refetch: fetchConversations }
}
