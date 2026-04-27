/**
 * AgentDetail.tsx — /agentes/:slug
 *
 * Estados:
 *  - "active"       → agente em uso; painel lateral de chat abre ao clicar
 *  - "contractable" → elegível, não ativo; CTA "Contratar" disabled + tooltip "Em breve"
 *  - "module-bound" → vinculado a módulo; CTA aponta para /modulos/:moduleId
 *  - "unavailable"  → plano incompatível (ex: agent-whatsapp no Missão)
 *
 * Regras:
 *  - "Testar 7 dias grátis" DESABILITADO (placeholder Fase 6)
 *  - Não exibe preço se agent-whatsapp e plano != avivamento (apenas explica)
 */

import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Lock, MessageCircle } from 'lucide-react'
import { usePlan } from '@/hooks/usePlan'
import { getAgentContent } from '@/lib/agents-content'
import Button from '@/components/ui/Button'

// ── Helpers ──────────────────────────────────────────────────────────────────

type AgentState = 'active' | 'contractable' | 'module-bound' | 'unavailable'

function getAgentState(
  slug: string,
  hasAgent: (s: string) => boolean,
  planSlug: string,
  moduleId?: string
): AgentState {
  // Whatsapp exclusivo Avivamento
  if (slug === 'agent-whatsapp' && planSlug !== 'avivamento') return 'unavailable'
  if (hasAgent(slug)) return 'active'
  if (moduleId) return 'module-bound'
  return 'contractable'
}

function formatPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

// ── CTA por estado ────────────────────────────────────────────────────────────

function AgentCTA({
  state,
  slug,
  moduleId,
  planSlug,
}: {
  state: AgentState
  slug: string
  moduleId?: string
  planSlug: string
}) {
  if (state === 'active') {
    // Abre o chat widget (o botão existe na sidebar; aqui apenas info)
    return (
      <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-2xl">
        <CheckCircle2 size={20} className="text-green-500 shrink-0" strokeWidth={2} />
        <div>
          <p className="text-sm font-semibold text-green-800">Agente ativo</p>
          <p className="text-xs text-green-600 mt-0.5">
            Clique no agente na barra lateral para abrir o chat.
          </p>
        </div>
      </div>
    )
  }

  if (state === 'module-bound') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-4 bg-brand-50 border border-brand-100 rounded-2xl">
          <Lock size={18} className="text-brand-400 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold text-brand-900">Disponível no módulo</p>
            <p className="text-xs text-brand-600 mt-0.5">
              Este agente faz parte de um módulo pago. Conheça o módulo para ver tudo o que ele inclui.
            </p>
          </div>
        </div>
        <Link to={`/modulos/${moduleId}`}>
          <Button variant="primary" className="w-full">
            Ver módulo
          </Button>
        </Link>
      </div>
    )
  }

  if (state === 'unavailable') {
    return (
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
        <Lock size={18} className="text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div>
          <p className="text-sm font-semibold text-amber-900">Exclusivo do plano Avivamento</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Este agente está disponível apenas no plano Avivamento.
            {planSlug !== 'avivamento' && ' Faça upgrade para desbloquear.'}
          </p>
        </div>
      </div>
    )
  }

  // contractable — CTA desabilitado "Em breve"
  return (
    <div className="space-y-3">
      <div className="group relative">
        <Button variant="primary" disabled className="w-full cursor-not-allowed opacity-60">
          Contratar agente — Em breve
        </Button>
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10"
          style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.1)' }}
        >
          Contratação de agentes via app em breve
        </div>
      </div>
      <p className="text-center text-xs text-ekthos-black/30">
        Por enquanto, fale com o time Ekthos para contratar.
      </p>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { hasAgent, planSlug, isLoading, allAgents } = usePlan()

  const content = slug ? getAgentContent(slug) : undefined

  // Verifica se slug existe no catálogo DB
  const catalogAgent = allAgents.find(a => a.slug === slug)

  if (!content || !catalogAgent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-ekthos-black/50">Agente não encontrado.</p>
        <Link to="/agentes" className="mt-3 text-xs text-brand-600 hover:underline">
          ← Voltar para Agentes
        </Link>
      </div>
    )
  }

  const state = getAgentState(slug!, hasAgent, planSlug, content.moduleId)
  const { Icon } = content

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-ekthos-black/40 hover:text-ekthos-black/70 transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={2} />
        Agentes IA
      </button>

      {/* Hero */}
      <div className="flex items-start gap-5">
        <div
          className="h-14 w-14 rounded-2xl border flex items-center justify-center shrink-0"
          style={{ background: 'rgba(225,53,0,0.06)', borderColor: 'rgba(225,53,0,0.12)' }}
        >
          <Icon size={26} className="text-brand-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold text-ekthos-black">{content.name}</h1>
            {content.badge && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                {content.badge}
              </span>
            )}
          </div>
          <p className="text-sm text-ekthos-black/55 mt-1">{content.shortDesc}</p>
          {content.price && state === 'contractable' && (
            <p className="text-sm font-bold text-brand-600 mt-2">
              {formatPrice(content.price)}/mês
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      {!isLoading && (
        <AgentCTA
          state={state}
          slug={slug!}
          moduleId={content.moduleId}
          planSlug={planSlug}
        />
      )}

      {/* Descrição */}
      <div className="bg-white border border-cream-dark/60 rounded-2xl p-5 space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">O que faz</h2>
          <p className="text-sm text-ekthos-black/70 leading-relaxed">{content.longDesc}</p>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Como funciona</h2>
          <ul className="space-y-2">
            {content.howItWorks.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className="mt-0.5 h-4 w-4 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-brand-700">{i + 1}</span>
                </div>
                <span className="text-sm text-ekthos-black/65">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">Para quem</h2>
          <p className="text-sm text-ekthos-black/60 leading-relaxed">{content.forWhom}</p>
        </div>

        {content.note && (
          <div className="flex items-start gap-2.5 p-3 bg-brand-50 border border-brand-100 rounded-xl">
            <MessageCircle size={14} className="text-brand-500 shrink-0 mt-0.5" strokeWidth={1.75} />
            <p className="text-xs text-brand-700 leading-relaxed">{content.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
