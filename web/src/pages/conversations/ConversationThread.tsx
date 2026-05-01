// ============================================================
// ConversationThread — Sprint 3D
// Coluna central: histórico de mensagens + composer habilitado.
//
// Regras Sprint 3D:
//   - Composer habilitado SOMENTE quando ownership === 'human'
//   - Enter envia; Shift+Enter nova linha
//   - Envio via conversation-send-message EF
//   - Backend bloqueia se ownership !== 'human' (proteção final)
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Bot, User, ArrowLeftRight, Phone, Lock, Send,
  CheckCheck, Clock, AlertCircle, Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useConversationMessages, type ConversationMessage } from '@/hooks/useConversationMessages'
import { useConversations, type Conversation } from '@/hooks/useConversations'

// ── Helpers ────────────────────────────────────────────────

function formatTime(ts: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ts))
  } catch {
    return ''
  }
}

function formatDateSeparator(ts: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' }).format(new Date(ts))
  } catch {
    return ''
  }
}

function sameDay(a: string, b: string): boolean {
  return a.slice(0, 10) === b.slice(0, 10)
}

function StatusIcon({ status }: { status: ConversationMessage['status'] }) {
  if (status === 'pending') return <Clock size={11} className="text-[#8A8A8A]" />
  if (status === 'failed')  return <AlertCircle size={11} className="text-[#e13500]" />
  return <CheckCheck size={11} className={status === 'read' ? 'text-blue-400' : 'text-[#8A8A8A]'} />
}

function actorLabel(m: ConversationMessage): string {
  if (m.direction === 'inbound') return ''
  if (m.actor_type === 'agent')  return 'IA'
  if (m.actor_type === 'human')  return 'Staff'
  if (m.actor_type === 'system') return 'Sistema'
  return ''
}

// ── Bubble ─────────────────────────────────────────────────

function Bubble({ msg }: { msg: ConversationMessage }) {
  const isOutbound = msg.direction === 'outbound'
  const isAgent    = msg.actor_type === 'agent'
  const isSystem   = msg.actor_type === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-[#8A8A8A] bg-[#f9eedc] px-3 py-1 rounded-full">
          {msg.body}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex items-end gap-2 mb-1 ${isOutbound ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar pequeno */}
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0
        ${isOutbound
          ? isAgent ? 'bg-blue-100' : 'bg-emerald-100'
          : 'bg-[#f9eedc]'
        }`}>
        {isOutbound
          ? isAgent
            ? <Bot size={12} className="text-blue-500" />
            : <User size={12} className="text-emerald-600" />
          : <Phone size={12} className="text-[#670000]" />
        }
      </div>

      {/* Balão */}
      <div
        className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed
          ${isOutbound
            ? isAgent
              ? 'bg-blue-500 text-white rounded-br-sm'
              : 'bg-[#e13500] text-white rounded-br-sm'
            : 'bg-white border border-[#EDE0CC] text-[#161616] rounded-bl-sm'
          }`}
      >
        {actorLabel(msg) && (
          <p className="text-[10px] font-semibold mb-0.5 opacity-75">
            {actorLabel(msg)}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
        <div className={`flex items-center gap-1 mt-1 justify-end
          ${isOutbound ? 'opacity-70' : 'opacity-50'}`}>
          <span className="text-[10px]">{formatTime(msg.created_at)}</span>
          {isOutbound && <StatusIcon status={msg.status} />}
        </div>
      </div>
    </div>
  )
}

// ── EmptyState ─────────────────────────────────────────────

function EmptyThread() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-8">
      <div className="w-16 h-16 rounded-full bg-[#f9eedc] flex items-center justify-center">
        <ArrowLeftRight size={28} className="text-[#EDE0CC]" />
      </div>
      <p className="text-sm font-medium text-[#5A5A5A]">Selecione uma conversa</p>
      <p className="text-xs text-[#8A8A8A]">
        Escolha uma conversa na lista ao lado para ver o histórico completo.
      </p>
    </div>
  )
}

// ── Composer ───────────────────────────────────────────────

interface ComposerProps {
  conversationId: string
  disabled:       boolean   // true quando ownership !== 'human'
}

function Composer({ conversationId, disabled }: ComposerProps) {
  const [text, setText]       = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setError] = useState<string | null>(null)
  const textareaRef           = useRef<HTMLTextAreaElement>(null)

  const sendMessage = useCallback(async () => {
    const body = text.trim()
    if (!body || sending || disabled) return

    setSending(true)
    setError(null)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/conversation-send-message`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ conversation_id: conversationId, body }),
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? `Erro ${res.status}`)
      }

      setText('')
      // Realtime atualiza a lista de mensagens automaticamente
      setTimeout(() => textareaRef.current?.focus(), 50)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao enviar'
      setError(msg)
    } finally {
      setSending(false)
    }
  }, [text, conversationId, disabled, sending])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  if (disabled) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-[#f9eedc] rounded-xl border border-[#EDE0CC]">
        <Lock size={15} className="text-[#8A8A8A] shrink-0" />
        <p className="text-xs text-[#8A8A8A] flex-1">
          Clique em <strong className="text-[#161616]">Assumir</strong> para responder manualmente.
        </p>
        <Bot size={15} className="text-blue-400 shrink-0" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {sendError && (
        <p className="text-xs text-[#e13500] px-1">{sendError}</p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escreva uma mensagem… (Enter para enviar)"
          disabled={sending}
          className="flex-1 resize-none rounded-xl border border-[#EDE0CC] px-4 py-2.5
                     text-sm text-[#161616] placeholder-[#8A8A8A] focus:outline-none
                     focus:border-[#e13500] transition-colors bg-white
                     disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ maxHeight: '120px', overflowY: 'auto' }}
        />
        <button
          onClick={() => void sendMessage()}
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-xl bg-[#e13500] text-white flex items-center
                     justify-center transition-colors shrink-0
                     hover:bg-[#FF4D1A] active:bg-[#C42E00]
                     disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {sending
            ? <Loader2 size={16} className="animate-spin" />
            : <Send size={16} />
          }
        </button>
      </div>
    </div>
  )
}

// ── Props ──────────────────────────────────────────────────

interface ConversationThreadProps {
  conversationId: string | null
}

// ── Componente ─────────────────────────────────────────────

export function ConversationThread({ conversationId }: ConversationThreadProps) {
  const { messages, loading } = useConversationMessages(conversationId)
  const { conversations }     = useConversations()
  const bottomRef = useRef<HTMLDivElement>(null)

  const conversation: Conversation | undefined = conversations.find(c => c.id === conversationId)

  // Auto-scroll para o fim quando chegam novas mensagens
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col bg-[#f9eedc]">
        <EmptyThread />
      </div>
    )
  }

  const contactName = conversation
    ? [conversation.person?.first_name, conversation.person?.last_name].filter(Boolean).join(' ')
      || conversation.contact_phone
    : '…'

  const isHuman      = conversation?.ownership === 'human'
  const isClosed     = conversation?.status === 'closed' || conversation?.status === 'archived'
  // Composer bloqueado se não é humano OU se conversa foi encerrada/arquivada
  const composerLocked = !isHuman || isClosed

  return (
    <div className="flex-1 flex flex-col bg-[#f9eedc] min-h-0">

      {/* ── Header da conversa ─────────────────────────── */}
      <div className="bg-white border-b border-[#EDE0CC] px-5 py-3 flex items-center gap-3 shrink-0">
        <div className="w-9 h-9 rounded-full bg-[#f9eedc] flex items-center justify-center
                        text-sm font-semibold text-[#670000]">
          {contactName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-[#161616] truncate">{contactName}</p>
          {conversation && (
            <p className="text-xs text-[#8A8A8A]">
              {conversation.contact_phone}
              {conversation.ownership === 'agent' && (
                <span className="ml-2 text-blue-500">· IA ativa</span>
              )}
              {conversation.ownership === 'human' && (
                <span className="ml-2 text-emerald-600">
                  · {conversation.human_actor_name ?? 'Staff'}
                </span>
              )}
              {conversation.ownership === 'unassigned' && (
                <span className="ml-2 text-[#8A8A8A]">· Sem atribuição</span>
              )}
            </p>
          )}
        </div>

        {/* Badge de modo — substituiu o botão Assumir do header (3D: controle está no painel direito) */}
        {isHuman && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold
                           bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg">
            <User size={12} />
            Modo manual
          </span>
        )}
      </div>

      {/* ── Mensagens ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
        {loading && (
          <div className="flex flex-col gap-3">
            {[1,2,3].map(i => (
              <div key={i} className={`flex gap-2 ${i % 2 === 0 ? 'flex-row-reverse' : ''}`}>
                <div className="w-6 h-6 rounded-full bg-[#EDE0CC] animate-pulse shrink-0" />
                <div className={`h-10 rounded-2xl bg-[#EDE0CC] animate-pulse ${i % 2 === 0 ? 'w-48' : 'w-64'}`} />
              </div>
            ))}
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
            <p className="text-sm text-[#8A8A8A]">Nenhuma mensagem ainda.</p>
          </div>
        )}

        {!loading && messages.map((msg, idx) => {
          const prevMsg  = idx > 0 ? messages[idx - 1] : null
          const showDate = !prevMsg || !sameDay(prevMsg.created_at, msg.created_at)

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-3">
                  <span className="text-[10px] text-[#8A8A8A] bg-white border border-[#EDE0CC]
                                   px-3 py-1 rounded-full">
                    {formatDateSeparator(msg.created_at)}
                  </span>
                </div>
              )}
              <Bubble msg={msg} />
            </div>
          )
        })}

        <div ref={bottomRef} />
      </div>

      {/* ── Composer ───────────────────────────────────── */}
      <div className="bg-white border-t border-[#EDE0CC] px-4 py-3 shrink-0">
        {isClosed
          ? (
            <div className="flex items-center justify-center gap-2 py-2">
              <p className="text-xs text-[#8A8A8A]">
                Conversa {conversation?.status === 'archived' ? 'arquivada' : 'encerrada'} · sem envio de mensagens
              </p>
            </div>
          )
          : (
            <Composer
              conversationId={conversationId}
              disabled={composerLocked}
            />
          )
        }
      </div>
    </div>
  )
}
