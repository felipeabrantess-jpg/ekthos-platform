/**
 * AgentDrawer.tsx — Drawer flutuante operacional (Suporte 24h, Cadastro Inteligente)
 *
 * FIX 1: backdrop pointer-events:none — sidebar permanece clicável com drawer aberto
 * FIX 2: header exibe nome comercial canônico do agente ativo
 * FIX 3: lista filtra premium pastorais — somente agentes internos operacionais
 *
 * Agentes premium pastorais (agent-acolhimento, agent-reengajamento, agent-operacao)
 * NUNCA aparecem aqui. Eles existem apenas em /agentes (catálogo de contratação).
 *
 * Fecha via: X no header da lista, botão toggle da sidebar, ou tecla ESC.
 */

import { useEffect, useState, useRef } from 'react'
import { X } from 'lucide-react'
import { AgentChatInterface } from './AgentChatInterface'
import { useAgentDrawer } from '@/contexts/AgentDrawerContext'
import { useAuth } from '@/hooks/useAuth'
import { useChurch } from '@/hooks/useChurch'
import { loadAgentMessages, type ChatMessage } from '@/lib/agent-chat-client'
import { INTERNAL_AGENTS, type AgentContent } from '@/lib/agents-content'

// Nomes comerciais canônicos para o header do drawer (FIX 2)
const DRAWER_NAMES: Record<string, string> = {
  'agent-suporte':    'Suporte 24h',
  'agent-onboarding': 'Onboarding de Líderes',
  'agent-cadastro':   'Cadastro Inteligente',
}

// Agentes premium pastorais — NUNCA no drawer (FIX 3)
const PREMIUM_SLUGS = new Set(['agent-acolhimento', 'agent-reengajamento', 'agent-operacao'])

// ── AgentSelectionCard ────────────────────────────────────────────────────────

function AgentSelectionCard({
  agent,
  onSelect,
}: {
  agent:    AgentContent
  onSelect: (slug: string) => void
}) {
  const { Icon } = agent
  const name = DRAWER_NAMES[agent.slug] ?? agent.name
  return (
    <button
      onClick={() => onSelect(agent.slug)}
      className="w-full flex items-start gap-3 p-4 rounded-2xl text-left transition-all hover:shadow-sm active:scale-[0.99]"
      style={{ background: 'white', border: '1px solid rgba(0,0,0,0.07)' }}
    >
      <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-brand-600" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ekthos-black leading-tight">{name}</p>
        <p className="text-xs text-ekthos-black/50 mt-0.5 line-clamp-2 leading-relaxed">
          {agent.shortDesc}
        </p>
      </div>
    </button>
  )
}

// ── AgentListView ─────────────────────────────────────────────────────────────

function AgentListView({
  agents,
  onSelect,
  onClose,
}: {
  agents:   AgentContent[]
  onSelect: (slug: string) => void
  onClose:  () => void
}) {
  return (
    <div className="flex flex-col h-full bg-white">
      <div
        className="flex items-center justify-between px-4 h-14 shrink-0"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
      >
        <p className="text-sm font-semibold text-ekthos-black">Agentes</p>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          title="Fechar"
        >
          <X size={16} strokeWidth={2} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {agents.map(agent => (
          <AgentSelectionCard key={agent.slug} agent={agent} onSelect={onSelect} />
        ))}
      </div>
    </div>
  )
}

// ── AgentDrawer ───────────────────────────────────────────────────────────────

export function AgentDrawer() {
  const { isOpen, close } = useAgentDrawer()
  const { user }          = useAuth()
  const { data: church }  = useChurch()

  const [activeAgentSlug, setActiveAgentSlug] = useState<string | null>(null)
  const [messages,        setMessages]        = useState<ChatMessage[]>([])
  const [isNewSession,    setIsNewSession]    = useState(false)
  const loadedRef = useRef<Record<string, boolean>>({})

  // Agentes visíveis no drawer — filtra premium e respeita onboarding_step (FIX 3)
  const drawerAgents = INTERNAL_AGENTS.filter(a => {
    if (PREMIUM_SLUGS.has(a.slug)) return false
    if (a.slug === 'agent-onboarding' && church?.onboarding_step === 'completed') return false
    return true
  })

  // ESC fecha drawer
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  // Carrega histórico na primeira abertura do agente
  useEffect(() => {
    if (!activeAgentSlug || !user || loadedRef.current[activeAgentSlug]) return
    loadedRef.current[activeAgentSlug] = true
    loadAgentMessages(activeAgentSlug, user.id).then(msgs => {
      setMessages(msgs)
      setIsNewSession(msgs.length === 0)
    })
  }, [activeAgentSlug, user])

  function selectAgent(slug: string) {
    if (slug !== activeAgentSlug) {
      setMessages([])
      setIsNewSession(false)
    }
    setActiveAgentSlug(slug)
  }

  function handleBack() {
    setActiveAgentSlug(null)
  }

  function handleNewConversation() {
    if (activeAgentSlug) loadedRef.current[activeAgentSlug] = false
    setMessages([])
    setIsNewSession(true)
  }

  if (!isOpen) return null

  const activeAgent = drawerAgents.find(a => a.slug === activeAgentSlug)

  return (
    <>
      {/* Backdrop passthrough — pointer-events:none para sidebar permanecer clicável (FIX 1) */}
      <div className="fixed inset-0 z-30 pointer-events-none" aria-hidden="true" />

      {/* Drawer flutuante */}
      <div
        className="fixed bottom-6 right-6 z-40 flex flex-col rounded-2xl overflow-hidden"
        style={{
          width:     380,
          height:    560,
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.28), 0 0 0 1px rgba(0,0,0,0.06)',
        }}
      >
        {activeAgentSlug && activeAgent ? (
          <AgentChatInterface
            agentSlug={activeAgentSlug}
            agentName={DRAWER_NAMES[activeAgentSlug] ?? activeAgent.name}
            AgentIcon={activeAgent.Icon}
            initialMessages={messages}
            isNewSession={isNewSession}
            onBack={handleBack}
            onNewConversation={handleNewConversation}
          />
        ) : (
          <AgentListView
            agents={drawerAgents}
            onSelect={selectAgent}
            onClose={close}
          />
        )}
      </div>
    </>
  )
}
