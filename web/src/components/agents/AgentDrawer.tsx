/**
 * AgentDrawer.tsx — Drawer flutuante Intercom-style para o Assistente Pastoral
 *
 * Flutua no canto inferior direito (z-40). Não empurra o layout.
 * Usa agent-acolhimento-chat via AgentChatInterface (SSE streaming).
 * R-PREMIUM-GUARD aplicado na EF — aqui só exibe mensagem 403 se sem acesso.
 */

import { useEffect, useState, useRef } from 'react'
import { HeartHandshake } from 'lucide-react'
import { AgentChatInterface } from './AgentChatInterface'
import { useAgentDrawer } from '@/contexts/AgentDrawerContext'
import { useAuth } from '@/hooks/useAuth'
import { loadAgentMessages, type ChatMessage } from '@/lib/agent-chat-client'

const AGENT_SLUG = 'agent-acolhimento-chat'
const AGENT_NAME = 'Assistente Pastoral'

export function AgentDrawer() {
  const { isOpen, close } = useAgentDrawer()
  const { user }          = useAuth()

  const [messages,      setMessages]      = useState<ChatMessage[]>([])
  const [isNewSession,  setIsNewSession]  = useState(false)
  const loadedRef = useRef(false)

  // Carrega histórico somente uma vez ao abrir pela primeira vez
  useEffect(() => {
    if (isOpen && user && !loadedRef.current) {
      loadedRef.current = true
      loadAgentMessages(AGENT_SLUG, user.id).then(msgs => {
        setMessages(msgs)
        setIsNewSession(msgs.length === 0)
      })
    }
  }, [isOpen, user])

  function handleNewConversation() {
    setMessages([])
    setIsNewSession(true)
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop invisível — fecha ao clicar fora */}
      <div
        className="fixed inset-0 z-30"
        onClick={close}
        aria-hidden="true"
      />

      {/* Drawer flutuante */}
      <div
        className="fixed bottom-6 right-6 z-40 flex flex-col rounded-2xl overflow-hidden"
        style={{
          width: 380,
          height: 560,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <AgentChatInterface
          agentSlug={AGENT_SLUG}
          agentName={AGENT_NAME}
          AgentIcon={HeartHandshake}
          initialMessages={messages}
          isNewSession={isNewSession}
          onNewConversation={handleNewConversation}
        />
      </div>
    </>
  )
}
