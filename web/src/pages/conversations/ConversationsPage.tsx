// ============================================================
// ConversationsPage — Sprint 3C
// Rota: /conversas e /conversas/:id
//
// Layout 3 colunas:
//   [320px] ConversationList | [flex-1] ConversationThread | [280px] ConversationContext
//
// Mobile: apenas lista; ao selecionar, mostra thread fullscreen.
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ConversationList }    from './ConversationList'
import { ConversationThread }  from './ConversationThread'
import { ConversationContext } from './ConversationContext'
import { useConversations, type Conversation, type ConversationPerson, type ConversationChannel } from '@/hooks/useConversations'
import { supabase } from '@/lib/supabase'

// ── Componente ─────────────────────────────────────────────

export default function ConversationsPage() {
  const { id }         = useParams<{ id?: string }>()
  const navigate       = useNavigate()
  const [selected, setSelected] = useState<string | null>(id ?? null)

  // Sincroniza URL ↔ estado
  useEffect(() => {
    setSelected(id ?? null)
  }, [id])

  // Única instância de useConversations para Thread + Context.
  // ConversationList mantém a sua própria (com filter/search internos).
  // Cada instância usa instanceId único no nome do canal — previne o erro
  // "cannot add postgres_changes callbacks after subscribe()" do Supabase
  // que ocorre quando múltiplas instâncias criam o mesmo nome de canal
  // e o Supabase retorna o canal já subscrito.
  const { conversations, loading: convLoading, refetch } = useConversations()
  const selectedConversation = selected
    ? (conversations.find(c => c.id === selected) ?? null)
    : null

  // ── Fallback: fetch individual quando conversa está fora do limit(60) ───────
  // useConversations carrega apenas as 60 mais recentes por last_message_at.
  // Conversas com last_message_at antigo (rank > 60) nunca aparecem na lista,
  // então selectedConversation fica null e o Composer nunca desbloqueia.
  // Fix: quando a lista carregou mas a conversa ainda não foi encontrada,
  // buscamos ela individualmente por ID e usamos como fallback.
  const [fallbackConversation, setFallbackConversation] = useState<Conversation | null>(null)

  const fetchSingleConversation = useCallback(async (convId: string): Promise<Conversation | null> => {
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, status, ownership, contact_phone, unread_count,
        last_message_at, last_message_preview, agent_slug,
        human_actor_name, channel_type,
        people!person_id ( first_name, last_name ),
        church_whatsapp_channels!channel_id ( phone_number, provider_label )
      `)
      .eq('id', convId)
      .single()
    if (!data) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = data as any
    return {
      id:                   c.id,
      status:               c.status,
      ownership:            c.ownership,
      contact_phone:        c.contact_phone,
      unread_count:         c.unread_count,
      last_message_at:      c.last_message_at,
      last_message_preview: c.last_message_preview,
      agent_slug:           c.agent_slug,
      human_actor_name:     c.human_actor_name,
      channel_type:         c.channel_type,
      person: c.people
        ? (Array.isArray(c.people) ? c.people[0] ?? null : c.people) as ConversationPerson
        : null,
      channel: c.church_whatsapp_channels
        ? (Array.isArray(c.church_whatsapp_channels) ? c.church_whatsapp_channels[0] ?? null : c.church_whatsapp_channels) as ConversationChannel
        : null,
    } as Conversation
  }, [])

  // Quando lista terminou de carregar e conversa não está no top-60, busca por ID
  useEffect(() => {
    setFallbackConversation(null)
    if (!selected || convLoading || selectedConversation) return
    let cancelled = false
    void fetchSingleConversation(selected).then(conv => {
      if (!cancelled && conv) setFallbackConversation(conv)
    })
    return () => { cancelled = true }
  }, [selected, convLoading, selectedConversation, fetchSingleConversation])

  // Após assumir: refetch da lista + busca individual para atualizar o fallback
  const handleAssumeRefetch = useCallback(() => {
    refetch()
    if (!selectedConversation && selected) {
      void fetchSingleConversation(selected).then(conv => {
        if (conv) setFallbackConversation(conv)
      })
    }
  }, [refetch, selectedConversation, selected, fetchSingleConversation])

  // Usa selectedConversation (top-60) ou fallback (busca individual por ID)
  const effectiveConversation = selectedConversation ?? fallbackConversation

  function handleSelect(conversationId: string) {
    setSelected(conversationId)
    navigate(`/conversas/${conversationId}`, { replace: false })
  }

  function handleBack() {
    setSelected(null)
    navigate('/conversas', { replace: false })
  }

  return (
    <div className="flex h-full bg-[#f9eedc] overflow-hidden">

      {/* ── Coluna 1: Lista ─────────────────────────────── */}
      <div
        className={`w-[320px] shrink-0 h-full
          ${selected ? 'hidden md:flex md:flex-col' : 'flex flex-col w-full md:w-[320px]'}`}
      >
        <ConversationList
          selectedId={selected}
          onSelect={handleSelect}
        />
      </div>

      {/* ── Coluna 2: Thread ────────────────────────────── */}
      {selected && (
        <>
          <div className="flex-1 flex flex-col min-w-0 h-full">
            {/* Botão voltar — apenas mobile */}
            <div className="md:hidden bg-white border-b border-[#EDE0CC] px-3 py-2">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-[#e13500] font-medium"
              >
                <ArrowLeft size={16} />
                Voltar
              </button>
            </div>

            <ConversationThread
              conversationId={selected}
              conversation={effectiveConversation}
              onAssume={handleAssumeRefetch}
            />
          </div>

          {/* ── Coluna 3: Contexto — apenas desktop ─────── */}
          <div className="hidden lg:flex lg:flex-col h-full">
            <ConversationContext
              conversationId={selected}
              conversation={effectiveConversation}
              refetch={handleAssumeRefetch}
            />
          </div>
        </>
      )}

      {/* Placeholder quando nenhuma conversa selecionada em desktop */}
      {!selected && (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#f9eedc] gap-3">
          <div className="w-20 h-20 rounded-full bg-white border border-[#EDE0CC]
                          flex items-center justify-center shadow-sm">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.5" className="text-[#EDE0CC]">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-[#5A5A5A]">Central de Conversas</p>
          <p className="text-xs text-[#8A8A8A]">Selecione uma conversa para iniciar</p>
        </div>
      )}
    </div>
  )
}
