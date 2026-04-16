import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Send, Bot, Trash2, Loader, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePlan } from '@/hooks/usePlan'

// ── Tipos ───────────────────────────────────────────────────

interface ChatMessage {
  id:        string
  role:      'user' | 'assistant'
  content:   string
  streaming?: boolean
}

interface AgentChatWidgetProps {
  agentSlug:  string
  agentName:  string
  isOpen:     boolean
  onClose:    () => void
}

// ── Helpers ─────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2)
}

// ── Componente principal ────────────────────────────────────
// Usa createPortal para renderizar direto no document.body,
// garantindo que position: fixed funcione sem ser afetado por
// stacking contexts da Sidebar (sticky, overflow, etc.).

export default function AgentChatWidget({
  agentSlug,
  agentName,
  isOpen,
  onClose,
}: AgentChatWidgetProps) {
  const { churchId } = useAuth()
  const [messages,    setMessages]    = useState<ChatMessage[]>([])
  const [input,       setInput]       = useState('')
  const [loading,     setLoading]     = useState(false)
  const [histLoading, setHistLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const abortRef  = useRef<AbortController | null>(null)

  // Scroll para o final sempre que messages mudar
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus no input ao abrir
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  // Carrega histórico do Supabase ao abrir
  useEffect(() => {
    if (!isOpen || !churchId) return

    async function loadHistory() {
      setHistLoading(true)
      try {
        const { data } = await supabase
          .from('agent_conversations')
          .select('id, role, content')
          .eq('church_id', churchId!)
          .eq('agent_slug', agentSlug)
          .order('created_at', { ascending: false })
          .limit(20)

        if (data && data.length > 0) {
          setMessages(
            data.reverse().map(m => ({
              id:      m.id,
              role:    m.role as 'user' | 'assistant',
              content: m.content,
            }))
          )
        } else if (messages.length === 0) {
          // Mensagem de boas-vindas quando não há histórico
          setMessages([{
            id:      uid(),
            role:    'assistant',
            content: `Olá! Sou o agente **${agentName}**. Como posso ajudar você hoje?`,
          }])
        }
      } finally {
        setHistLoading(false)
      }
    }

    void loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, churchId, agentSlug])

  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading || !churchId) return

    const userText = input.trim()
    setInput('')
    setLoading(true)

    const userMsgId = uid()
    setMessages(prev => [...prev, { id: userMsgId, role: 'user', content: userText }])

    const assistantMsgId = uid()
    setMessages(prev => [...prev, { id: assistantMsgId, role: 'assistant', content: '', streaming: true }])

    abortRef.current?.abort()
    const abortCtrl = new AbortController()
    abortRef.current = abortCtrl

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${agentSlug}`, {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body:   JSON.stringify({ message: userText }),
        signal: abortCtrl.signal,
      })

      if (!res.ok || !res.body) {
        throw new Error('Erro ao conectar com o agente')
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type:    string
              content?: string
              message?: string
            }

            if (evt.type === 'token' && evt.content) {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId
                  ? { ...m, content: m.content + evt.content }
                  : m
              ))
            } else if (evt.type === 'done') {
              setMessages(prev => prev.map(m =>
                m.id === assistantMsgId ? { ...m, streaming: false } : m
              ))
            } else if (evt.type === 'error') {
              throw new Error(evt.message ?? 'Erro no agente')
            }
          } catch {
            // JSON parse error — ignora linha malformada
          }
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') return

      const errMsg = (err as { message?: string }).message ?? 'Erro ao enviar mensagem'
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, content: errMsg, streaming: false }
          : m
      ))
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }, [input, loading, churchId, agentSlug])

  async function clearHistory() {
    if (!churchId) return
    setMessages([])
    await supabase
      .from('agent_conversations')
      .delete()
      .eq('church_id', churchId)
      .eq('agent_slug', agentSlug)

    setMessages([{
      id:      uid(),
      role:    'assistant',
      content: 'Histórico limpo. Como posso ajudar?',
    }])
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  if (!isOpen) return null

  // Portal: renderiza fora do DOM da Sidebar para evitar
  // que stacking contexts (sticky, overflow) afetem z-index e position:fixed
  return createPortal(
    <>
      {/* Overlay transparente para fechar ao clicar fora */}
      <div
        className="fixed inset-0 z-[998]"
        onClick={onClose}
      />

      {/* Drawer — z-[999] garante que fica acima de qualquer card ou overlay */}
      <div
        className="fixed right-0 top-0 h-screen w-[380px] z-[999] flex flex-col shadow-2xl border-l border-black/10"
        style={{ background: '#FFFFFF' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 shrink-0 border-b border-black/[0.06]"
          style={{ background: '#161616' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: '#e13500' }}
            >
              <Bot size={14} strokeWidth={1.75} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{agentName}</p>
              <p className="text-[10px]" style={{ color: 'rgba(249,238,220,0.5)' }}>
                Ekthos AI · Haiku
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void clearHistory()}
              title="Limpar conversa"
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'rgba(249,238,220,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.4)')}
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: 'rgba(249,238,220,0.4)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.8)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.4)')}
            >
              <X size={14} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3" style={{ background: '#f9eedc' }}>
          {histLoading && (
            <div className="flex items-center justify-center h-20">
              <Loader size={18} strokeWidth={1.75} className="animate-spin" style={{ color: '#e13500' }} />
            </div>
          )}

          {!histLoading && messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mr-2 mt-0.5"
                  style={{ background: '#e13500' }}
                >
                  <Bot size={11} strokeWidth={2} className="text-white" />
                </div>
              )}
              <div
                className={`max-w-[80%] px-3 py-2.5 rounded-2xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'rounded-tr-sm text-white'
                    : 'rounded-tl-sm text-gray-800 border border-black/[0.06]'
                }`}
                style={msg.role === 'user'
                  ? { background: '#e13500' }
                  : { background: '#FFFFFF' }
                }
              >
                {msg.content
                  ? msg.content.split('\n').map((line, i) => (
                    <span key={i}>
                      {line}
                      {i < msg.content.split('\n').length - 1 && <br />}
                    </span>
                  ))
                  : msg.streaming
                    ? <span className="inline-block w-2 h-4 animate-pulse rounded-sm" style={{ background: '#e13500', opacity: 0.5 }} />
                    : null
                }
                {msg.streaming && msg.content && (
                  <span className="inline-block w-1.5 h-3.5 ml-0.5 animate-pulse rounded-sm align-middle" style={{ background: '#e13500', opacity: 0.6 }} />
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-black/[0.06] shrink-0 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte algo..."
              rows={1}
              disabled={loading}
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50"
              style={{
                maxHeight: '120px',
                '--tw-ring-color': '#e13500',
              } as React.CSSProperties}
              onInput={e => {
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`
              }}
            />
            <button
              onClick={() => void sendMessage()}
              disabled={loading || !input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-all disabled:opacity-40"
              style={{ background: '#e13500' }}
            >
              {loading
                ? <Loader size={15} strokeWidth={2} className="text-white animate-spin" />
                : <Send   size={15} strokeWidth={2} className="text-white" />
              }
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 text-center">
            Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      </div>
    </>,
    document.body
  )
}

// ── Botão flutuante para acionar o widget ──────────────────
// O ponto colorido indica o status do agente baseado em
// subscription_agents.active — sem health check externo.
//   Verde  = agente ativo na subscription
//   Cinza  = agente inativo / não ativado

interface AgentChatButtonProps {
  agentSlug:  string
  agentName:  string
}

export function AgentChatButton({ agentSlug, agentName }: AgentChatButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const { hasAgent } = usePlan()

  // Status vem do banco (subscription_agents), não de health check externo
  const isConnected = hasAgent(agentSlug)

  return (
    <>
      <button
        onClick={() => setIsOpen(s => !s)}
        title={agentName}
        className="relative flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all w-full"
        style={{
          color:      isOpen ? '#fff' : 'rgba(249,238,220,0.5)',
          background: isOpen ? 'rgba(255,255,255,0.08)' : 'transparent',
        }}
        onMouseEnter={e => {
          if (!isOpen) e.currentTarget.style.color = 'rgba(249,238,220,0.8)'
          if (!isOpen) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
        }}
        onMouseLeave={e => {
          if (!isOpen) e.currentTarget.style.color = 'rgba(249,238,220,0.5)'
          if (!isOpen) e.currentTarget.style.background = 'transparent'
        }}
      >
        <MessageCircle size={16} strokeWidth={1.75} />
        <span className="flex-1 text-left">{agentName}</span>
        {/* Ponto de status: verde = conectado (ativo no banco), cinza = inativo */}
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
          style={{ background: isConnected ? '#4ade80' : 'rgba(255,255,255,0.2)' }}
          title={isConnected ? 'Conectado' : 'Inativo'}
        />
      </button>

      <AgentChatWidget
        agentSlug={agentSlug}
        agentName={agentName}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  )
}
