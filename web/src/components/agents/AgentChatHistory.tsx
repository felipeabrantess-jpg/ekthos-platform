/**
 * AgentChatHistory.tsx — Sidebar/Drawer de sessões de chat
 *
 * Desktop (md+): painel fixo de 240px à esquerda do chat.
 * Mobile (<md): renderizado fora — controlado pelo pai via visibilidade.
 *
 * Props:
 *  agentSlug        — para filtrar sessões
 *  currentSessionId — destaca sessão ativa
 *  onNewConversation — cria nova sessão e redireciona
 *  onSelectSession   — troca para sessão selecionada
 *  onClose          — fecha drawer mobile
 */

import { useEffect, useState } from 'react'
import { Plus, MessageSquare, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ChatSession {
  id:              string
  title:           string
  last_message_at: string
  created_at:      string
}

interface Props {
  agentSlug:        string
  currentSessionId: string | null
  onNewConversation: () => void
  onSelectSession:  (session: ChatSession) => void
  onClose?:         () => void  // mobile drawer close
}

// ── Formatação de tempo relativo ──────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)

  if (mins < 2)   return 'agora'
  if (mins < 60)  return `há ${mins} min`
  if (hours < 24) return `há ${hours}h`
  if (days === 1) return 'ontem'
  if (days < 7)   return `há ${days} dias`
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

// ── AgentChatHistory ──────────────────────────────────────────────────────────

export function AgentChatHistory({
  agentSlug,
  currentSessionId,
  onNewConversation,
  onSelectSession,
  onClose,
}: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    void loadSessions()
  }, [agentSlug])

  async function loadSessions() {
    setLoading(true)
    const { data } = await supabase
      .from('agent_chat_sessions')
      .select('id, title, last_message_at, created_at')
      .eq('agent_slug', agentSlug)
      .eq('archived', false)
      .order('last_message_at', { ascending: false })
      .limit(50)

    setSessions((data ?? []) as ChatSession[])
    setLoading(false)
  }

  // Expõe refresh para o pai (via ref não usado aqui — simples useEffect re-mount)

  return (
    <div
      className="flex flex-col h-full"
      style={{
        background: '#fafaf9',
        borderRight: '1px solid rgba(0,0,0,0.06)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 h-14 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <span className="text-[11px] font-bold uppercase tracking-widest text-ekthos-black/40 select-none">
          Conversas
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={onNewConversation}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700 px-2 py-1 rounded-lg hover:bg-brand-50 transition-colors"
            title="Nova conversa"
          >
            <Plus size={13} strokeWidth={2.5} />
            <span>Nova</span>
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors md:hidden"
            >
              <X size={15} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {/* Lista de sessões */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {loading && (
          <p className="text-[11px] px-2 py-3 text-center" style={{ color: 'rgba(0,0,0,0.3)' }}>
            Carregando…
          </p>
        )}

        {!loading && sessions.length === 0 && (
          <div className="flex flex-col items-center py-8 text-center select-none">
            <MessageSquare size={20} className="text-gray-300 mb-2" strokeWidth={1.5} />
            <p className="text-xs text-gray-400">Nenhuma conversa ainda</p>
          </div>
        )}

        {sessions.map(session => {
          const isActive = session.id === currentSessionId
          return (
            <button
              key={session.id}
              onClick={() => onSelectSession(session)}
              className="w-full text-left px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: isActive ? 'rgba(225,53,0,0.06)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--church-primary, var(--color-primary))' : '2px solid transparent',
              }}
              onMouseEnter={e => {
                if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'
              }}
              onMouseLeave={e => {
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              <p
                className="text-[12px] font-medium leading-tight truncate"
                style={{ color: isActive ? 'var(--color-primary)' : 'rgba(0,0,0,0.75)' }}
              >
                {session.title}
              </p>
              <p className="text-[10px] mt-0.5 leading-tight" style={{ color: 'rgba(0,0,0,0.3)' }}>
                {relativeTime(session.last_message_at)}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
