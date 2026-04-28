/**
 * AgentChatInterface.tsx — Área de chat com streaming SSE
 *
 * Mobile-first: full-width, input adesivo, auto-scroll.
 * Desktop: flex-1 dentro do layout de AgentChat.
 *
 * Props:
 *  agentSlug / agentName / AgentIcon — identidade visual
 *  initialMessages — mensagens carregadas do DB ao montar
 *  isNewSession — se true, o primeiro envio manda clear_history=true
 *  onNewConversation — callback para criar nova sessão
 *  onBack — callback mobile (voltar para histórico)
 *  onMessageSent — notifica o pai após mensagem enviada (ex: atualizar last_message_at)
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { ArrowLeft, Send, Plus, Loader2, RotateCcw, MessageCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { openAgentStream, type ChatMessage } from '@/lib/agent-chat-client'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type SendStatus = 'idle' | 'sending' | 'streaming' | 'error'

interface Props {
  agentSlug:        string
  agentName:        string
  AgentIcon:        LucideIcon
  initialMessages:  ChatMessage[]
  isNewSession:     boolean
  onBack?:          () => void
  onNewConversation: () => void
  onMessageSent?:   (firstMsg?: string) => void
}

// ── MessageText — renderiza texto com quebras de linha ────────────────────────

function MessageText({ content }: { content: string }) {
  const lines = content.split('\n')
  return (
    <span>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
    </span>
  )
}

// ── MessageBubble ─────────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`
          max-w-[85%] px-4 py-2.5 text-sm leading-relaxed
          ${isUser
            ? 'bg-brand-600 text-white rounded-2xl rounded-br-sm'
            : 'bg-cream-light text-ekthos-black rounded-2xl rounded-bl-sm border border-cream-dark/40'
          }
        `}
      >
        <MessageText content={message.content} />
      </div>
    </div>
  )
}

// ── TypingDots ────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-0.5">
      {[0, 150, 300].map(delay => (
        <span
          key={delay}
          className="h-1.5 w-1.5 rounded-full bg-ekthos-black/30 animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  )
}

// ── AgentChatInterface ────────────────────────────────────────────────────────

export function AgentChatInterface({
  agentSlug,
  agentName,
  AgentIcon,
  initialMessages,
  isNewSession,
  onBack,
  onNewConversation,
  onMessageSent,
}: Props) {
  const [messages, setMessages]         = useState<ChatMessage[]>(initialMessages)
  const [streamingText, setStreamingText] = useState('')
  const [status, setStatus]             = useState<SendStatus>('idle')
  const [errorMsg, setErrorMsg]         = useState<string | null>(null)
  const [inputText, setInputText]       = useState('')

  const bottomRef     = useRef<HTMLDivElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  // Rastreia se primeira mensagem desta sessão já foi enviada
  const clearSentRef  = useRef(false)
  const isNewRef      = useRef(isNewSession)

  // Sync quando sessão muda (ex: usuário troca de sessão)
  useEffect(() => {
    setMessages(initialMessages)
    setStreamingText('')
    setStatus('idle')
    setErrorMsg(null)
    clearSentRef.current = false
    isNewRef.current = isNewSession
  }, [initialMessages, isNewSession])

  useEffect(() => { isNewRef.current = isNewSession }, [isNewSession])

  // Auto-scroll ao receber novo conteúdo
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingText])

  const sendMessage = useCallback(async () => {
    const text = inputText.trim()
    if (!text || status !== 'idle') return

    // Primeira mensagem de sessão nova → pede limpeza do histórico no EF
    const shouldClear = isNewRef.current && !clearSentRef.current

    const userMsg: ChatMessage = {
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, userMsg])
    setInputText('')
    setStatus('sending')
    setErrorMsg(null)
    setStreamingText('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    let isFirstChunk = true

    await openAgentStream(agentSlug, text, shouldClear, {
      onChunk: (chunk) => {
        if (isFirstChunk) {
          isFirstChunk = false
          clearSentRef.current = true
          setStatus('streaming')
          onMessageSent?.(text)
        }
        setStreamingText(prev => prev + chunk)
      },
      onDone: () => {
        setStreamingText(prev => {
          if (prev) {
            setMessages(m => [
              ...m,
              { role: 'assistant', content: prev, created_at: new Date().toISOString() },
            ])
          }
          return ''
        })
        setStatus('idle')
        // Foca de volta no input
        setTimeout(() => textareaRef.current?.focus(), 50)
      },
      onError: (msg) => {
        setErrorMsg(msg)
        setStatus('error')
        setStreamingText('')
      },
    })
  }, [inputText, status, agentSlug, onMessageSent])

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  function handleTextareaChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
  }

  const isBusy  = status === 'sending' || status === 'streaming'
  const isEmpty = messages.length === 0 && !streamingText

  return (
    <div className="flex flex-col h-full bg-white">

      {/* ── Header ──────────────────────────────────────────── */}
      <div
        className="flex items-center gap-3 px-4 h-14 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        {/* Botão voltar (mobile) */}
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors md:hidden"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
        )}

        {/* Avatar do agente */}
        <div className="h-8 w-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
          <AgentIcon size={15} className="text-brand-600" strokeWidth={1.75} />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ekthos-black leading-tight truncate">
            {agentName}
          </p>
          <p className="text-[10px] leading-tight" style={{ color: 'rgba(0,0,0,0.35)' }}>
            {isBusy ? 'digitando…' : 'online'}
          </p>
        </div>

        {/* Nova conversa */}
        <button
          onClick={onNewConversation}
          className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 px-2.5 py-1.5 rounded-lg hover:bg-brand-50 transition-colors shrink-0"
          title="Nova conversa"
        >
          <Plus size={13} strokeWidth={2.5} />
          <span className="hidden sm:inline">Nova conversa</span>
        </button>
      </div>

      {/* ── Mensagens ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-3">

        {/* Empty state */}
        {isEmpty && (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center select-none">
            <div
              className="h-16 w-16 rounded-2xl flex items-center justify-center mb-5"
              style={{ background: 'rgba(225,53,0,0.06)', border: '1px solid rgba(225,53,0,0.12)' }}
            >
              <AgentIcon size={30} className="text-brand-500" strokeWidth={1.5} />
            </div>
            <p className="text-sm font-semibold text-ekthos-black">{agentName}</p>
            <p className="text-xs mt-1.5 max-w-[220px] leading-relaxed" style={{ color: 'rgba(0,0,0,0.4)' }}>
              Como posso te ajudar hoje?
            </p>
          </div>
        )}

        {/* Mensagens carregadas + enviadas */}
        {messages.map((msg, i) => (
          <MessageBubble key={msg.id ?? i} message={msg} />
        ))}

        {/* Streaming em progresso */}
        {isBusy && (
          <div className="flex items-end gap-2 justify-start">
            <div className="h-7 w-7 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <AgentIcon size={13} className="text-brand-600" strokeWidth={1.75} />
            </div>
            <div className="max-w-[85%] px-4 py-2.5 bg-cream-light rounded-2xl rounded-bl-sm border border-cream-dark/40 text-sm text-ekthos-black leading-relaxed">
              {streamingText
                ? <MessageText content={streamingText} />
                : <TypingDots />
              }
            </div>
          </div>
        )}

        {/* Erro */}
        {status === 'error' && errorMsg && (
          <div
            className="flex items-start gap-3 p-3 rounded-2xl"
            style={{ background: '#fff1f0', border: '1px solid #fca5a5' }}
          >
            <MessageCircle size={15} className="text-red-500 shrink-0 mt-0.5" strokeWidth={2} />
            <p className="text-sm text-red-700 flex-1">{errorMsg}</p>
            <button
              onClick={() => { setStatus('idle'); setErrorMsg(null) }}
              className="text-red-400 hover:text-red-600 transition-colors"
              title="Tentar novamente"
            >
              <RotateCcw size={14} strokeWidth={2} />
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ───────────────────────────────────────────── */}
      <div
        className="shrink-0 px-4 py-3"
        style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl px-4 py-2 transition-colors"
          style={{
            background: 'rgb(249,250,251)',
            border: '1px solid rgb(229,231,235)',
          }}
          onFocus={() => {/* handled by CSS focus-within */}}
        >
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            placeholder="Mensagem…"
            rows={1}
            disabled={isBusy}
            className="flex-1 resize-none bg-transparent text-sm text-ekthos-black placeholder-gray-400 outline-none py-1 max-h-[140px] disabled:opacity-50 leading-relaxed"
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!inputText.trim() || isBusy}
            className="shrink-0 h-8 w-8 rounded-xl bg-brand-600 text-white flex items-center justify-center disabled:opacity-35 disabled:cursor-not-allowed hover:bg-brand-700 active:scale-95 transition-all mb-0.5"
          >
            {isBusy
              ? <Loader2 size={14} className="animate-spin" strokeWidth={2} />
              : <Send size={14} strokeWidth={2} />
            }
          </button>
        </div>
        <p className="text-[10px] text-gray-400 text-center mt-1.5 select-none">
          Enter para enviar · Shift+Enter para nova linha
        </p>
      </div>
    </div>
  )
}
