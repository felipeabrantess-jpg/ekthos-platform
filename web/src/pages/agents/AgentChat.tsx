/**
 * AgentChat.tsx — /agentes/:slug/conversar[/:sessionId]
 *
 * Layout responsivo:
 *  md+: AgentChatHistory (240px) + AgentChatInterface (flex-1)
 *  <md: AgentChatInterface fullscreen + botão para abrir drawer de histórico
 *
 * Sessões:
 *  - Sem sessionId: redireciona para a sessão mais recente (se existir)
 *    ou cria estado vazio (nova conversa na primeira mensagem).
 *  - Com sessionId: carrega mensagens por time-range.
 *  - "Nova conversa": cria session no DB, navega para novo sessionId.
 *  - isNewSession = true → primeira mensagem enviada com clear_history=true.
 *
 * Guarda de acesso: verifica hasAgent(slug) via usePlan.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { History, Lock } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { usePlan } from '@/hooks/usePlan'
import { useAuth } from '@/hooks/useAuth'
import { getAgentContent } from '@/lib/agents-content'
import { loadAgentMessages, type ChatMessage } from '@/lib/agent-chat-client'
import { AgentChatInterface } from '@/components/agents/AgentChatInterface'
import { AgentChatHistory, type ChatSession } from '@/components/agents/AgentChatHistory'
import Spinner from '@/components/ui/Spinner'

// ── AgentChat ──────────────────────────────────────────────────────────────────

export default function AgentChat() {
  const { slug, sessionId } = useParams<{ slug: string; sessionId?: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { hasAgent, isLoading: planLoading } = usePlan()

  const content = slug ? getAgentContent(slug) : undefined

  const [currentSession, setCurrentSession]   = useState<ChatSession | null>(null)
  const [messages, setMessages]               = useState<ChatMessage[]>([])
  const [loadingSession, setLoadingSession]   = useState(true)
  const [isNewSession, setIsNewSession]       = useState(false)
  const [showHistory, setShowHistory]         = useState(false)

  // ── Carrega sessão ───────────────────────────────────────────────────────
  const loadSession = useCallback(async () => {
    if (!slug || !user) return
    setLoadingSession(true)

    if (sessionId) {
      const { data: session } = await supabase
        .from('agent_chat_sessions')
        .select('id, title, last_message_at, created_at')
        .eq('id', sessionId)
        .single()

      if (!session) {
        navigate(`/agentes/${slug}/conversar`, { replace: true })
        setLoadingSession(false)
        return
      }

      const s = session as ChatSession
      setCurrentSession(s)
      setIsNewSession(false)

      // Busca sessão SEGUINTE para delimitar o time-range
      const { data: nextRows } = await supabase
        .from('agent_chat_sessions')
        .select('created_at')
        .eq('agent_slug', slug)
        .eq('user_id', user.id)
        .gt('created_at', s.created_at)
        .order('created_at', { ascending: true })
        .limit(1)

      const nextAt = (nextRows as { created_at: string }[] | null)?.[0]?.created_at

      // Carrega mensagens no intervalo desta sessão
      let q = supabase
        .from('agent_conversations')
        .select('id, role, content, created_at')
        .eq('agent_slug', slug)
        .eq('user_id', user.id)
        .gte('created_at', s.created_at)
        .order('created_at', { ascending: true })
        .limit(100)

      if (nextAt) q = q.lt('created_at', nextAt)

      const { data: msgs } = await q
      setMessages((msgs ?? []) as ChatMessage[])

    } else {
      // Sem sessionId: tenta redirecionar para sessão mais recente
      const { data: latestRows } = await supabase
        .from('agent_chat_sessions')
        .select('id')
        .eq('agent_slug', slug)
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('last_message_at', { ascending: false })
        .limit(1)

      const latestId = (latestRows as { id: string }[] | null)?.[0]?.id

      if (latestId) {
        navigate(`/agentes/${slug}/conversar/${latestId}`, { replace: true })
      } else {
        // Primeira visita: mostra histórico plano (sem sessão)
        const existingMsgs = await loadAgentMessages(slug, user.id, 60)
        setMessages(existingMsgs)
        setCurrentSession(null)
        setIsNewSession(true)
      }
    }

    setLoadingSession(false)
  }, [slug, sessionId, user, navigate])

  useEffect(() => { void loadSession() }, [loadSession])

  // ── Nova conversa ────────────────────────────────────────────────────────
  const handleNewConversation = useCallback(async () => {
    if (!slug || !user) return

    const churchId = user.app_metadata?.church_id as string | undefined
    if (!churchId) return

    const { data: newSession } = await supabase
      .from('agent_chat_sessions')
      .insert({
        agent_slug: slug,
        user_id:    user.id,
        church_id:  churchId,
        title:      'Nova conversa',
      })
      .select('id')
      .single()

    if (newSession) {
      setShowHistory(false)
      navigate(`/agentes/${slug}/conversar/${(newSession as { id: string }).id}`)
    }
  }, [slug, user, navigate])

  // ── Selecionar sessão ────────────────────────────────────────────────────
  const handleSelectSession = useCallback((session: ChatSession) => {
    setShowHistory(false)
    navigate(`/agentes/${slug}/conversar/${session.id}`)
  }, [slug, navigate])

  // ── Após primeira mensagem — atualiza título + last_message_at ────────────
  const handleMessageSent = useCallback(async (firstMsg?: string) => {
    const targetId = sessionId ?? currentSession?.id
    if (!targetId) return

    const updates: { last_message_at: string; title?: string } = { last_message_at: new Date().toISOString() }

    // Atualiza título se ainda está default e temos o texto da primeira mensagem
    if (firstMsg) {
      const title = firstMsg.length > 40 ? firstMsg.slice(0, 40) + '…' : firstMsg
      updates.title = title
    }

    await supabase
      .from('agent_chat_sessions')
      .update(updates)
      .eq('id', targetId)

    setCurrentSession(prev =>
      prev ? { ...prev, last_message_at: updates.last_message_at, title: updates.title ?? prev.title } : null
    )
  }, [sessionId, currentSession?.id])

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!content || !slug) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-ekthos-black/50">Agente não encontrado.</p>
        <Link to="/agentes" className="mt-3 text-xs text-brand-600 hover:underline">← Voltar</Link>
      </div>
    )
  }

  if (planLoading) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!hasAgent(slug)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center max-w-sm mx-auto">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4"
          style={{ background: 'rgba(225,53,0,0.06)', border: '1px solid rgba(225,53,0,0.12)' }}
        >
          <Lock size={22} className="text-brand-400" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-semibold text-ekthos-black">Acesso restrito</p>
        <p className="text-xs text-ekthos-black/50 mt-1.5 leading-relaxed max-w-[200px]">
          Você ainda não tem acesso ao {content.name}.
        </p>
        <Link
          to={`/agentes/${slug}`}
          className="mt-4 text-xs font-medium text-brand-600 hover:text-brand-700 underline"
        >
          Ver detalhes e contratar →
        </Link>
      </div>
    )
  }

  if (loadingSession) {
    return (
      <div className="flex items-center justify-center h-full py-24">
        <Spinner size="lg" />
      </div>
    )
  }

  const { Icon: AgentIcon } = content

  // ── Layout ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* Histórico — desktop sempre visível */}
      <div className="hidden md:flex shrink-0" style={{ width: 240 }}>
        <AgentChatHistory
          agentSlug={slug}
          currentSessionId={currentSession?.id ?? sessionId ?? null}
          onNewConversation={() => void handleNewConversation()}
          onSelectSession={handleSelectSession}
        />
      </div>

      {/* Drawer histórico — mobile overlay */}
      {showHistory && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setShowHistory(false)}
          />
          <div
            className="fixed left-0 top-0 bottom-0 z-40 w-64 shadow-xl md:hidden"
          >
            <AgentChatHistory
              agentSlug={slug}
              currentSessionId={currentSession?.id ?? sessionId ?? null}
              onNewConversation={() => void handleNewConversation()}
              onSelectSession={handleSelectSession}
              onClose={() => setShowHistory(false)}
            />
          </div>
        </>
      )}

      {/* Chat principal */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Botão histórico — só mobile */}
        <button
          onClick={() => setShowHistory(true)}
          className="absolute top-3.5 left-4 z-10 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors md:hidden"
          title="Histórico de conversas"
          aria-label="Ver histórico"
        >
          <History size={18} strokeWidth={1.75} />
        </button>

        <AgentChatInterface
          agentSlug={slug}
          agentName={content.name}
          AgentIcon={AgentIcon}
          initialMessages={messages}
          isNewSession={isNewSession}
          onNewConversation={() => void handleNewConversation()}
          onMessageSent={(firstMsg) => void handleMessageSent(firstMsg)}
        />
      </div>
    </div>
  )
}
