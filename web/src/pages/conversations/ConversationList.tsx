// ============================================================
// ConversationList — Sprint 3C
// Painel esquerdo da inbox: filtros, busca, lista de conversas.
// ============================================================

import { useState, useRef, useCallback } from 'react'
import { Search, Bot, User, Inbox, MessageCircle, Wifi, WifiOff } from 'lucide-react'
import { useConversations, type OwnershipFilter, type Conversation } from '@/hooks/useConversations'

// ── Helpers ────────────────────────────────────────────────

function displayName(c: Conversation): string {
  if (c.person?.first_name) {
    return [c.person.first_name, c.person.last_name].filter(Boolean).join(' ')
  }
  return c.contact_phone
}

function relativeTime(ts: string | null): string {
  if (!ts) return ''
  try {
    const diff = Date.now() - new Date(ts).getTime()
    const mins  = Math.floor(diff / 60_000)
    const hours = Math.floor(diff / 3_600_000)
    const days  = Math.floor(diff / 86_400_000)
    if (mins < 1)   return 'agora'
    if (mins < 60)  return `${mins}min`
    if (hours < 24) return `${hours}h`
    if (days < 7)   return `${days}d`
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(ts))
  } catch {
    return ''
  }
}

function ownershipIcon(c: Conversation) {
  if (c.ownership === 'agent') return <Bot size={12} className="text-blue-500" />
  if (c.ownership === 'human') return <User size={12} className="text-emerald-600" />
  return null
}

function statusDot(status: Conversation['status']) {
  const map: Record<string, string> = {
    open:    'bg-emerald-500',
    pending: 'bg-amber-400',
    closed:  'bg-gray-400',
  }
  return map[status] ?? 'bg-gray-300'
}

// ── Filtros superiores ─────────────────────────────────────

const FILTERS: { key: OwnershipFilter; label: string }[] = [
  { key: 'all',    label: 'Todos'    },
  { key: 'agent',  label: 'IA'       },
  { key: 'human',  label: 'Humano'   },
  { key: 'unread', label: 'Não lidos'},
]

// ── Props ──────────────────────────────────────────────────

interface ConversationListProps {
  selectedId:  string | null
  onSelect:    (id: string) => void
}

// ── Componente ─────────────────────────────────────────────

export function ConversationList({ selectedId, onSelect }: ConversationListProps) {
  const [filter, setFilter]     = useState<OwnershipFilter>('all')
  const [search, setSearch]     = useState('')
  const [inputValue, setInput]  = useState('')
  const debounceRef             = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleInput = useCallback((val: string) => {
    setInput(val)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(val), 600)
  }, [])

  const { conversations, loading, error, unreadTotal } = useConversations(filter, search)

  return (
    <div className="flex flex-col h-full bg-white border-r border-[#EDE0CC]">

      {/* ── Cabeçalho ──────────────────────────────────── */}
      <div className="px-4 pt-4 pb-3 border-b border-[#EDE0CC]">
        <div className="flex items-center gap-2 mb-3">
          <MessageCircle size={18} className="text-[#e13500]" />
          <h2 className="font-semibold text-[#161616] text-sm">Conversas</h2>
          {unreadTotal > 0 && (
            <span className="ml-auto bg-[#e13500] text-white text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px] text-center">
              {unreadTotal > 99 ? '99+' : unreadTotal}
            </span>
          )}
        </div>

        {/* Busca */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8A8A]" />
          <input
            type="text"
            value={inputValue}
            onChange={e => handleInput(e.target.value)}
            placeholder="Buscar por nome ou telefone…"
            className="w-full pl-8 pr-3 py-2 text-sm bg-[#f9eedc] border border-[#EDE0CC] rounded-lg
                       placeholder-[#8A8A8A] text-[#161616] focus:outline-none focus:border-[#e13500]
                       transition-colors"
          />
        </div>

        {/* Filtros */}
        <div className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all
                ${filter === f.key
                  ? 'bg-[#e13500] text-white'
                  : 'bg-[#f9eedc] text-[#5A5A5A] hover:bg-[#EDE0CC]'
                }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Lista ──────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="flex flex-col gap-3 p-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="animate-pulse flex gap-3 items-start">
                <div className="w-10 h-10 rounded-full bg-[#EDE0CC] shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-[#EDE0CC] rounded w-3/4" />
                  <div className="h-3 bg-[#f9eedc] rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="p-4 text-center">
            <WifiOff size={24} className="mx-auto mb-2 text-[#8A8A8A]" />
            <p className="text-xs text-[#8A8A8A]">{error}</p>
          </div>
        )}

        {!loading && !error && conversations.length === 0 && (
          <div className="p-6 text-center">
            <Inbox size={32} className="mx-auto mb-3 text-[#EDE0CC]" />
            <p className="text-sm font-medium text-[#5A5A5A]">
              {search ? 'Nenhuma conversa encontrada' : 'Nenhuma conversa ainda'}
            </p>
            {search && (
              <p className="text-xs text-[#8A8A8A] mt-1">Tente outro nome ou telefone</p>
            )}
          </div>
        )}

        {!loading && !error && conversations.map(c => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-4 py-3 border-b border-[#f9eedc] transition-colors
              hover:bg-[#FDF6EB] relative
              ${selectedId === c.id ? 'bg-[#FDE8E0] border-l-2 border-l-[#e13500]' : 'border-l-2 border-l-transparent'}`}
          >
            <div className="flex items-start gap-3">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-10 h-10 rounded-full bg-[#f9eedc] flex items-center justify-center
                                text-sm font-semibold text-[#670000]">
                  {displayName(c).charAt(0).toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusDot(c.status)}`} />
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <span className="text-sm font-semibold text-[#161616] truncate">
                    {displayName(c)}
                  </span>
                  <span className="text-[10px] text-[#8A8A8A] shrink-0">
                    {relativeTime(c.last_message_at)}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs text-[#5A5A5A] truncate flex-1">
                    {c.last_message_preview ?? c.contact_phone}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {ownershipIcon(c)}
                    {c.unread_count > 0 && (
                      <span className="bg-[#e13500] text-white text-[10px] font-bold
                                       rounded-full w-4 h-4 flex items-center justify-center">
                        {c.unread_count > 9 ? '9+' : c.unread_count}
                      </span>
                    )}
                  </div>
                </div>

                {/* Canal / Atribuição */}
                <div className="flex items-center gap-1 mt-0.5">
                  {c.channel?.provider_label && (
                    <span className="text-[10px] text-[#8A8A8A]">{c.channel.provider_label}</span>
                  )}
                  {c.ownership === 'human' && c.human_actor_name && (
                    <>
                      <span className="text-[10px] text-[#8A8A8A]">·</span>
                      <span className="text-[10px] text-emerald-600 font-medium">{c.human_actor_name}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* ── Rodapé: indicador de conexão ───────────────── */}
      <div className="px-4 py-2 border-t border-[#EDE0CC] flex items-center gap-1.5">
        <Wifi size={12} className="text-emerald-500" />
        <span className="text-[10px] text-[#8A8A8A]">Atualização em tempo real</span>
      </div>
    </div>
  )
}
